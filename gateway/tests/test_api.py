"""Testes do gateway com a calculadora oficial simulada (respx)."""
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.busca import buscar, formatar_nbs, formatar_ncm, normalizar

BASE = "http://localhost:8080/api/calculadora"

NCMS = [
    {"ncm": "10063021", "descricao": "Polido ou brunido"},
    {"ncm": "22030000", "descricao": "Cervejas de malte"},
    {"ncm": "10063011", "descricao": "Arroz semibranqueado, não parboilizado"},
]
NBSS = [{"codigo": "122011200", "descricao": "Serviços de educação superior"}]
CLASSES = [
    {"codigo": "000001", "descricao": "Situações tributadas integralmente", "possuiPercentualReducao": False},
    {"codigo": "200003", "descricao": "Cesta básica nacional", "nomenclatura": "Cesta Básica",
     "possuiPercentualReducao": True, "percentualReducaoCbs": 100, "percentualReducaoIbsUf": 100,
     "percentualReducaoIbsMun": 100, "tiposDfeClassificacao": [{"sigla": "NF-e", "tipo": 55}]},
    {"codigo": "200028", "descricao": "Fornecimento dos serviços de educação (Anexo II)",
     "possuiPercentualReducao": True, "percentualReducaoCbs": 60},
]
# Respostas do endpoint oficial: 000001 e 200028 não têm lista, então valem para tudo.
# 200003 vale para 10063021, mas não para 22030000 (simula uma exceção).
APLICAVEIS = {("200003", "10063021"), ("000001", "10063021"), ("200028", "10063021"),
              ("200028", "122011200")}


def _aplicavel(request):
    p = request.url.params
    chave = (p["cClassTrib"], p.get("ncm") or p.get("nbs"))
    return httpx.Response(200, json={"valido": chave in APLICAVEIS})


