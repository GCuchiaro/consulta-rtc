"""Servidor MCP público (Streamable HTTP em /mcp/).

Permite perguntar ao Claude (ou outro cliente MCP) sobre a tributação de
produtos e serviços na Reforma Tributária, com dados da calculadora oficial.
"""
from __future__ import annotations

import os
from datetime import date

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from pydantic import ValidationError

from .calculadora import EntradaInvalida, NaoEncontrado
from .simulador import Simulacao

AVISO = ("Fonte: Calculadora de Tributos oficial da Receita Federal (código aberto, sem modificações), "
         "consultada pelo projeto independente Consulta RTC. Não substitui orientação profissional.")


def _seguranca_transporte() -> TransportSecuritySettings:
    """Proteção contra DNS rebinding do SDK: aceita localhost e os domínios de MCP_HOSTS
    (separados por vírgula, ex.: "rtc.giovannicuchiaro.com")."""
    hosts = [h.strip() for h in os.getenv("MCP_HOSTS", "").split(",") if h.strip()]
    locais = ["localhost", "127.0.0.1"]
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[*hosts, *locais, *(f"{h}:*" for h in locais)],
        allowed_origins=[*(f"https://{h}" for h in hosts), *(f"http://{h}:*" for h in locais)],
    )


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
        transport_security=_seguranca_transporte(),
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

    @mcp.tool()
    async def simular_operacao(uf: str, municipio_ibge: int, itens: list[dict], data: str | None = None,
                               aliquota_cbs: float | None = None, aliquota_ibs_estadual: float | None = None,
                               aliquota_ibs_municipal: float | None = None) -> dict:
        """Calcula CBS, IBS e Imposto Seletivo de uma operação do regime regular na calculadora oficial.

        itens: lista de {"tipo": "ncm"|"nbs", "codigo": "...", "valor": 100.0, "cClassTrib": "000001"
        (opcional), "quantidade": 1 (opcional), "aliquotaIS": 10.0 (só se incide IS, a partir de 2027)}.
        Em 2026 usa as alíquotas de teste oficiais. A partir de 2027 a calculadora exige as alíquotas
        nominais (aliquota_cbs, aliquota_ibs_estadual, aliquota_ibs_municipal); o resultado sai como simulado.
        Use consultar_produto/consultar_servico antes para escolher o cClassTrib certo.
        """
        dados: dict = {"data": data or date.today().isoformat(), "uf": uf, "municipio": municipio_ibge,
                       "itens": itens}
        if aliquota_cbs is not None:
            dados["aliquotas"] = {"cbs": aliquota_cbs, "ibsEstadual": aliquota_ibs_estadual or 0,
                                  "ibsMunicipal": aliquota_ibs_municipal or 0}
        try:
            simulacao = Simulacao(**dados)
        except ValidationError as e:
            return {"erro": "; ".join(str(x["msg"]).removeprefix("Value error, ") for x in e.errors())}
        try:
            r = await consultas_fn().simular(simulacao)
        except EntradaInvalida as e:
            return {"erro": str(e), "detalhes": e.detalhes}
        r.pop("oficial", None)
        return {**r, "aviso": AVISO}

    return mcp
