"""Consultas de alto nível, usadas tanto pela API web quanto pelo servidor MCP."""
from __future__ import annotations

import asyncio
import functools
import re
from datetime import date

from .busca import buscar, formatar_nbs, formatar_ncm, so_digitos
from .calculadora import Calculadora, CalculadoraIndisponivel, NaoEncontrado, indice, limpar_descricao
from .simulador import INICIO_ALIQUOTAS_INFORMADAS, Simulacao, montar_operacao, simplificar

CLASSIFICACAO_PADRAO = "000001"  # tributação integral (regra geral)


def ligada_por_anexo(c: dict) -> bool:
    """A classificação vale para o código por constar de um anexo da LC 214 (benefício específico).

    Sem anexo, o código está numa lista de classificações permitidas (ex.: produtos com
    Imposto Seletivo só podem usar algumas cClassTrib), o que não é um benefício do produto.
    """
    return bool(c.get("_anexos")) or bool(c.get("_nfse"))


def anexos_conferidos(c: dict) -> list[dict]:
    """Anexos para exibir, descartando os que contradizem a própria classificação.

    No banco oficial (v. V0073) parte dos vínculos NBS→anexo aponta para o item errado
    (ex.: educação → "Vinhaça"). Se a descrição da classificação cita "(Anexo X)",
    só mostramos itens do Anexo X. O vínculo continua valendo para `ligada_por_anexo`.
    """
    anexos = c.get("_anexos") or []
    citado = re.search(r"\(Anexos? ([IVXL]+)", c.get("descricao") or "")
    if not citado:
        return anexos
    return [a for a in anexos if a.get("anexo") == citado.group(1)]


def resumo_classificacao(c: dict) -> dict:
    return {
        "cClassTrib": c.get("codigo"),
        "descricao": c.get("descricao"),
        "nomenclatura": c.get("nomenclatura"),
        "tratamento": c.get("descricaoTratamentoTributario"),
        "tipoAliquota": c.get("tipoAliquota"),
        "reducao": {
            "cbs": c.get("percentualReducaoCbs"),
            "ibsUf": c.get("percentualReducaoIbsUf"),
            "ibsMun": c.get("percentualReducaoIbsMun"),
        } if c.get("possuiPercentualReducao") else None,
        "creditoPresumidoFornecedor": c.get("indicaCreditoPresumidoFornecedor", False),
        "creditoPresumidoAdquirente": c.get("indicaCreditoPresumidoAdquirente", False),
        "anexos": anexos_conferidos(c),
        "origem": "Tabela da NFS-e" if c.get("_nfse") else ("Anexo da LC 214/2025" if c.get("_anexos") else None),
        "documentos": sorted({
            (d.get("sigla") or d.get("siglaDfe") or "")
            for d in (c.get("tiposDfeClassificacao") or []) if isinstance(d, dict)
        } - {""}),
    }