@pytest.fixture(scope="session", autouse=True)
def banco_oficial(tmp_path_factory):
    """Banco mínimo com as tabelas de aplicabilidade do banco oficial."""
    import sqlite3
    from app import calculadora
    caminho = tmp_path_factory.mktemp("db") / "calc.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
        CREATE TABLE CLASSIFICACAO_TRIBUTARIA (CLTR_ID INTEGER, CLTR_CD TEXT);
        CREATE TABLE NCM_APLICAVEL (NCMA_ID INTEGER, NCMA_NCM_CD TEXT, NCMA_CLTR_ID INTEGER, NCMA_ANXO_ID INTEGER);
        CREATE TABLE NBS_APLICAVEL (NBSA_ID INTEGER, NBSA_NBS_CD TEXT, NBSA_CLTR_ID INTEGER, NBSA_ANXO_ID INTEGER);
        CREATE TABLE ANEXO (ANXO_ID INTEGER, ANXO_NUMERO TEXT, ANXO_NUMERO_ITEM TEXT, ANXO_TEXTO_ITEM TEXT);
        INSERT INTO CLASSIFICACAO_TRIBUTARIA VALUES (1, '000001'), (2, '200003'), (3, '200028');
        INSERT INTO ANEXO VALUES (1, 'I', '1', 'Arroz das subposições 1006.20 e 1006.30'), (2, 'IX', '35', 'Vinhaça');
        -- 000001 ligada ao 1006 sem anexo: deve ir para "outras permitidas"
        INSERT INTO NCM_APLICAVEL VALUES (1, '100630', 2, 1), (2, '22', 2, NULL), (3, '1006', 1, NULL);
        INSERT INTO NBS_APLICAVEL VALUES (1, '1220', 3, 2);
        CREATE TABLE NCM (NCM_CD TEXT, NCM_DESCRICAO TEXT, NCM_INICIO_VIGENCIA TEXT, NCM_FIM_VIGENCIA TEXT);
        CREATE TABLE NBS (NBS_CD TEXT, NBS_DESCRICAO TEXT, NBS_INICIO_VIGENCIA TEXT, NBS_FIM_VIGENCIA TEXT);
        INSERT INTO NCM VALUES ('10', 'Cereais.', '2022-01-01', '9999-12-31'),
            ('1006', 'Arroz.', '2022-01-01', '9999-12-31'),
            ('100630', '- Arroz <i>semibranqueado</i>', '2022-01-01', '9999-12-31'),
            ('2203', 'Cervejas de malte.', '2022-01-01', '9999-12-31');
        INSERT INTO NBS VALUES ('122', 'Serviços de educação', '2022-01-01', NULL);
    """)
    con.commit(); con.close()
    calculadora.indice.caminho = str(caminho)


@pytest.fixture(scope="session")
def mock():
    with respx.mock(base_url=BASE, assert_all_called=False) as m:
        m.get("/dados-abertos/ncm/vigentes", name="ncms").respond(json=NCMS)
        m.get("/dados-abertos/nbs/lista").respond(json=NBSS)
        m.get("/dados-abertos/classificacoes-tributarias/cbs-ibs").respond(json=CLASSES)
        m.get("/dados-abertos/ncm").respond(json={"tributadoPeloImpostoSeletivo": False, "unidade": "KG"})
        m.get("/dados-abertos/nbs").respond(json={"tributadoPeloImpostoSeletivo": False})
        m.get("/dados-abertos/classificacoes-tributarias/ncm-aplicavel").mock(side_effect=_aplicavel)
        m.get("/dados-abertos/classificacoes-tributarias/nbs-aplicavel").mock(side_effect=_aplicavel)
        m.get("/dados-abertos/versao").respond(json={"versaoApp": "1.7.2", "versaoDb": "x"})
        yield m


@pytest.fixture(scope="session")
def cliente(mock):
    # O app (e o MCP dentro dele) só pode iniciar uma vez por processo.
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_normalizar_e_formatar():
    assert normalizar("  Ação   Café ") == "acao cafe"
    assert formatar_ncm("22030000") == "2203.00.00"
    assert formatar_nbs("122011200") == "1.2201.12.00"


def test_buscar_por_codigo_e_texto():
    assert [i["ncm"] for i in buscar(NCMS, "1006", "ncm")] == ["10063011", "10063021"]
    assert [i["ncm"] for i in buscar(NCMS, "2203.00", "ncm")] == ["22030000"]
    assert {i["ncm"] for i in buscar(NCMS, "arroz parboilizado", "ncm")} == {"10063011"}
    assert buscar(NCMS, "cervejas malte", "ncm")[0]["ncm"] == "22030000"
    assert buscar(NCMS, "cerveja", "ncm")[0]["ncm"] == "22030000"


def test_busca_api(cliente):
    r = cliente.get("/api/busca", params={"q": "arroz", "data": "2027-01-01"})
    assert r.status_code == 200
    corpo = r.json()
    # "Polido ou brunido" só é achado por "arroz" graças à hierarquia do banco oficial
    assert {i["codigo"] for i in corpo["ncm"]} == {"10063021", "10063011"}
    item = next(i for i in corpo["ncm"] if i["codigo"] == "10063021")
    assert item["caminho"] == ["Arroz", "Arroz semibranqueado"]
    assert corpo["nbs"] == []


def test_produto_lista_so_classificacoes_especificas(cliente):
    r = cliente.get("/api/produto/1006.30.21", params={"data": "2027-01-01"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["codigoFormatado"] == "1006.30.21"
    assert [c["cClassTrib"] for c in corpo["classificacoes"]] == ["200003"]
    assert corpo["classificacoes"][0]["reducao"]["cbs"] == 100
    assert corpo["classificacoes"][0]["documentos"] == ["NF-e"]
    assert corpo["classificacoes"][0]["anexos"] == [
        {"anexo": "I", "item": "1", "texto": "Arroz das subposições 1006.20 e 1006.30"}]
    assert corpo["impostoSeletivo"]["incide"] is False
    assert corpo["outrasPermitidas"] == []


def test_excecao_oficial_descarta_candidata(cliente):
    corpo = cliente.get("/api/produto/22030000", params={"data": "2027-01-01"}).json()
    assert corpo["classificacoes"] == []


def test_servico_usa_lista_nbs(cliente):
    corpo = cliente.get("/api/servico/122011200", params={"data": "2027-01-01"}).json()
    assert [c["cClassTrib"] for c in corpo["classificacoes"]] == ["200028"]
    # vínculo com anexo errado no banco oficial: classificação fica, texto do anexo não
    assert corpo["classificacoes"][0]["anexos"] == []


def test_produto_codigo_invalido(cliente):
    assert cliente.get("/api/produto/abc").status_code == 400


def test_versao(cliente):
    assert cliente.get("/api/versao").json()["calculadora"]["versaoApp"] == "1.7.2"


def test_calculadora_fora_do_ar(cliente, mock):
    rota = mock.routes["ncms"]
    rota.mock(side_effect=httpx.ConnectError("x"))
    try:
        r = cliente.get("/api/busca", params={"q": "arroz", "tipo": "ncm", "data": "2030-01-01"})
        assert r.status_code == 503
    finally:
        rota.mock(side_effect=None).respond(json=NCMS)
