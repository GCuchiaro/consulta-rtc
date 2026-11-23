"""Acesso direto às APIs oficiais (regime regular e Simples Nacional) e ao gerador de DANFSe.

O gateway só repassa: nenhuma regra é implementada aqui. Apenas rotas oficiais conhecidas
passam (prefixos abaixo), com limite de tamanho, e o OpenAPI de cada serviço é servido
para o site montar os formulários a partir dele (campo novo na versão oficial = campo novo
no site, sem mudar código).
"""
from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx

SERVICOS = {
    # nome curto → (URL base até /api, título)
    "rr": (os.getenv("RR_URL", "http://localhost:8080/api").rstrip("/"), "Regime regular"),
    "sn": (os.getenv("SN_URL", "http://localhost:8082/api").rstrip("/"), "Simples Nacional"),
}
DANFSE_URL = os.getenv("DANFSE_URL", "http://localhost:8085").rstrip("/")

# Caminhos aceitos (relativos a /api do serviço). Nada fora disso é repassado
# (actuator, swagger estático, downloads etc. ficam de fora).
PERMITIDOS = re.compile(r"^(calculadora/[A-Za-z0-9/_.-]+|versao(/status)?)$")
CORPO_MAX = 1024 * 1024
TTL_OPENAPI = 3600


class ServicoDesconhecido(Exception):
    pass


class CaminhoNaoPermitido(Exception):
    pass


class Oficial:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client or httpx.AsyncClient(timeout=60)
        self._openapi: dict[str, tuple[float, dict]] = {}

    async def fechar(self) -> None:
        await self.client.aclose()

    @staticmethod
    def base(servico: str) -> str:
        if servico not in SERVICOS:
            raise ServicoDesconhecido(servico)
        return SERVICOS[servico][0]

    @staticmethod
    def validar_caminho(caminho: str) -> str:
        caminho = caminho.strip("/")
        if ".." in caminho or not PERMITIDOS.match(caminho):
            raise CaminhoNaoPermitido(caminho)
        return caminho

    async def repassar(self, servico: str, metodo: str, caminho: str, params: list[tuple[str, str]],
                       corpo: bytes | None, tipo: str | None) -> httpx.Response:
        url = f"{self.base(servico)}/{self.validar_caminho(caminho)}"
        headers = {"Accept": "application/json, application/xml;q=0.9, */*;q=0.1"}
        if tipo:
            headers["Content-Type"] = tipo
        return await self.client.request(metodo, url, params=params, content=corpo, headers=headers)

    async def openapi(self, servico: str) -> dict:
        """OpenAPI oficial do serviço, com os caminhos já apontando para /api/oficial/<servico>."""
        hit = self._openapi.get(servico)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        r = await self.client.get(f"{self.base(servico)}/api-docs")
        r.raise_for_status()
        doc: dict[str, Any] = r.json()
        doc["servers"] = [{"url": f"/api/oficial/{servico}", "description": "Consulta RTC (repasse à API oficial)"}]
        doc["paths"] = {p: v for p, v in (doc.get("paths") or {}).items() if PERMITIDOS.match(p.strip("/"))}
        self._openapi[servico] = (time.monotonic() + TTL_OPENAPI, doc)
        return doc

    async def versao(self, servico: str) -> dict | None:
        caminho = "calculadora/dados-abertos/versao" if servico == "rr" else "versao"
        try:
            r = await self.client.get(f"{self.base(servico)}/{caminho}", timeout=10)
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None

    async def danfse(self, xml: bytes, situacao: str, canhoto: bool) -> httpx.Response:
        return await self.client.post(
            f"{DANFSE_URL}/api/danfse", content=xml,
            params={"stc": situacao, "canhoto": "true" if canhoto else "false"},
            headers={"Content-Type": "application/xml"})

    async def danfse_ok(self) -> bool:
        try:
            r = await self.client.get(f"{DANFSE_URL}/health/ready", timeout=5)
            return r.status_code == 200
        except httpx.HTTPError:
            return False
