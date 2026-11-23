"""Servidor MCP público (Streamable HTTP em /mcp/).

Permite perguntar ao Claude (ou outro cliente MCP) sobre a tributação de
produtos e serviços na Reforma Tributária, com dados da calculadora oficial.
"""
from __future__ import annotations

from datetime import date

from mcp.server.fastmcp import FastMCP

from .calculadora import NaoEncontrado
from .servico import Consultas

AVISO = ("Fonte: Calculadora de Tributos oficial da Receita Federal (código aberto, sem modificações), "
         "consultada pelo projeto independente Consulta RTC. Não substitui orientação profissional.")


def _data(d: str | None) -> date:
    return date.fromisoformat(d) if d else date.today()


def criar_mcp(consultas_fn) -> FastMCP:
    """`consultas_fn` devolve a instância de Consultas criada no startup da API."""
    mcp = FastMCP(
        "consulta-rtc",
        instructions=(
            "Consulta a tributação de produtos (NCM) e serviços (NBS) na Reforma Tributária do Consumo "
            "(CBS, IBS e Imposto Seletivo, LC 214/2025). Fluxo: buscar_ncm_nbs pelo nome ou código, depois "
            "consultar_produto (NCM) ou consultar_servico (NBS) para ver as classificações tributárias "
            "(cClassTrib) com redução de alíquota ou tratamento específico. Datas no formato AAAA-MM-DD; "
            "sem data, usa hoje. " + AVISO
        ),
        stateless_http=True,
        json_response=True,
    )
    mcp.settings.streamable_http_path = "/"

    @mcp.tool()
    async def buscar_ncm_nbs(consulta: str, tipo: str = "todos", data: str | None = None) -> dict:
        """Busca NCM (produtos) e NBS (serviços) por código ou palavras da descrição.

        tipo: "todos", "ncm" ou "nbs".
        """
        r = await consultas_fn().buscar(consulta, tipo, _data(data), limite=15)
        return {**r, "aviso": AVISO}

    @mcp.tool()
    async def consultar_produto(ncm: str, data: str | None = None) -> dict:
        """Tributação de um produto pelo NCM. `classificacoes`: cClassTrib ligadas ao NCM que reduzem
        ou mudam a carga (redução, alíquota própria, crédito presumido). `outrasPermitidas`: também aceitas
        para o NCM, sem redução (para produtos com Imposto Seletivo, só essas são permitidas).
        Fora dessas hipóteses vale a regra geral 000001 (tributação integral)."""
        try:
            return {**await consultas_fn().item("ncm", ncm, _data(data)), "aviso": AVISO}
        except NaoEncontrado:
            return {"erro": f"NCM {ncm} não encontrado na data informada."}

    @mcp.tool()
    async def consultar_servico(nbs: str, data: str | None = None) -> dict:
        """Tributação de um serviço pelo código NBS: Imposto Seletivo e cClassTrib específicas aplicáveis."""
        try:
            return {**await consultas_fn().item("nbs", nbs, _data(data)), "aviso": AVISO}
        except NaoEncontrado:
            return {"erro": f"NBS {nbs} não encontrado na data informada."}

    @mcp.tool()
    async def consultar_classificacao(cclasstrib: str, data: str | None = None) -> dict:
        """Detalhes de uma classificação tributária (cClassTrib, 6 dígitos): descrição, tratamento,
        percentuais de redução, créditos presumidos e documentos fiscais em que pode ser usada."""
        try:
            return {**await consultas_fn().classificacao(cclasstrib, _data(data)), "aviso": AVISO}
        except NaoEncontrado:
            return {"erro": f"cClassTrib {cclasstrib} não encontrada na data informada."}

    return mcp
