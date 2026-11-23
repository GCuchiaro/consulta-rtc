"""Consulta RTC: API pública + site + MCP em cima da calculadora oficial da Receita."""
from __future__ import annotations

import contextlib
import os
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .calculadora import Calculadora, CalculadoraIndisponivel, NaoEncontrado
from .mcp_server import criar_mcp
from .servico import Consultas

VERSAO_PROJETO = "0.1.0"
LIMITE_POR_MINUTO = int(os.getenv("LIMITE_POR_MINUTO", "120"))
WEB_DIR = Path(os.getenv("WEB_DIR", Path(__file__).resolve().parents[2] / "web"))

estado: dict = {}
mcp = criar_mcp(lambda: estado["consultas"])


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    calc = Calculadora()
    estado["calc"] = calc
    estado["consultas"] = Consultas(calc)
    async with mcp.session_manager.run():
        yield
    await calc.fechar()


app = FastAPI(title="Consulta RTC", version=VERSAO_PROJETO, lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

# ---- limite de requisições por IP (memória; basta para uma instância) -------
_janelas: dict[str, deque] = defaultdict(deque)


def _ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "?")


@app.middleware("http")
async def limitar(request: Request, call_next):
    caminho = request.url.path
    if caminho.startswith("/api/") and caminho != "/api/saude" or caminho.startswith("/mcp"):
        agora = time.monotonic()
        janela = _janelas[_ip(request)]
        while janela and janela[0] < agora - 60:
            janela.popleft()
        if len(janela) >= LIMITE_POR_MINUTO:
            return JSONResponse({"erro": "Muitas consultas. Aguarde um minuto."}, status_code=429,
                                headers={"Retry-After": "60"})
        janela.append(agora)
        if len(_janelas) > 50_000:  # evita crescer sem limite
            _janelas.clear()
    resposta = await call_next(request)
    return resposta


@app.exception_handler(CalculadoraIndisponivel)
async def _indisponivel(_, exc):
    return JSONResponse({"erro": "A calculadora oficial está indisponível no momento."}, status_code=503)


@app.exception_handler(NaoEncontrado)
async def _nao_encontrado(_, exc):
    return JSONResponse({"erro": "Não encontrado para a data informada."}, status_code=404)


def _data(d: date | None) -> date:
    return d or date.today()


# ---- API -----------------------------------------------------------------------
@app.get("/api/saude")
async def saude():
    return {"ok": True}


@app.get("/api/versao")
async def versao():
    return {"projeto": VERSAO_PROJETO, "calculadora": await estado["calc"].versao()}


@app.get("/api/busca")
async def busca(q: str = Query(..., min_length=2, max_length=100),
                tipo: str = Query("todos", pattern="^(todos|ncm|nbs)$"),
                data: date | None = None):
    return await estado["consultas"].buscar(q, tipo, _data(data))


@app.get("/api/produto/{ncm}")
async def produto(ncm: str, data: date | None = None):
    if not ncm.replace(".", "").isdigit():
        raise HTTPException(400, "NCM deve ter só números.")
    return await estado["consultas"].item("ncm", ncm, _data(data))


@app.get("/api/servico/{nbs}")
async def servico(nbs: str, data: date | None = None):
    if not nbs.replace(".", "").isdigit():
        raise HTTPException(400, "NBS deve ter só números.")
    return await estado["consultas"].item("nbs", nbs, _data(data))


@app.get("/api/classificacao/{cclass}")
async def classificacao(cclass: str, data: date | None = None):
    return await estado["consultas"].classificacao(cclass, _data(data))


app.mount("/mcp", mcp.streamable_http_app())
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
