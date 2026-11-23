"""Busca textual em NCM/NBS (por código ou por palavras da descrição)."""
from __future__ import annotations

import re
import unicodedata

PALAVRAS_IGNORADAS = {"de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "com", "ou"}


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


def so_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto)


def buscar(itens: list[dict], q: str, campo_codigo: str, limite: int = 30,
           campo_texto: str = "descricao") -> list[dict]:
    """Filtra `itens` ({codigo, descricao}) pela consulta.

    - Só dígitos (com ou sem pontos): código que começa com eles.
    - Texto: todas as palavras precisam aparecer na descrição (sem acento).
      Resultados cuja descrição começa com a primeira palavra vêm antes.
    """
    q = q.strip()
    if not q:
        return []
    digitos = so_digitos(q)
    if digitos and re.fullmatch(r"[\d.\s-]+", q):
        achados = [i for i in itens if (i.get(campo_codigo) or "").startswith(digitos)]
        achados.sort(key=lambda i: (len(i[campo_codigo]), i[campo_codigo]))
        return achados[:limite]

    termos = [t for t in normalizar(q).split() if t not in PALAVRAS_IGNORADAS] or normalizar(q).split()
    pontuados = []
    for i in itens:
        chave_cache = f"_norm_{campo_texto}"
        texto = i.get(chave_cache)
        if texto is None:
            texto = i[chave_cache] = normalizar(i.get(campo_texto) or "")
        if all(t in texto for t in termos):
            palavras = set(re.findall(r"\w+", texto))
            inicio = 0 if texto.startswith(termos[0]) else 1
            palavras_inteiras = sum(t not in palavras for t in termos)
            pontuados.append(((palavras_inteiras, inicio, len(texto), i.get(campo_codigo, "")), i))
    pontuados.sort(key=lambda p: p[0])
    return [i for _, i in pontuados[:limite]]


def formatar_ncm(codigo: str) -> str:
    c = so_digitos(codigo)
    partes = [c[:4], c[4:6], c[6:8]]
    return ".".join(p for p in partes if p)


def formatar_nbs(codigo: str) -> str:
    c = so_digitos(codigo)
    # NBS: 1.2345.67.89 (9 dígitos)
    partes = [c[:1], c[1:5], c[5:7], c[7:9]]
    return ".".join(p for p in partes if p)