class Consultas:
    def __init__(self, calc: Calculadora):
        self.calc = calc
        self._indices: dict[tuple, list[dict]] = {}

    async def _itens(self, tipo: str, data: date) -> list[dict]:
        """Lista oficial de NCM/NBS vigentes, com o caminho hierárquico para busca e exibição."""
        lista = await (self.calc.ncms(data) if tipo == "ncm" else self.calc.nbss(data))
        chave = (tipo, data, id(lista))
        if chave not in self._indices:
            if len(self._indices) >= 8:
                self._indices.clear()
            campo = "ncm" if tipo == "ncm" else "codigo"
            itens = []
            for i in lista:
                codigo = i[campo]
                caminho = indice.caminho_de(tipo, codigo, data)
                desc = limpar_descricao(i.get("descricao"))
                itens.append({
                    "codigo": codigo,
                    "descricao": desc,
                    "caminho": caminho,
                    # campo usado só na busca textual: hierarquia + descrição
                    "_busca": " ".join([*caminho, desc]),
                })
            self._indices[chave] = itens
        return self._indices[chave]

    async def buscar(self, q: str, tipo: str, data: date, limite: int = 40) -> dict:
        resultado: dict[str, list] = {}
        for t in ("ncm", "nbs"):
            if tipo not in ("todos", t):
                continue
            fmt = formatar_ncm if t == "ncm" else formatar_nbs
            achados = buscar(await self._itens(t, data), q, "codigo", limite, campo_texto="_busca")
            resultado[t] = [
                {"codigo": i["codigo"], "codigoFormatado": fmt(i["codigo"]),
                 "descricao": i["descricao"], "caminho": i["caminho"],
                 "beneficios": self._beneficios(t, i["codigo"])}
                for i in achados
            ]
        if resultado.get("nbs"):
            # Serviços: a ficha também conta a tabela da NFS-e (ex.: profissões intelectuais).
            sem = [i for i in resultado["nbs"] if not i["beneficios"]]
            extras = await asyncio.gather(*(self._beneficios_nfse(i["codigo"], data) for i in sem))
            for i, n in zip(sem, extras):
                i["beneficios"] = n
        return resultado

    async def _beneficios_nfse(self, nbs: str, data: date) -> int:
        try:
            sit = await self.calc.nfse_situacoes(nbs, data)
        except CalculadoraIndisponivel:
            return 0
        return len({s.get("codigoClassificacaoTributaria") for s in sit} - {None, CLASSIFICACAO_PADRAO})

    @functools.lru_cache(maxsize=4096)
    def _beneficios(self, tipo: str, codigo: str) -> int:
        """Quantas classificações um anexo da LC 214 liga ao código (a ficha confirma cada uma)."""
        try:
            return sum(1 for c, anexos in indice.candidatas(tipo, codigo).items()
                       if anexos and c != CLASSIFICACAO_PADRAO)
        except CalculadoraIndisponivel:
            return 0

    async def item(self, tipo: str, codigo: str, data: date) -> dict:
        """Ficha de um NCM (produto) ou NBS (serviço) na data informada."""
        codigo = so_digitos(codigo)
        detalhe_coro = self.calc.ncm(codigo, data) if tipo == "ncm" else self.calc.nbs(codigo, data)
        itens, detalhe, aplicaveis = await asyncio.gather(
            self._itens(tipo, data),
            detalhe_coro,
            self.calc.classificacoes_aplicaveis(tipo, codigo, data),
        )
        base = next((i for i in itens if i["codigo"] == codigo), None)
        if base is None and not detalhe:
            raise NaoEncontrado(codigo)

        especificas = [c for c in aplicaveis if c["codigo"] != CLASSIFICACAO_PADRAO]
        if tipo == "nbs":
            # Serviços: a NFS-e tem tabela própria de classificações por NBS (ex.: profissões intelectuais).
            ja = {c["codigo"] for c in especificas}
            todas = {c["codigo"]: c for c in await self.calc.classificacoes(data)}
            for sit in await self.calc.nfse_situacoes(codigo, data):
                cod = sit.get("codigoClassificacaoTributaria")
                if cod and cod not in ja and cod != CLASSIFICACAO_PADRAO and cod in todas:
                    especificas.append({**todas[cod], "_anexos": [], "_nfse": True})
                    ja.add(cod)
        return {
            "tipo": tipo,
            "codigo": codigo,
            "codigoFormatado": formatar_ncm(codigo) if tipo == "ncm" else formatar_nbs(codigo),
            "descricao": base["descricao"] if base else None,
            "caminho": base["caminho"] if base else indice.caminho_de(tipo, codigo, data),
            "data": data.isoformat(),
            "impostoSeletivo": {
                "incide": bool(detalhe.get("tributadoPeloImpostoSeletivo")),
                "aliquotaAdValorem": detalhe.get("aliquotaAdValorem"),
                "aliquotaAdRem": detalhe.get("aliquotaAdRem"),
            },
            "unidade": detalhe.get("unidade"),
            # Ligadas ao código por um anexo da LC 214 (reduções, alíquota zero, regimes específicos)
            "classificacoes": [resumo_classificacao(c) for c in especificas if ligada_por_anexo(c)],
            # Também aceitas para o código, sem anexo (comum em produtos com Imposto Seletivo)
            "outrasPermitidas": [resumo_classificacao(c) for c in especificas if not ligada_por_anexo(c)],
            "regraGeral": CLASSIFICACAO_PADRAO,
        }

    async def _operacao(self, s: "Simulacao") -> tuple[dict, list[str]]:
        detalhes = await asyncio.gather(*(
            (self.calc.ncm(it.codigo, s.data) if it.tipo == "ncm" else self.calc.nbs(it.codigo, s.data))
            for it in s.itens
        ), return_exceptions=True)
        incide_is, unidades, avisos = {}, {}, []
        for n, (it, d) in enumerate(zip(s.itens, detalhes)):
            if isinstance(d, Exception):
                continue  # a calculadora oficial vai apontar o erro no item
            incide_is[n] = bool(d.get("tributadoPeloImpostoSeletivo"))
            unidades[n] = d.get("unidade")
            if incide_is[n] and s.data >= INICIO_ALIQUOTAS_INFORMADAS and it.aliquotaIS is None:
                avisos.append(f"Item {n + 1}: incide Imposto Seletivo; informe a alíquota do IS para calcular.")
        return montar_operacao(s, incide_is, unidades), avisos

    async def gerar_xml(self, s: "Simulacao", tipo: str) -> str:
        """XML dos grupos de tributação: cálculo oficial estrito (/regime-geral) + /xml/generate."""
        operacao, _ = await self._operacao(s)
        resultado = await self.calc.calcular_estrito(operacao)
        return await self.calc.gerar_xml(resultado, tipo)

    async def simular(self, s: "Simulacao") -> dict:
        """Monta a operação no formato oficial, calcula na calculadora oficial e simplifica."""
        operacao, avisos = await self._operacao(s)
        resposta, simulado = await self.calc.calcular(operacao)
        resultado = simplificar(resposta, s)
        if simulado:
            avisos.append("Cálculo simulado: usa as alíquotas que você informou, não alíquotas oficiais definitivas.")
        return {
            **resultado,
            "simulado": simulado,
            "avisos": avisos,
            "data": s.data.isoformat(),
            # transparência: exatamente o que foi enviado e recebido da calculadora oficial
            "oficial": {"requisicao": operacao, "resposta": resposta},
        }

    async def classificacao(self, cclass: str, data: date) -> dict:
        todas = await self.calc.classificacoes(data)
        c = next((c for c in todas if c.get("codigo") == cclass), None)
        if c is None:
            raise NaoEncontrado(cclass)
        return {**resumo_classificacao(c), "dataAtualizacao": c.get("dataAtualizacao"), "original": c}
