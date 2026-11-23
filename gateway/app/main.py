"""Consulta RTC: API pública + site + MCP em cima da calculadora oficial da Receita."""
from __future__ import annotations

import contextlib
import os
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .calculadora import Calculadora, CalculadoraIndisponivel, EntradaInvalida, NaoEncontrado
from .mcp_server import criar_mcp
from .servico import Consultas
from .simulador import Simulacao
from .xml import XmlRecusado, detectar_tipo, explicar_erro_xml, preparar

VERSAO_PROJETO = "0.2.0"
XML_MAX_BYTES = 2 * 1024 * 1024
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
    if not caminho.startswith(("/api/", "/mcp")):
        # site estático: o navegador sempre revalida (ETag), então uma versão nova aparece na hora
        resposta.headers["Cache-Control"] = "no-cache"
    return resposta


@app.exception_handler(CalculadoraIndisponivel)
async def _indisponivel(_, exc):
    return JSONResponse({"erro": "A calculadora oficial está indisponível no momento."}, status_code=503)


@app.exception_handler(RequestValidationError)
async def _validacao(_, exc: RequestValidationError):
    """Erros de entrada em uma frase legível (o detalhe técnico vai junto)."""
    def frase(e: dict) -> str:
        msg = str(e.get("msg", "")).removeprefix("Value error, ")
        campo = ".".join(str(p) for p in e.get("loc", [])[1:])
        return f"{campo}: {msg}" if campo else msg
    erros = exc.errors()
    return JSONResponse({"erro": frase(erros[0]) if erros else "Entrada inválida.",
                         "detalhes": [frase(e) for e in erros]}, status_code=422)


@app.exception_handler(EntradaInvalida)
async def _entrada_invalida(_, exc: EntradaInvalida):
    return JSONResponse({"erro": str(exc), "detalhes": exc.detalhes}, status_code=422)


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


@app.get("/api/ufs")
async def ufs():
    return [{"sigla": u["sigla"], "nome": u["nome"].title(), "codigo": u["codigo"]}
            for u in sorted(await estado["calc"].ufs(), key=lambda u: u["sigla"])]


@app.get("/api/municipios")
async def municipios(uf: str = Query(..., min_length=2, max_length=2)):
    return await estado["calc"].municipios(uf.upper())


@app.post("/api/simular")
async def simular(simulacao: Simulacao):
    """Calcula CBS, IBS e IS de uma operação na calculadora oficial (regime regular)."""
    return await estado["consultas"].simular(simulacao)


@app.post("/api/validar-xml")
async def validar_xml(request: Request, tipo: str | None = Query(None, pattern="^[a-z0-9-]{2,20}$"),
                      subtipo: str = Query("nota", pattern="^(nota|grupo)$")):
    """Valida o XML (corpo da requisição) contra o XSD oficial usado pela calculadora."""
    corpo = await request.body()
    if not corpo:
        raise HTTPException(400, "Envie o XML no corpo da requisição.")
    if len(corpo) > XML_MAX_BYTES:
        raise HTTPException(413, "XML maior que 2 MB.")
    try:
        xml = corpo.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "O XML precisa estar em UTF-8.")
    try:
        documento = preparar(xml)
    except XmlRecusado as e:
        raise HTTPException(400, str(e))
    tipo = tipo or detectar_tipo(xml)
    if not tipo:
        raise HTTPException(400, "Não reconheci o tipo do documento. Escolha o tipo manualmente.")
    try:
        await estado["calc"].validar_xml(documento, tipo, subtipo)
        return {"valido": True, "tipo": tipo, "subtipo": subtipo, "erros": []}
    except EntradaInvalida as e:
        return {"valido": False, "tipo": tipo, "subtipo": subtipo,
                "erros": explicar_erro_xml(e.detalhes, str(e))}


@app.get("/api/xml/tipos")
async def tipos_xml():
    return await estado["calc"].tipos_xml()


app.mount("/mcp", mcp.streamable_http_app())
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
