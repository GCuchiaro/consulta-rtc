"""Consultas de alto nível, usadas tanto pela API web quanto pelo servidor MCP."""
from __future__ import annotations

import asyncio
import re
from datetime import date

from .busca import buscar, formatar_nbs, formatar_ncm, so_digitos
from .calculadora import Calculadora, NaoEncontrado, indice, limpar_descricao
from .simulador import INICIO_ALIQUOTAS_INFORMADAS, Simulacao, montar_operacao, simplificar

CLASSIFICACAO_PADRAO = "000001"  # tributação integral (regra geral)


def ligada_por_anexo(c: dict) -> bool:
    """A classificação vale para o código por constar de um anexo da LC 214 (benefício específico).

    Sem anexo, o código está numa lista de classificações permitidas (ex.: produtos com
    Imposto Seletivo só podem usar algumas cClassTrib), o que não é um benefício do produto.
    """
    return bool(c.get("_anexos"))


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

    async def buscar(self, q: str, tipo: str, data: date, limite: int = 20) -> dict:
        resultado: dict[str, list] = {}
        for t in ("ncm", "nbs"):
            if tipo not in ("todos", t):
                continue
            fmt = formatar_ncm if t == "ncm" else formatar_nbs
            achados = buscar(await self._itens(t, data), q, "codigo", limite, campo_texto="_busca")
            resultado[t] = [
                {"codigo": i["codigo"], "codigoFormatado": fmt(i["codigo"]),
                 "descricao": i["descricao"], "caminho": i["caminho"]}
                for i in achados
            ]
        return resultado

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

    async def simular(self, s: "Simulacao") -> dict:
        """Monta a operação no formato oficial, calcula na calculadora oficial e simplifica."""
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
        operacao = montar_operacao(s, incide_is, unidades)
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
