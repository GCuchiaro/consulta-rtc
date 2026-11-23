"""Simulador de operação: monta a entrada oficial, chama o cálculo oficial e simplifica a resposta.

Nenhuma conta é feita aqui. O cálculo é o endpoint oficial
POST /observabilidade/regime-geral (erros por item, sem derrubar os demais).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .busca import so_digitos

BRASILIA = timezone(timedelta(hours=-3))
INICIO_ALIQUOTAS_INFORMADAS = date(2027, 1, 1)  # a partir daqui a calculadora exige aliquotasNominais
ESTADOS = {
    "CALCULADO": "Calculado",
    "CALCULO_SIMULADO": "Calculado (simulado)",
    "INCONSISTENCIA_ENTRADA": "Dados inconsistentes",
    "NAO_IMPLEMENTADO": "Ainda não implementado na calculadora oficial",
    "FALHA_TECNICA": "Falha técnica na calculadora oficial",
}


class Aliquotas(BaseModel):
    cbs: Decimal = Field(ge=0, le=100)
    ibsEstadual: Decimal = Field(ge=0, le=100)
    ibsMunicipal: Decimal = Field(ge=0, le=100)


class ItemSimulacao(BaseModel):
    tipo: Literal["ncm", "nbs"]
    codigo: str
    cClassTrib: str = "000001"
    valor: Decimal = Field(ge=0, le=Decimal("9999999999999.99"), description="Base de cálculo (R$)")
    quantidade: Decimal | None = Field(default=None, ge=0, le=Decimal("99999999999"))
    unidade: str | None = Field(default=None, max_length=6)
    aliquotaIS: Decimal | None = Field(default=None, ge=0, le=1000,
                                       description="Alíquota ad valorem do Imposto Seletivo (%), quando incide")

    @field_validator("codigo")
    @classmethod
    def _codigo(cls, v: str) -> str:
        d = so_digitos(v)
        if not d or len(d) > 9:
            raise ValueError("código NCM/NBS inválido")
        return d

    @field_validator("cClassTrib")
    @classmethod
    def _cclass(cls, v: str) -> str:
        if not (v.isdigit() and len(v) == 6):
            raise ValueError("cClassTrib deve ter 6 dígitos")
        return v


class Simulacao(BaseModel):
    data: date
    uf: str = Field(min_length=2, max_length=2)
    municipio: int = Field(ge=1000000, le=9999999, description="Código IBGE do município")
    aliquotas: Aliquotas | None = None
    itens: list[ItemSimulacao] = Field(min_length=1, max_length=30)

    @field_validator("uf")
    @classmethod
    def _uf(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")
    def _regras_de_data(self):
        if self.data >= INICIO_ALIQUOTAS_INFORMADAS and self.aliquotas is None:
            raise ValueError("A partir de 2027 informe as alíquotas nominais de CBS e IBS (a calculadora oficial exige).")
        return self


def _num(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def montar_operacao(s: Simulacao, incide_is: dict[int, bool], unidades: dict[int, str | None]) -> dict:
    """Entrada no formato oficial (OperacaoInput). `incide_is`/`unidades` são por índice de item."""
    usa_aliquotas = s.data >= INICIO_ALIQUOTAS_INFORMADAS
    itens = []
    for n, it in enumerate(s.itens):
        unidade = it.unidade or unidades.get(n) or ("UN" if it.tipo == "ncm" else None)
        quantidade = it.quantidade if it.quantidade is not None else Decimal(1)
        item: dict[str, Any] = {
            "numero": n + 1,
            it.tipo: it.codigo,
            "cst": it.cClassTrib[:3],  # o CST é o início do cClassTrib (tabela oficial)
            "cClassTrib": it.cClassTrib,
            "quantidade": float(quantidade),
        }
        if unidade:
            item["unidade"] = unidade
        tem_is = usa_aliquotas and incide_is.get(n, False)
        if tem_is:
            # Com Imposto Seletivo, a base de CBS/IBS é derivada pela calculadora (base do IS + IS).
            item["impostoSeletivo"] = {
                "cst": "000", "cClassTrib": "000001", "baseCalculo": float(it.valor),
                "quantidade": float(quantidade), **({"unidade": unidade} if unidade else {}),
            }
        else:
            item["baseCalculo"] = float(it.valor)
        if usa_aliquotas and s.aliquotas:
            aliq: dict[str, Any] = {
                "cbs": float(s.aliquotas.cbs),
                "ibsEstadual": float(s.aliquotas.ibsEstadual),
                "ibsMunicipal": float(s.aliquotas.ibsMunicipal),
            }
            if tem_is:
                aliq["impostoSeletivo"] = {"adValorem": float(it.aliquotaIS or 0)}
            item["aliquotasNominais"] = aliq
        itens.append(item)

    momento = datetime.combine(s.data, time(12, 0), tzinfo=BRASILIA)
    return {
        "id": uuid.uuid4().hex,
        "versao": "1.0.0",
        "dhFatoGerador": momento.isoformat(),
        "municipio": s.municipio,
        "uf": s.uf,
        "itens": itens,
    }


def _tributo(grupo: dict | None, aliquota: str, valor: str) -> dict | None:
    if not grupo:
        return None
    red = grupo.get("gRed") or {}
    return {
        "aliquota": _num(grupo.get(aliquota)),
        "reducao": _num(red.get("pRedAliq")),
        "aliquotaEfetiva": _num(red.get("pAliqEfet")) if red else _num(grupo.get(aliquota)),
        "valor": _num(grupo.get(valor)),
    }


def simplificar(resposta: dict, simulacao: Simulacao) -> dict:
    itens = []
    for obj in resposta.get("objetos") or []:
        n = int(obj.get("nObj", 0))
        entrada = simulacao.itens[n - 1] if 0 < n <= len(simulacao.itens) else None
        trib = obj.get("tribCalc") or {}
        ibscbs = trib.get("IBSCBS") or {}
        g = ibscbs.get("gIBSCBS") or {}
        is_ = trib.get("IS")
        memoria = dict(ibscbs.get("memoriaCalculo") or {})
        if is_ and is_.get("memoriaCalculo"):
            memoria["is"] = is_["memoriaCalculo"]
        itens.append({
            "numero": n,
            "tipo": entrada.tipo if entrada else None,
            "codigo": entrada.codigo if entrada else None,
            "estado": obj.get("estadoItem"),
            "estadoTexto": ESTADOS.get(obj.get("estadoItem"), obj.get("estadoItem")),
            "cst": ibscbs.get("CST"),
            "cClassTrib": ibscbs.get("cClassTrib"),
            "base": _num(g.get("vBC")),
            "cbs": _tributo(g.get("gCBS"), "pCBS", "vCBS"),
            "ibsUf": _tributo(g.get("gIBSUF"), "pIBSUF", "vIBSUF"),
            "ibsMun": _tributo(g.get("gIBSMun"), "pIBSMun", "vIBSMun"),
            "ibs": _num(g.get("vIBS")),
            "is": {"base": _num(is_.get("vBCIS")), "aliquota": _num(is_.get("pIS")), "valor": _num(is_.get("vIS"))}
                  if is_ else None,
            "memoria": memoria,
            "erros": [
                {"codigo": e.get("code"), "titulo": e.get("title"), "detalhe": e.get("detail")}
                for e in obj.get("erros") or []
            ],
        })

    tot = (resposta.get("total") or {}).get("tribCalc") or {}
    t_ibscbs = tot.get("IBSCBSTot") or {}
    g_ibs = t_ibscbs.get("gIBS") or {}
    g_cbs = t_ibscbs.get("gCBS") or {}
    cbs = _num(g_cbs.get("vCBS")) or 0.0
    ibs = _num(g_ibs.get("vIBS")) or 0.0
    is_tot = _num((tot.get("ISTot") or {}).get("vIS")) or 0.0
    return {
        "itens": itens,
        "totais": {
            "base": _num(t_ibscbs.get("vBCIBSCBS")),
            "cbs": cbs,
            "ibsUf": _num((g_ibs.get("gIBSUF") or {}).get("vIBSUF")),
            "ibsMun": _num((g_ibs.get("gIBSMun") or {}).get("vIBSMun")),
            "ibs": ibs,
            "is": is_tot,
            "total": round(cbs + ibs + is_tot, 2),
            "creditoPresumido": round((_num(g_cbs.get("vCredPres")) or 0) + (_num(g_ibs.get("vCredPres")) or 0), 2),
        },
        "itensComErro": sum(1 for i in itens if i["erros"]),
    }
