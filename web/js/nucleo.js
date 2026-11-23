"use strict";
// Núcleo do site: utilidades, chamadas à API, tema e registro de telas.
window.RTC = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (casas) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const reais = (n) => (n == null || n === "" || isNaN(n) ? "—" : `R$ ${nf(2).format(Number(n))}`);
  const pct = (n) => (n == null || n === "" || isNaN(n) ? "—"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(Number(n))}%`);
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const dataBR = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  async function api(caminho, opcoes = {}) {
    let r;
    try {
      r = await fetch(caminho, { ...opcoes, headers: { Accept: "application/json", ...(opcoes.headers || {}) } });
    } catch (e) {
      throw new Error("Sem conexão com o servidor. Tente de novo.");
    }
    const tipo = r.headers.get("content-type") || "";
    const corpo = tipo.includes("json") ? await r.json().catch(() => ({})) : await r.text();
    if (!r.ok) {
      const msg = typeof corpo === "object"
        ? (corpo.erro || (typeof corpo.detail === "string" && corpo.detail) || corpo.title || corpo.mensagem)
        : "";
      const e = new Error(msg || `Erro ${r.status}`);
      e.status = r.status; e.corpo = corpo;
      throw e;
    }
    return corpo;
  }
  const postJSON = (caminho, dados) => api(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });

  function baixar(nome, conteudo, tipo) {
    const url = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Cabeçalho padrão de tela: eyebrow em mono, título em serifa com uma palavra em itálico.
  const cabeca = (eyebrow, tituloHTML, lead) => `
    <header class="cabeca">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${tituloHTML}</h1>
      ${lead ? `<p class="lead">${lead}</p>` : ""}
    </header>`;
  const subNav = (itens, ativo) => `<nav class="sub-nav" aria-label="Subseções">${itens.map(([href, rot, id]) =>
    `<a href="${href}" class="${id === ativo ? "ativa" : ""}">${rot}</a>`).join("")}</nav>`;

  // Tabela genérica a partir de uma lista de objetos.
  function tabelaDeObjetos(lista, { limite = 300, colunas } = {}) {
    if (!Array.isArray(lista) || !lista.length) return `<p class="vazio">Nenhum registro.</p>`;
    const cols = colunas || [...new Set(lista.slice(0, 50).flatMap((o) => (o && typeof o === "object" ? Object.keys(o) : ["valor"])))];
    const celula = (v) => {
      if (v == null) return `<td class="muted">—</td>`;
      if (typeof v === "number") return `<td class="num">${esc(v)}</td>`;
      if (typeof v === "boolean") return `<td>${v ? "sim" : "não"}</td>`;
      if (typeof v === "object") return `<td><code class="muted">${esc(JSON.stringify(v)).slice(0, 400)}</code></td>`;
      return `<td>${esc(v)}</td>`;
    };
    const linhas = lista.slice(0, limite).map((o) => `<tr>${cols.map((c) => celula(o && typeof o === "object" ? o[c] : o)).join("")}</tr>`).join("");
    return `<div class="tabela-wrap"><table class="tabela-compacta"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${linhas}</tbody></table></div>
      ${lista.length > limite ? `<p class="muted">Mostrando ${limite} de ${lista.length} registros. Use o filtro para refinar.</p>` : ""}`;
  }

  // Valor qualquer como lista chave/valor (objetos aninhados recuados).
  function chaveValor(obj) {
    if (obj == null) return `<p class="vazio">Sem conteúdo.</p>`;
    if (typeof obj !== "object") return `<p>${esc(obj)}</p>`;
    if (Array.isArray(obj)) return obj.length && typeof obj[0] === "object" ? tabelaDeObjetos(obj) : `<p>${esc(obj.join(", "))}</p>`;
    return `<div class="kv">${Object.entries(obj).map(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v)) return `<div>${esc(k)}</div><div></div>${chaveValor(v)}`;
      if (Array.isArray(v)) return `<div>${esc(k)}</div><div>${v.length && typeof v[0] === "object" ? tabelaDeObjetos(v) : esc(v.join(", ") || "—")}</div>`;
      const num = typeof v === "number" || (/^-?\d+(\.\d+)?$/.test(String(v)) && String(v).length < 20);
      return `<div>${esc(k)}</div><div class="${num ? "num" : ""}">${v === null || v === "" ? "—" : esc(typeof v === "boolean" ? (v ? "sim" : "não") : v)}</div>`;
    }).join("")}</div>`;
  }

  const jsonBruto = (titulo, dados) => `<details><summary>${titulo}</summary><pre class="codigo">${esc(JSON.stringify(dados, null, 2))}</pre></details>`;

  // ---- tema ----
  function aplicarTema(tema) {
    if (tema === "claro") document.documentElement.dataset.tema = "claro"; else delete document.documentElement.dataset.tema;
    $("#tema").textContent = tema === "claro" ? "Tema escuro" : "Tema claro";
    $("#monograma").src = `marca/monograma-${tema === "claro" ? "claro" : "escuro"}.svg`;
  }
  function iniciarTema() {
    aplicarTema(ler("rtc-tema") === "claro" ? "claro" : "escuro");
    $("#tema").addEventListener("click", () => {
      const novo = document.documentElement.dataset.tema === "claro" ? "escuro" : "claro";
      guardar("rtc-tema", novo); aplicarTema(novo);
    });
  }

  // ---- telas ----
  // Cada tela: { nav, montar(el), entrar(args, el) }. O elemento é criado uma vez e preservado.
  const telas = {};
  const elementos = {};
  function registrar(nome, tela) { telas[nome] = tela; }
  function mostrar(nome, args = []) {
    const tela = telas[nome];
    if (!tela) return false;
    for (const [n, el] of Object.entries(elementos)) el.hidden = n !== nome;
    if (!elementos[nome]) {
      const el = document.createElement("section");
      el.dataset.tela = nome;
      $("#app").appendChild(el);
      elementos[nome] = el;
      tela.montar(el);
    }
    elementos[nome].hidden = false;
    $$(".nav a").forEach((a) => a.classList.toggle("ativa", a.dataset.nav === tela.nav));
    tela.entrar && tela.entrar(args, elementos[nome]);
    return true;
  }

  return { $, $$, esc, reais, pct, nf, hoje, dataBR, guardar, ler, api, postJSON, baixar, cabeca, subNav,
    tabelaDeObjetos, chaveValor, jsonBruto, iniciarTema, registrar, mostrar };
})();
