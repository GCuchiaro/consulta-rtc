"""Simulador (montagem da entrada oficial e leitura da resposta) e apoio ao validador de XML."""
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.simulador import Simulacao, montar_operacao, simplificar
from app.xml import XmlRecusado, detectar_tipo, explicar_erro_xml, preparar


def _sim(**kw):
    base = {"data": "2026-11-23", "uf": "sp", "municipio": 3550308,
            "itens": [{"tipo": "ncm", "codigo": "1006.30.21", "cClassTrib": "200003", "valor": 100}]}
    return Simulacao(**{**base, **kw})


def test_2026_sem_aliquotas_e_cst_do_cclasstrib():
    s = _sim()
    op = montar_operacao(s, {0: False}, {0: "KG"})
    item = op["itens"][0]
    assert op["uf"] == "SP" and op["municipio"] == 3550308
    assert op["dhFatoGerador"].startswith("2026-11-23T12:00:00-03:00")
    assert item == {"numero": 1, "ncm": "10063021", "cst": "200", "cClassTrib": "200003",
                    "quantidade": 1.0, "unidade": "KG", "baseCalculo": 100.0}


def test_2027_exige_aliquotas():
    with pytest.raises(ValidationError, match="A partir de 2027"):
        _sim(data="2027-01-01")


def test_2027_com_imposto_seletivo():
    s = _sim(data="2027-03-10", aliquotas={"cbs": 8.8, "ibsEstadual": 0.05, "ibsMunicipal": 0.05},
             itens=[{"tipo": "ncm", "codigo": "22030000", "valor": 150, "quantidade": 12, "aliquotaIS": 10}])
    item = montar_operacao(s, {0: True}, {0: "LT"})["itens"][0]
    assert "baseCalculo" not in item  # a calculadora deriva a base de CBS/IBS do IS
    assert item["impostoSeletivo"]["baseCalculo"] == 150.0
    assert item["aliquotasNominais"]["impostoSeletivo"] == {"adValorem": 10.0}
    assert item["aliquotasNominais"]["cbs"] == 8.8


def test_codigo_e_cclasstrib_invalidos():
    with pytest.raises(ValidationError):
        _sim(itens=[{"tipo": "ncm", "codigo": "abc", "valor": 1}])
    with pytest.raises(ValidationError):
        _sim(itens=[{"tipo": "ncm", "codigo": "1006", "cClassTrib": "12", "valor": 1}])


def test_simplificar_resposta_oficial():
    s = _sim(itens=[{"tipo": "nbs", "codigo": "122011200", "cClassTrib": "200028", "valor": 1200},
                    {"tipo": "ncm", "codigo": "02013000", "cClassTrib": "200035", "valor": 80}])
    resposta = {
        "objetos": [
            {"nObj": 1, "estadoItem": "CALCULO_SIMULADO", "tribCalc": {"IBSCBS": {
                "CST": "200", "cClassTrib": "200028", "gIBSCBS": {
                    "vBC": "1200.00",
                    "gIBSUF": {"pIBSUF": "0.05", "gRed": {"pRedAliq": "60.00", "pAliqEfet": "0.02"}, "vIBSUF": "0.24"},
                    "gIBSMun": {"pIBSMun": "0.05", "gRed": {"pRedAliq": "60.00", "pAliqEfet": "0.02"}, "vIBSMun": "0.24"},
                    "vIBS": "0.48",
                    "gCBS": {"pCBS": "8.80", "gRed": {"pRedAliq": "60.00", "pAliqEfet": "3.52"}, "vCBS": "42.24"}},
                "memoriaCalculo": {"cbs": "texto"}}}},
            {"nObj": 2, "estadoItem": "INCONSISTENCIA_ENTRADA", "erros": [
                {"code": "REG-011", "title": "NCM não vinculada", "detail": "detalhe"}]},
        ],
        "total": {"tribCalc": {"IBSCBSTot": {"vBCIBSCBS": "1200.00",
                                             "gIBS": {"vIBS": "0.48", "gIBSUF": {"vIBSUF": "0.24"}},
                                             "gCBS": {"vCBS": "42.24"}}}},
    }
    r = simplificar(resposta, s)
    i1, i2 = r["itens"]
    assert i1["cbs"] == {"aliquota": 8.8, "reducao": 60.0, "aliquotaEfetiva": 3.52, "valor": 42.24}
    assert i1["estadoTexto"] == "Calculado (simulado)" and i1["memoria"]["cbs"] == "texto"
    assert i2["erros"] == [{"codigo": "REG-011", "titulo": "NCM não vinculada", "detalhe": "detalhe"}]
    assert r["totais"]["total"] == 42.72 and r["itensComErro"] == 1


def test_detectar_tipo_e_envelope():
    nfce = '<?xml version="1.0"?><nfeProc><NFe xmlns="x"><infNFe><ide><mod>65</mod></ide></infNFe></NFe><protNFe/></nfeProc>'
    assert detectar_tipo(nfce) == "nfce"
    assert preparar(nfce).startswith("<NFe") and preparar(nfce).endswith("</NFe>")
    assert detectar_tipo("<NFe><infNFe><ide><mod>55</mod></ide></infNFe></NFe>") == "nfe"
    assert detectar_tipo("<!-- c --><DPS/>") == "nfse"
    assert detectar_tipo("<qualquer/>") is None


def test_recusa_dtd():
    with pytest.raises(XmlRecusado):
        preparar('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><NFe>&e;</NFe>')


def test_traduz_erros_do_xsd():
    det = {"detail": "Erro na validação do XML: Erro na linha 9, coluna 27: cvc-complex-type.2.4.a: Invalid content "
                     "was found starting with element '{\"http://www.portalfiscal.inf.br/nfe\":vBCx}'. One of "
                     "'{\"http://www.portalfiscal.inf.br/nfe\":vBC}' is expected."}
    e = explicar_erro_xml(det, "")[0]
    assert (e["linha"], e["coluna"]) == (9, 27)
    assert e["mensagem"] == "O elemento <vBCx> está fora do lugar ou não era esperado aqui. Era esperado: vBC."
    desconhecido = explicar_erro_xml({"detail": "Erro na linha 1, coluna 2: algo novo"}, "")[0]
    assert desconhecido["mensagem"] == "algo novo"
