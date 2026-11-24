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

  // Cabeçalho padrão de tela: o título fala sozinho (o primeiro argumento, rótulo antigo, não é mais exibido).
  const cabeca = (_rotulo, tituloHTML, lead) => `
    <header class="cabeca">
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

  // Seta desenhada no traço da gravura (sem glifos de texto como ícone).
  const seta = (dir) => `<svg class="seta${dir === "esq" ? " esq" : ""}" viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M0 5h16M12 1l4 4-4 4"/></svg>`;

  // ---- formulários ----
  // Erro ligado a um campo: lançado pelo leitor do formulário e mostrado junto do campo.
  const falha = (mensagem, campo) => Object.assign(new Error(mensagem), { campo });
  let seqErro = 0;
  function limparErros(form) {
    $$(".erro-campo", form).forEach((s) => s.remove());
    $$("[aria-invalid]", form).forEach((c) => { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); });
  }
  // Mostra o erro no campo (foco + rolagem) ou, sem campo, na caixa de erro do resultado.
  function mostrarErro(form, alvo, e) {
    limparErros(form);
    const c = e.campo;
    if (!c) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; return; }
    const id = `erro-${++seqErro}`;
    (c.closest("label") || c).insertAdjacentHTML("beforeend", `<span class="erro-campo" id="${id}">${esc(e.message)}</span>`);
    c.setAttribute("aria-invalid", "true");
    c.setAttribute("aria-describedby", id);
    c.addEventListener("input", () => limparErros(form), { once: true });
    c.scrollIntoView({ behavior: "smooth", block: "center" });
    c.focus({ preventScroll: true });
  }
  // Resultado que fica para trás quando o formulário muda: avisa em vez de mostrar números velhos.
  function vigiarResultado(form, alvo) {
    const marcar = () => {
      if (!alvo.dataset.pronto || alvo.classList.contains("desatualizado")) return;
      alvo.classList.add("desatualizado");
      alvo.insertAdjacentHTML("afterbegin", `<p class="aviso aviso-velho" role="status">O formulário mudou depois deste cálculo. Calcule de novo para atualizar o resultado.</p>`);
    };
    form.addEventListener("input", marcar);
    form.addEventListener("change", marcar);
    return marcar;
  }
  const resultadoPronto = (alvo, pronto) => {
    alvo.classList.remove("desatualizado");
    if (pronto) alvo.dataset.pronto = "1"; else delete alvo.dataset.pronto;
  };

  const jsonBruto = (titulo, dados) => `<details><summary>${titulo}</summary><pre class="codigo">${esc(JSON.stringify(dados, null, 2))}</pre></details>`;

  // ---- tema ----
  // Papel claro é o padrão (uso de dia, no escritório); o escuro fica a um clique e é lembrado.
  function aplicarTema(tema) {
    if (tema === "escuro") document.documentElement.dataset.tema = "escuro"; else delete document.documentElement.dataset.tema;
    $("#tema").textContent = tema === "escuro" ? "Tema claro" : "Tema escuro";
    $("#monograma").src = `marca/monograma-${tema === "escuro" ? "escuro" : "claro"}.svg`;
  }
  function iniciarTema() {
    aplicarTema(ler("rtc-tema") === "escuro" ? "escuro" : "claro");
    $("#tema").addEventListener("click", () => {
      const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
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
    $$(".nav a").forEach((a) => {
      const ativa = a.dataset.nav === tela.nav;
      a.classList.toggle("ativa", ativa);
      if (ativa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    tela.entrar && tela.entrar(args, elementos[nome]);
    return true;
  }

  return { $, $$, esc, reais, pct, nf, hoje, dataBR, guardar, ler, api, postJSON, baixar, cabeca, subNav,
    tabelaDeObjetos, chaveValor, jsonBruto, iniciarTema, registrar, mostrar,
    seta, falha, limparErros, mostrarErro, vigiarResultado, resultadoPronto };
})();
