"""Apoio ao validador de XML: detectar o tipo, preparar o documento e explicar os erros do XSD.

A validação em si é a da calculadora oficial (POST /xml/validate), contra os XSD oficiais.
"""
from __future__ import annotations

import re

# Envelopes de distribuição (documento + protocolo): o XSD de validação espera o documento interno.
ENVELOPES = {"nfeProc": "NFe", "cteProc": "CTe", "bpeProc": "BPe", "nf3eProc": "NF3e", "cteSimpProc": "CTeSimp"}


class XmlRecusado(ValueError):
    pass


def _raiz(xml: str) -> str | None:
    sem_cabecalho = re.sub(r"<\?xml[^>]*\?>", "", xml, count=1).lstrip("﻿ \r\n\t")
    sem_comentarios = re.sub(r"<!--.*?-->", "", sem_cabecalho, flags=re.S).lstrip()
    m = re.match(r"<(?:[\w.-]+:)?([\w.-]+)", sem_comentarios)
    return m.group(1) if m else None


def preparar(xml: str) -> str:
    """Recusa DTD/entidades e extrai o documento de dentro de envelopes como nfeProc."""
    if re.search(r"<!(DOCTYPE|ENTITY)", xml, re.I):
        raise XmlRecusado("XML com DOCTYPE/ENTITY não é aceito.")
    raiz = _raiz(xml)
    interno = ENVELOPES.get(raiz or "")
    if interno:
        m = re.search(rf"<(?:[\w.-]+:)?{interno}[\s>].*?</(?:[\w.-]+:)?{interno}>", xml, re.S)
        if m:
            return m.group(0)
    return xml


def detectar_tipo(xml: str) -> str | None:
    """Mnemônico do tipo (nfe, nfce, nfse, cte...) pela raiz e pelo modelo do documento."""
    raiz = _raiz(xml) or ""
    raiz = ENVELOPES.get(raiz, raiz)
    modelo = re.search(r"<(?:[\w.-]+:)?mod>\s*(\d+)\s*<", xml)
    if raiz in ("NFe", "infNFe"):
        return "nfce" if modelo and modelo.group(1) == "65" else "nfe"
    if raiz in ("NFSe", "DPS", "infNFSe", "infDPS"):
        return "nfse"
    if raiz in ("CTeSimp",):
        return "cte-simplificado"
    if raiz in ("CTe", "infCte"):
        return "cte"
    if raiz in ("BPe", "infBPe"):
        return "bpe"  # BP-e TM: o usuário escolhe manualmente
    if raiz in ("NF3e", "infNF3e"):
        return "nf3e"
    return None


def _limpa(nome: str) -> str:
    """'{"http://...":vBC}' → vBC ; listas com vírgula ficam com cada nome limpo."""
    return re.sub(r'\{"[^"]*":([\w.-]+)\}', r"\1", nome).replace("'", "")


TRADUCOES = [
    (r"cvc-complex-type\.2\.4\.a: Invalid content was found starting with element '(.+?)'\. One of '(.+?)' is expected",
     lambda m: f"O elemento <{_limpa(m[1])}> está fora do lugar ou não era esperado aqui. Era esperado: {_limpa(m[2])}."),
    (r"cvc-complex-type\.2\.4\.b: The content of element '(.+?)' is not complete\. One of '(.+?)' is expected",
     lambda m: f"Está faltando informação dentro de <{_limpa(m[1])}>. Era esperado: {_limpa(m[2])}."),
    (r"cvc-complex-type\.2\.4\.d: Invalid content was found starting with element '(.+?)'\. No child element is expected",
     lambda m: f"O elemento <{_limpa(m[1])}> não deveria existir neste ponto."),
    (r"cvc-pattern-valid: Value '(.*?)' is not facet-valid with respect to pattern '(.+?)'",
     lambda m: f"O valor '{m[1]}' não está no formato exigido (padrão {m[2]})."),
    (r"cvc-enumeration-valid: Value '(.*?)' is not facet-valid with respect to enumeration '\[(.+?)\]'",
     lambda m: f"O valor '{m[1]}' não é permitido. Valores aceitos: {m[2]}."),
    (r"cvc-maxLength-valid: Value '(.*?)' with length = '(\d+)' is not facet-valid with respect to maxLength '(\d+)'",
     lambda m: f"O valor '{m[1]}' tem {m[2]} caracteres; o máximo é {m[3]}."),
    (r"cvc-minLength-valid: Value '(.*?)' with length = '(\d+)' is not facet-valid with respect to minLength '(\d+)'",
     lambda m: f"O valor '{m[1]}' tem {m[2]} caracteres; o mínimo é {m[3]}."),
    (r"cvc-type\.3\.1\.3: The value '(.*?)' of element '(.+?)' is not valid",
     lambda m: f"O valor '{m[1]}' do elemento <{_limpa(m[2])}> não é válido."),
    (r"cvc-elt\.1\.a: Cannot find the declaration of element '(.+?)'",
     lambda m: f"O elemento raiz <{_limpa(m[1])}> não pertence a este tipo de documento. Confira o tipo escolhido."),
    (r"cvc-complex-type\.4: Attribute '(.+?)' must appear on element '(.+?)'",
     lambda m: f"Falta o atributo {m[1]} no elemento <{_limpa(m[2])}>."),
    (r"Content is not allowed in prolog",
     lambda m: "O arquivo não é um XML válido (há conteúdo antes do início do XML)."),
    (r"XML document structures must start and end within the same entity|Premature end of file",
     lambda m: "O XML está incompleto ou cortado."),
    (r"The element type \"(.+?)\" must be terminated by the matching end-tag",
     lambda m: f"A tag <{m[1]}> não foi fechada corretamente."),
]


def explicar_erro_xml(detalhes, mensagem: str) -> list[dict]:
    texto = detalhes.get("detail") if isinstance(detalhes, dict) else None
    texto = texto or mensagem or ""
    pos = re.search(r"linha (\d+), coluna (\d+):\s*(.*)", texto, re.S)
    linha, coluna, tecnico = (int(pos[1]), int(pos[2]), pos[3].strip()) if pos else (None, None, texto)
    explicacao = None
    for padrao, fazer in TRADUCOES:
        m = re.search(padrao, tecnico, re.S)
        if m:
            explicacao = fazer(m)
            break
    return [{
        "linha": linha,
        "coluna": coluna,
        "mensagem": explicacao or _limpa(tecnico),
        "original": tecnico,
    }]
