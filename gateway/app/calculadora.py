"""Cliente da calculadora oficial da Receita (rodando em outro container).

Nenhuma regra tributária é implementada aqui: só chamamos a API oficial,
guardamos em cache o que muda pouco e reorganizamos as respostas.
"""
from __future__ import annotations

import asyncio
import os
import re
import sqlite3
import time
from datetime import date
from typing import Any

import httpx

CALC_URL = os.getenv("CALC_URL", "http://localhost:8080/api/calculadora").rstrip("/")
TTL_LISTAS = int(os.getenv("TTL_LISTAS_SEGUNDOS", str(12 * 3600)))
CONCORRENCIA = int(os.getenv("CALC_CONCORRENCIA", "16"))


class CalculadoraIndisponivel(Exception):
    pass


class NaoEncontrado(Exception):
    pass


class EntradaInvalida(Exception):
    """A calculadora oficial recusou a entrada (HTTP 4xx). `detalhes` vem da resposta oficial."""

    def __init__(self, mensagem: str, detalhes: Any = None):
        super().__init__(mensagem)
        self.detalhes = detalhes


class Calculadora:
    def __init__(self, base_url: str = CALC_URL, client: httpx.AsyncClient | None = None):
        self.base = base_url
        self.client = client or httpx.AsyncClient(timeout=30)
        self._cache: dict[tuple, tuple[float, Any]] = {}
        self._locks: dict[tuple, asyncio.Lock] = {}
        self._sem = asyncio.Semaphore(CONCORRENCIA)

    async def fechar(self) -> None:
        await self.client.aclose()

    # ---- infraestrutura ----------------------------------------------------
    async def _get(self, caminho: str, **params: Any) -> Any:
        async with self._sem:
            try:
                r = await self.client.get(f"{self.base}{caminho}", params=params)
            except httpx.HTTPError as e:
                raise CalculadoraIndisponivel(str(e)) from e
        if r.status_code == 404:
            raise NaoEncontrado(caminho)
        if r.status_code >= 500:
            raise CalculadoraIndisponivel(f"HTTP {r.status_code}")
        if r.status_code >= 400:
            raise NaoEncontrado(r.text[:300])
        return r.json()

    async def _post(self, caminho: str, corpo: Any, *, conteudo: str | None = None,
                    tipo: str = "application/json", params: dict | None = None) -> tuple[Any, httpx.Headers]:
        async with self._sem:
            try:
                if conteudo is not None:
                    r = await self.client.post(f"{self.base}{caminho}", content=conteudo,
                                               headers={"Content-Type": tipo}, params=params)
                else:
                    r = await self.client.post(f"{self.base}{caminho}", json=corpo, params=params)
            except httpx.HTTPError as e:
                raise CalculadoraIndisponivel(str(e)) from e
        if r.status_code >= 500:
            raise CalculadoraIndisponivel(f"HTTP {r.status_code}")
        try:
            dados = r.json()
        except ValueError:
            dados = r.text
        if r.status_code >= 400:
            msg = dados.get("detail") or dados.get("title") if isinstance(dados, dict) else str(dados)[:300]
            raise EntradaInvalida(msg or f"HTTP {r.status_code}", dados)
        return dados, r.headers

    async def calcular(self, operacao: dict) -> tuple[dict, bool]:
        """Cálculo oficial com observabilidade. Devolve (resposta, simulado?)."""
        dados, headers = await self._post("/observabilidade/regime-geral", operacao)
        return dados, "x-warning-dados-simulados" in headers

    async def calcular_estrito(self, operacao: dict) -> dict:
        """Cálculo oficial sem observabilidade: recusa a operação inteira se um item tiver erro."""
        dados, _ = await self._post("/regime-geral", operacao)
        return dados

    async def gerar_xml(self, resultado: dict, tipo: str) -> str:
        async with self._sem:
            try:
                r = await self.client.post(f"{self.base}/xml/generate", params={"tipo": tipo}, json=resultado)
            except httpx.HTTPError as e:
                raise CalculadoraIndisponivel(str(e)) from e
        if r.status_code >= 500:
            raise CalculadoraIndisponivel(f"HTTP {r.status_code}")
        if r.status_code >= 400:
            try:
                d = r.json()
            except ValueError:
                d = r.text
            raise EntradaInvalida((d.get("detail") if isinstance(d, dict) else str(d)[:300]) or "XML não gerado", d)
        return r.text

    async def validar_xml(self, xml: str, tipo: str, subtipo: str) -> Any:
        dados, _ = await self._post("/xml/validate", None, conteudo=xml, tipo="application/xml",
                                    params={"tipo": tipo, "subtipo": subtipo})
        return dados

    async def tipos_xml(self) -> Any:
        return await self._cacheado(("tipos-xml",), TTL_LISTAS, lambda: self._get("/xml/validate"))

    async def ufs(self) -> list[dict]:
        return await self._cacheado(("ufs",), TTL_LISTAS, lambda: self._get("/dados-abertos/ufs"))

    async def municipios(self, uf: str) -> list[dict]:
        return await self._cacheado(("mun", uf), TTL_LISTAS,
                                    lambda: self._get("/dados-abertos/ufs/municipios", siglaUf=uf))

    async def _cacheado(self, chave: tuple, ttl: int, fabrica) -> Any:
        agora = time.monotonic()
        hit = self._cache.get(chave)
        if hit and hit[0] > agora:
            return hit[1]
        lock = self._locks.setdefault(chave, asyncio.Lock())
        async with lock:
            hit = self._cache.get(chave)
            if hit and hit[0] > agora:
                return hit[1]
            valor = await fabrica()
            self._cache[chave] = (time.monotonic() + ttl, valor)
            return valor

    # ---- dados abertos (oficiais) -----------------------------------------
    async def versao(self) -> dict:
        return await self._cacheado(("versao",), 600, lambda: self._get("/dados-abertos/versao"))

    async def ncms(self, data: date) -> list[dict]:
        return await self._cacheado(
            ("ncms", data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/ncm/vigentes", data=data.isoformat()))

    async def nbss(self, data: date) -> list[dict]:
        return await self._cacheado(
            ("nbss", data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/nbs/lista", data=data.isoformat()))

    async def classificacoes(self, data: date) -> list[dict]:
        return await self._cacheado(
            ("class", data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/classificacoes-tributarias/cbs-ibs", data=data.isoformat()))

    async def ncm(self, codigo: str, data: date) -> dict:
        return await self._cacheado(
            ("ncm", codigo, data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/ncm", ncm=codigo, data=data.isoformat()))

    async def nbs(self, codigo: str, data: date) -> dict:
        return await self._cacheado(
            ("nbs", codigo, data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/nbs", nbs=codigo, data=data.isoformat()))

    async def nfse_situacoes(self, nbs: str, data: date) -> list[dict]:
        """Classificações aceitas na NFS-e para o NBS (tabela própria da NFS-e)."""
        async def buscar():
            try:
                return await self._get("/nfse/situacoes-classificacoes-tributarias", nbs=nbs, data=data.isoformat())
            except NaoEncontrado:
                return []
        return await self._cacheado(("nfse-sit", nbs, data), TTL_LISTAS, buscar)

    async def fundamentacoes(self, data: date) -> list[dict]:
        return await self._cacheado(
            ("fund", data), TTL_LISTAS,
            lambda: self._get("/dados-abertos/fundamentacoes-legais", data=data.isoformat()))

    async def _aplicavel(self, tipo: str, cclass: str, codigo: str, data: date) -> bool:
        async def buscar():
            try:
                r = await self._get(
                    f"/dados-abertos/classificacoes-tributarias/{tipo}-aplicavel",
                    cClassTrib=cclass, **{tipo: codigo}, dataOcorrenciaFatoGerador=data.isoformat())
                return bool(r.get("valido"))
            except NaoEncontrado:
                return False
        return await self._cacheado((f"{tipo}-apl", cclass, codigo, data), TTL_LISTAS, buscar)

    async def classificacoes_aplicaveis(self, tipo: str, codigo: str, data: date) -> list[dict]:
        """cClassTrib específicas (com lista de NCM/NBS) que valem para o código informado.

        1. O banco oficial (somente leitura) diz quais classificações têm o código,
           ou um prefixo dele, na sua lista de NCM/NBS: são as candidatas.
        2. Cada candidata é confirmada no endpoint oficial ncm-aplicavel/nbs-aplicavel,
           que aplica exceções e vigência. Só as confirmadas entram no resultado.
        Classificações sem lista (valem para qualquer código, sob outras condições)
        ficam de fora: o endpoint oficial as considera válidas para tudo.
        """
        assert tipo in ("ncm", "nbs")
        candidatas = indice.candidatas(tipo, codigo)
        todas = [c for c in await self.classificacoes(data) if c.get("codigo") in candidatas]
        oks = await asyncio.gather(*(self._aplicavel(tipo, c["codigo"], codigo, data) for c in todas))
        return [{**c, "_anexos": candidatas[c["codigo"]]} for c, ok in zip(todas, oks) if ok]


class IndiceAplicavel:
    """Leitura mínima do banco SQLite oficial (o mesmo que a calculadora usa)."""

    # Candidatas + anexo da LC 214 que liga o código à classificação (quando há).
    CONSULTAS = {
        "ncm": """SELECT DISTINCT c.CLTR_CD, x.ANXO_NUMERO, x.ANXO_NUMERO_ITEM, x.ANXO_TEXTO_ITEM
                  FROM NCM_APLICAVEL a
                  JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = a.NCMA_CLTR_ID
                  LEFT JOIN ANEXO x ON x.ANXO_ID = a.NCMA_ANXO_ID
                  WHERE ? LIKE a.NCMA_NCM_CD || '%'""",
        "nbs": """SELECT DISTINCT c.CLTR_CD, x.ANXO_NUMERO, x.ANXO_NUMERO_ITEM, x.ANXO_TEXTO_ITEM
                  FROM NBS_APLICAVEL a
                  JOIN CLASSIFICACAO_TRIBUTARIA c ON c.CLTR_ID = a.NBSA_CLTR_ID
                  LEFT JOIN ANEXO x ON x.ANXO_ID = a.NBSA_ANXO_ID
                  WHERE ? LIKE a.NBSA_NBS_CD || '%'""",
    }

    HIERARQUIA = {
        "ncm": "SELECT NCM_CD, NCM_DESCRICAO FROM NCM WHERE NCM_INICIO_VIGENCIA <= ? AND (NCM_FIM_VIGENCIA IS NULL OR NCM_FIM_VIGENCIA >= ?)",
        "nbs": "SELECT NBS_CD, NBS_DESCRICAO FROM NBS WHERE NBS_INICIO_VIGENCIA <= ? AND (NBS_FIM_VIGENCIA IS NULL OR NBS_FIM_VIGENCIA >= ?)",
    }

    def __init__(self, caminho: str):
        self.caminho = caminho
        self._hierarquia: dict[tuple, dict[str, str]] = {}

    def _consultar(self, sql: str, params: tuple) -> list[tuple]:
        try:
            with sqlite3.connect(f"file:{self.caminho}?mode=ro", uri=True) as con:
                return con.execute(sql, params).fetchall()
        except sqlite3.Error as e:
            raise CalculadoraIndisponivel(f"banco oficial: {e}") from e

    def candidatas(self, tipo: str, codigo: str) -> dict[str, list[dict]]:
        """cClassTrib → anexos da LC 214 que a ligam ao código (lista vazia: sem anexo)."""
        if not codigo.isdigit():
            return {}
        resultado: dict[str, list[dict]] = {}
        for cclass, numero, item, texto in self._consultar(self.CONSULTAS[tipo], (codigo,)):
            anexos = resultado.setdefault(cclass, [])
            if numero:
                a = {"anexo": numero, "item": item, "texto": texto}
                if a not in anexos:
                    anexos.append(a)
        return resultado

    def hierarquia(self, tipo: str, data: date) -> dict[str, str]:
        """Todos os níveis (capítulo, posição, subposição...) vigentes: código → descrição."""
        chave = (tipo, data)
        if chave not in self._hierarquia:
            d = data.isoformat()
            if len(self._hierarquia) >= 8:
                self._hierarquia.clear()
            self._hierarquia[chave] = {c: limpar_descricao(t) for c, t in self._consultar(self.HIERARQUIA[tipo], (d, d))}
        return self._hierarquia[chave]

    def caminho_de(self, tipo: str, codigo: str, data: date) -> list[str]:
        """Descrições dos níveis acima do código, do mais geral ao mais específico (sem o próprio)."""
        h = self.hierarquia(tipo, data)
        inicio = 4 if tipo == "ncm" else 3  # pula o capítulo da NCM (genérico demais)
        return [h[codigo[:n]] for n in range(inicio, len(codigo)) if codigo[:n] in h]


def limpar_descricao(texto: str | None) -> str:
    t = re.sub(r"<[^>]+>", "", texto or "")
    t = re.sub(r"^[\s\-–]+", "", t).strip()
    return t.rstrip(".") if t.endswith(".") and not t.endswith("..") else t


indice = IndiceAplicavel(os.getenv("CALC_DB", "/app/calculadora-pro.db"))
