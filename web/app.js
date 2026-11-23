"use strict";
// Consulta RTC: site estático que consome a API do próprio projeto (/api).
// Rotas por hash: #/  #/busca/arroz  #/ncm/10063021  #/nbs/122011200
//                 #/simulador  #/simulador/ncm/10063021  #/xml

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const resultados = $("#resultados");
const ficha = $("#ficha");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtPct = (n) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`);
const fmtR$ = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, { headers: { Accept: "application/json", ...(opcoes.headers || {}) }, ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || (typeof corpo.detail === "string" ? corpo.detail : "") || `Erro ${r.status}`);
  return corpo;
}

// ============================================================================
// CONSULTA
// ============================================================================
function montarDatas() {
  const opcoes = [
    [hojeISO(), `Hoje (${new Date().toLocaleDateString("pt-BR")})`],
    ["2027-01-01", "A partir de 01/01/2027"],
  ];
  $("#data").innerHTML = opcoes.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
  const salva = ler("rtc-data");
  if (salva && opcoes.some(([v]) => v === salva)) $("#data").value = salva;
  $("#data").addEventListener("change", () => { guardar("rtc-data", $("#data").value); rotear(); });
}
const dataRef = () => $("#data").value;
const tipoRef = () => $("input[name=tipo]:checked").value;

async function mostrarBusca(q) {
  ficha.innerHTML = "";
  $("#q").value = q;
  resultados.innerHTML = `<p class="carregando">Buscando…</p>`;
  try {
    const r = await api(`/api/busca?q=${encodeURIComponent(q)}&tipo=${tipoRef()}&data=${dataRef()}`);
    const grupo = (titulo, itens, rota) => !itens ? "" : `
      <div class="grupo"><h2>${titulo} · ${itens.length}${itens.length >= 20 ? "+" : ""}</h2>
      ${itens.length ? `<ul class="lista">${itens.map((i) => `
        <li><a href="#/${rota}/${i.codigo}"><span class="cod">${esc(i.codigoFormatado)}</span>
          <span>${(i.caminho || []).length ? `<span class="caminho">${esc(i.caminho.join(" › "))}</span>` : ""}${esc(i.descricao)}</span></a></li>`).join("")}
      </ul>` : `<p class="vazio">Nenhum resultado.</p>`}</div>`;
    resultados.innerHTML = grupo("Produtos (NCM)", r.ncm, "ncm") + grupo("Serviços (NBS)", r.nbs, "nbs");
  } catch (e) {
    resultados.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

function cardClasse(c) {
  const red = c.reducao ? [
    ["CBS", c.reducao.cbs], ["IBS estadual", c.reducao.ibsUf], ["IBS municipal", c.reducao.ibsMun],
  ].filter(([, v]) => v != null).map(([t, v]) => `<span class="chip">Redução ${t}: ${fmtPct(v)}</span>`).join("") : "";
  const extras = [
    c.creditoPresumidoFornecedor && `<span class="chip">Crédito presumido (fornecedor)</span>`,
    c.creditoPresumidoAdquirente && `<span class="chip">Crédito presumido (adquirente)</span>`,
    ...(c.documentos || []).map((d) => `<span class="chip">${esc(d)}</span>`),
  ].filter(Boolean).join("");
  return `<article class="classe">
    <header><span class="cod">${esc(c.cClassTrib)}</span><h3>${esc(c.descricao)}</h3></header>
    ${c.tratamento ? `<p><b>Tratamento:</b> ${esc(c.tratamento)}</p>` : ""}
    ${(c.anexos || []).map((a) => `<p class="anexo"><b>LC 214, Anexo ${esc(a.anexo)}${a.item ? `, item ${esc(a.item)}` : ""}:</b> ${esc(a.texto)}</p>`).join("")}
    ${red || extras ? `<div class="reducoes">${red}${extras}</div>` : ""}
  </article>`;
}

async function mostrarItem(tipo, codigo) {
  resultados.innerHTML = "";
  ficha.innerHTML = `<p class="carregando">Consultando a calculadora oficial…</p>`;
  try {
    const r = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${encodeURIComponent(codigo)}?data=${dataRef()}`);
    document.title = `${r.codigoFormatado} · Consulta RTC`;
    const is = r.impostoSeletivo || {};
    const isTxt = is.incide
      ? `<span class="chip on">Imposto Seletivo incide${is.aliquotaAdValorem != null ? ` · ${fmtPct(is.aliquotaAdValorem)}` : ""}</span>`
      : `<span class="chip ok">Sem Imposto Seletivo</span>`;
    const classes = r.classificacoes || [];
    const outras = r.outrasPermitidas || [];
    const caminho = (r.caminho || []).length ? `<div class="caminho">${esc(r.caminho.join(" › "))}</div>` : "";
    ficha.innerHTML = `
      <a class="voltar" href="javascript:history.back()">← Voltar</a>
      <div class="card ficha-topo">
        <span class="cod">${tipo.toUpperCase()} ${esc(r.codigoFormatado)}</span>
        ${caminho}
        <h2>${esc(r.descricao || "Sem descrição na tabela")}</h2>
        <div class="chips">${isTxt}${r.unidade ? `<span class="chip">Unidade: ${esc(r.unidade)}</span>` : ""}
          <span class="chip">Referência: ${new Date(r.data + "T12:00").toLocaleDateString("pt-BR")}</span></div>
        <div class="acoes"><a class="botao" href="#/simulador/${tipo}/${esc(r.codigo)}">Simular este ${tipo === "ncm" ? "produto" : "serviço"}</a></div>
      </div>
      <div class="card">
        <h2 class="secao">Benefícios previstos para este ${tipo === "ncm" ? "produto" : "serviço"}</h2>
        ${classes.length
          ? `<p class="muted" style="margin:6px 0 0">Classificações tributárias (cClassTrib) que a calculadora oficial aceita para este código e que reduzem ou mudam a carga. Cada uma tem condições próprias (destinatário, tipo de operação etc.): confira a fundamentação antes de usar.</p>
             <div class="classes">${classes.map(cardClasse).join("")}</div>`
          : `<p class="muted">Nenhuma redução ou tratamento específico ligado a este código.</p>`}
        <div class="nota">Fora dessas hipóteses, aplica-se a <b>tributação integral</b> (CST 000, cClassTrib ${esc(r.regraGeral)}).</div>
        ${outras.length ? `<details class="outras"><summary>Outras ${outras.length} classificações permitidas para este código, sem redução</summary>
          <p class="muted">${is.incide ? "Produtos com Imposto Seletivo só podem usar as classificações desta lista." : "Situações específicas em que o código também pode ser usado."}</p>
          <div class="classes">${outras.map(cardClasse).join("")}</div></details>` : ""}
      </div>`;
  } catch (e) {
    ficha.innerHTML = `<a class="voltar" href="#/">← Início</a><p class="erro">${esc(e.message)}</p>`;
  }
}

// ============================================================================
// SIMULADOR
// ============================================================================
const sim = { iniciado: false, seq: 0 };
const aPartirDe2027 = () => ($("#sim-data").value || "") >= "2027-01-01";

async function iniciarSimulador() {
  if (sim.iniciado) return;
  sim.iniciado = true;
  $("#sim-data").value = ler("rtc-sim-data") || hojeISO();
  $("#sim-data").addEventListener("change", () => {
    guardar("rtc-sim-data", $("#sim-data").value);
    atualizarAliquotas();
    $$(".item-sim").forEach((el) => carregarClassificacoes(el));
  });
  atualizarAliquotas();
  try {
    const ufs = await api("/api/ufs");
    $("#sim-uf").innerHTML = `<option value="">UF</option>` + ufs.map((u) => `<option value="${u.sigla}">${u.sigla} · ${esc(u.nome)}</option>`).join("");
    $("#sim-uf").value = ler("rtc-sim-uf") || "SP";
    await carregarMunicipios(ler("rtc-sim-mun"));
  } catch (e) { $("#sim-resultado").innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  $("#sim-uf").addEventListener("change", () => { guardar("rtc-sim-uf", $("#sim-uf").value); carregarMunicipios(); });
  $("#sim-mun").addEventListener("change", () => guardar("rtc-sim-mun", $("#sim-mun").value));
  $("#sim-add").addEventListener("click", () => adicionarItem());
  $("#form-sim").addEventListener("submit", (ev) => { ev.preventDefault(); calcular(); });
  if (!$$(".item-sim").length) adicionarItem();
}

function atualizarAliquotas() {
  $("#sim-aliquotas").hidden = !aPartirDe2027();
  $("#sim-2026").hidden = aPartirDe2027();
  $$(".item-sim").forEach(atualizarCampoIS);
}

async function carregarMunicipios(preferido) {
  const uf = $("#sim-uf").value;
  $("#sim-mun").innerHTML = `<option value="">${uf ? "Carregando…" : "Escolha a UF"}</option>`;
  if (!uf) return;
  const lista = await api(`/api/municipios?uf=${uf}`);
  $("#sim-mun").innerHTML = lista.map((m) => `<option value="${m.codigo}">${esc(m.nome)}</option>`).join("");
  const capital = { SP: 3550308, RJ: 3304557, MG: 3106200, RS: 4314902, PR: 4106902, SC: 4205407, BA: 2927408, DF: 5300108 }[uf];
  const alvo = lista.find((m) => String(m.codigo) === String(preferido)) || lista.find((m) => m.codigo === capital) || lista[0];
  if (alvo) $("#sim-mun").value = alvo.codigo;
}

function adicionarItem(pre = {}) {
  const id = ++sim.seq;
  const el = document.createElement("div");
  el.className = "item-sim card-interno";
  el.dataset.id = id;
  el.innerHTML = `
    <div class="item-topo"><b>Item <span class="n"></span></b><button type="button" class="link remover" aria-label="Remover item">Remover</button></div>
    <div class="grade">
      <label class="larga sugestoes-wrap">Produto ou serviço
        <input class="cod-busca" type="text" placeholder="Nome ou código NCM/NBS" autocomplete="off" required>
        <ul class="sugestoes" hidden></ul>
        <span class="escolhido muted"></span>
      </label>
      <label>Valor (R$)<input class="valor" type="number" step="0.01" min="0" placeholder="0,00" required></label>
      <label>Quantidade<input class="qtd" type="number" step="0.0001" min="0" placeholder="1"></label>
      <label class="larga">Classificação tributária<select class="cclass"><option value="000001">000001 · Tributação integral</option></select></label>
      <label class="campo-is" hidden>Alíquota do IS (%)<input class="aliq-is" type="number" step="0.0001" min="0" placeholder="Ex.: 10"></label>
    </div>`;
  $("#sim-itens").appendChild(el);
  renumerar();
  $(".remover", el).addEventListener("click", () => { el.remove(); renumerar(); });
  ligarSugestoes(el);
  if (pre.tipo && pre.codigo) escolherCodigo(el, pre.tipo, pre.codigo, pre.rotulo || pre.codigo);
  if (pre.valor != null) $(".valor", el).value = pre.valor;
}

function renumerar() {
  $$(".item-sim").forEach((el, i) => { $(".n", el).textContent = i + 1; });
  $$(".item-sim .remover").forEach((b) => { b.hidden = $$(".item-sim").length === 1; });
}

function ligarSugestoes(el) {
  const input = $(".cod-busca", el);
  const ul = $(".sugestoes", el);
  let timer, ultimo = "";
  input.addEventListener("input", () => {
    el.dataset.tipo = ""; el.dataset.codigo = ""; $(".escolhido", el).textContent = "";
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { ul.hidden = true; return; }
    timer = setTimeout(async () => {
      ultimo = q;
      try {
        const r = await api(`/api/busca?q=${encodeURIComponent(q)}&tipo=todos&data=${$("#sim-data").value || hojeISO()}`);
        if (ultimo !== q) return;
        const itens = [...(r.ncm || []).slice(0, 8).map((i) => ({ ...i, tipo: "ncm" })),
                       ...(r.nbs || []).slice(0, 6).map((i) => ({ ...i, tipo: "nbs" }))];
        ul.innerHTML = itens.length ? itens.map((i) => `
          <li><button type="button" data-tipo="${i.tipo}" data-codigo="${i.codigo}" data-rotulo="${esc(`${i.codigoFormatado} · ${i.descricao}`)}">
            <span class="cod">${i.tipo.toUpperCase()} ${esc(i.codigoFormatado)}</span>
            <span>${(i.caminho || []).length ? `<span class="caminho">${esc(i.caminho.slice(-2).join(" › "))}</span>` : ""}${esc(i.descricao)}</span>
          </button></li>`).join("") : `<li class="vazio">Nada encontrado</li>`;
        ul.hidden = false;
      } catch { ul.hidden = true; }
    }, 250);
  });
  ul.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-codigo]");
    if (!b) return;
    escolherCodigo(el, b.dataset.tipo, b.dataset.codigo, b.dataset.rotulo);
    ul.hidden = true;
  });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Escape") ul.hidden = true; });
  document.addEventListener("click", (ev) => { if (!el.contains(ev.target)) ul.hidden = true; });
}

function escolherCodigo(el, tipo, codigo, rotulo) {
  el.dataset.tipo = tipo;
  el.dataset.codigo = codigo;
  $(".cod-busca", el).value = rotulo;
  carregarClassificacoes(el);
}

async function carregarClassificacoes(el) {
  const { tipo, codigo } = el.dataset;
  if (!tipo || !codigo) return;
  const sel = $(".cclass", el);
  const atual = sel.value;
  try {
    const r = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${codigo}?data=${$("#sim-data").value || hojeISO()}`);
    el.dataset.is = r.impostoSeletivo?.incide ? "1" : "";
    const campo = $(".cod-busca", el);
    if (campo.value === codigo) campo.value = `${r.codigoFormatado} · ${r.descricao || ""}`;
    const opt = (c) => `<option value="${c.cClassTrib}">${c.cClassTrib} · ${esc(c.descricao.length > 90 ? c.descricao.slice(0, 88) + "…" : c.descricao)}</option>`;
    sel.innerHTML = `<option value="000001">000001 · Tributação integral (regra geral)</option>`
      + ((r.classificacoes || []).length ? `<optgroup label="Benefícios deste código">${r.classificacoes.map(opt).join("")}</optgroup>` : "")
      + ((r.outrasPermitidas || []).length ? `<optgroup label="Outras permitidas">${r.outrasPermitidas.map(opt).join("")}</optgroup>` : "");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
    $(".escolhido", el).textContent = r.impostoSeletivo?.incide ? "Incide Imposto Seletivo" : "";
    atualizarCampoIS(el);
  } catch (e) {
    $(".escolhido", el).textContent = e.message;
  }
}

function atualizarCampoIS(el) {
  $(".campo-is", el).hidden = !(el.dataset.is && aPartirDe2027());
}

function lerFormulario() {
  const itens = [];
  for (const [i, el] of $$(".item-sim").entries()) {
    if (!el.dataset.codigo) throw new Error(`Item ${i + 1}: escolha o produto ou serviço na lista de sugestões.`);
    const valor = parseFloat($(".valor", el).value);
    if (!(valor >= 0)) throw new Error(`Item ${i + 1}: informe o valor.`);
    const item = { tipo: el.dataset.tipo, codigo: el.dataset.codigo, cClassTrib: $(".cclass", el).value, valor };
    const qtd = parseFloat($(".qtd", el).value);
    if (qtd > 0) item.quantidade = qtd;
    const aliqIS = parseFloat($(".aliq-is", el).value);
    if (!$(".campo-is", el).hidden && aliqIS >= 0) item.aliquotaIS = aliqIS;
    itens.push(item);
  }
  const dados = { data: $("#sim-data").value, uf: $("#sim-uf").value, municipio: Number($("#sim-mun").value), itens };
  if (!dados.data) throw new Error("Informe a data da operação.");
  if (!dados.uf || !dados.municipio) throw new Error("Escolha a UF e o município.");
  if (aPartirDe2027()) {
    dados.aliquotas = { cbs: parseFloat($("#sim-cbs").value) || 0, ibsEstadual: parseFloat($("#sim-ibsuf").value) || 0,
                        ibsMunicipal: parseFloat($("#sim-ibsmun").value) || 0 };
  }
  return dados;
}

async function calcular() {
  const alvo = $("#sim-resultado");
  let dados;
  try { dados = lerFormulario(); } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  alvo.innerHTML = `<p class="carregando">Calculando na calculadora oficial…</p>`;
  try {
    const r = await api("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    alvo.innerHTML = renderResultado(r);
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

function linhaTributo(nome, t) {
  if (!t) return "";
  return `<tr><td>${nome}</td><td>${fmtPct(t.aliquota)}</td><td>${t.reducao != null ? fmtPct(t.reducao) : "—"}</td>
    <td>${fmtPct(t.aliquotaEfetiva)}</td><td class="num">${fmtR$(t.valor)}</td></tr>`;
}

function renderResultado(r) {
  const t = r.totais || {};
  const rotulos = $$(".item-sim").map((el) => $(".cod-busca", el).value);
  const avisos = (r.avisos || []).map((a) => `<p class="aviso">${esc(a)}</p>`).join("");
  const itens = (r.itens || []).map((i) => {
    if (i.erros?.length) {
      return `<article class="card item-res erro-item"><header><b>Item ${i.numero}</b><span class="rotulo">${esc(rotulos[i.numero - 1] || "")}</span>
        <span class="chip on">${esc(i.estadoTexto)}</span></header>
        ${i.erros.map((e) => `<p><b>${esc(e.titulo)}</b> <span class="muted">(${esc(e.codigo)})</span><br>${esc(e.detalhe)}</p>`).join("")}</article>`;
    }
    const mem = Object.entries(i.memoria || {}).map(([k, v]) =>
      `<p><b>${{ cbs: "CBS", ibsUF: "IBS estadual", ibsMun: "IBS municipal", is: "Imposto Seletivo" }[k] || esc(k)}:</b> ${esc(v)}</p>`).join("");
    return `<article class="card item-res">
      <header><b>Item ${i.numero}</b><span class="rotulo">${esc(rotulos[i.numero - 1] || "")}</span>
        <span class="chip ${i.estado === "CALCULADO" ? "ok" : ""}">${esc(i.estadoTexto)}</span></header>
      <p class="muted">CST ${esc(i.cst)} · cClassTrib ${esc(i.cClassTrib)} · Base de cálculo ${fmtR$(i.base)}</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Tributo</th><th>Alíquota</th><th>Redução</th><th>Efetiva</th><th class="num">Valor</th></tr></thead>
        <tbody>${linhaTributo("CBS", i.cbs)}${linhaTributo("IBS estadual", i.ibsUf)}${linhaTributo("IBS municipal", i.ibsMun)}
          ${i.is ? `<tr><td>Imposto Seletivo</td><td>${fmtPct(i.is.aliquota)}</td><td>—</td><td>${fmtPct(i.is.aliquota)}</td><td class="num">${fmtR$(i.is.valor)}</td></tr>` : ""}</tbody>
      </table></div>
      ${mem ? `<details><summary>Memória de cálculo oficial</summary><div class="memoria">${mem}</div></details>` : ""}
    </article>`;
  }).join("");
  return `
    ${avisos}
    <div class="totais">
      <div><span>Base de cálculo</span><b>${fmtR$(t.base)}</b></div>
      <div><span>CBS</span><b>${fmtR$(t.cbs)}</b></div>
      <div><span>IBS</span><b>${fmtR$(t.ibs)}</b><small>UF ${fmtR$(t.ibsUf)} · Mun. ${fmtR$(t.ibsMun)}</small></div>
      ${t.is ? `<div><span>Imposto Seletivo</span><b>${fmtR$(t.is)}</b></div>` : ""}
      <div class="destaque"><span>Total de tributos</span><b>${fmtR$(t.total)}</b></div>
    </div>
    ${r.itensComErro ? `<p class="aviso">${r.itensComErro} item(ns) não entraram nos totais por inconsistência.</p>` : ""}
    ${itens}
    <details class="card json"><summary>Ver o que foi enviado e recebido da calculadora oficial (JSON)</summary>
      <h3>Requisição</h3><pre>${esc(JSON.stringify(r.oficial?.requisicao, null, 2))}</pre>
      <h3>Resposta</h3><pre>${esc(JSON.stringify(r.oficial?.resposta, null, 2))}</pre>
    </details>`;
}

// ============================================================================
// VALIDADOR DE XML
// ============================================================================
const xmlEstado = { iniciado: false, conteudo: "", nome: "" };

async function iniciarXml() {
  if (xmlEstado.iniciado) return;
  xmlEstado.iniciado = true;
  try {
    const tipos = await api("/api/xml/tipos");
    $("#xml-tipo").innerHTML += tipos.map((t) => `<option value="${esc(t.mnemonico)}">${esc(t.nome)} (NT ${esc(t.versaoNotaTecnica)})</option>`).join("");
  } catch {}
  const drop = $("#xml-drop");
  const carregar = async (arquivo) => {
    if (!arquivo) return;
    if (arquivo.size > 2 * 1024 * 1024) { $("#xml-resultado").innerHTML = `<p class="erro">Arquivo maior que 2 MB.</p>`; return; }
    xmlEstado.conteudo = await arquivo.text();
    xmlEstado.nome = arquivo.name;
    $("#xml-nome").textContent = `${arquivo.name} · ${(arquivo.size / 1024).toFixed(1)} KB`;
    $("#xml-texto").value = "";
    validarXml();
  };
  $("#xml-arquivo").addEventListener("change", (ev) => carregar(ev.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove("sobre"); }));
  drop.addEventListener("drop", (ev) => carregar(ev.dataTransfer.files[0]));
  $("#xml-texto").addEventListener("input", () => { xmlEstado.conteudo = ""; $("#xml-nome").textContent = ""; });
  $("#form-xml").addEventListener("submit", (ev) => { ev.preventDefault(); validarXml(); });
}

function trechoXml(xml, linha, coluna) {
  if (!linha) return "";
  const linhas = xml.split(/\r?\n/);
  // XML numa linha só: mostra um pedaço em volta da coluna
  if (linhas.length === 1 || (linhas[linha - 1] || "").length > 300) {
    const l = linhas[linha - 1] || "";
    const ini = Math.max(0, (coluna || 1) - 120);
    return `<pre class="trecho"><span class="destaque-linha">${esc(l.slice(ini, ini + 240))}</span></pre>`;
  }
  const de = Math.max(1, linha - 3), ate = Math.min(linhas.length, linha + 2);
  let html = "";
  for (let n = de; n <= ate; n++) {
    html += `<span class="${n === linha ? "destaque-linha" : ""}"><i>${n}</i>${esc(linhas[n - 1])}</span>\n`;
  }
  return `<pre class="trecho">${html}</pre>`;
}

async function validarXml() {
  const alvo = $("#xml-resultado");
  const xml = xmlEstado.conteudo || $("#xml-texto").value.trim();
  if (!xml) { alvo.innerHTML = `<p class="erro">Escolha um arquivo ou cole o XML.</p>`; return; }
  alvo.innerHTML = `<p class="carregando">Validando…</p>`;
  const params = new URLSearchParams({ subtipo: $("#xml-subtipo").value });
  if ($("#xml-tipo").value) params.set("tipo", $("#xml-tipo").value);
  try {
    const r = await api(`/api/validar-xml?${params}`, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml });
    const tipoNome = $(`#xml-tipo option[value="${r.tipo}"]`)?.textContent || r.tipo;
    if (r.valido) {
      alvo.innerHTML = `<div class="card resultado-ok"><b>✓ XML válido</b><p class="muted">${esc(tipoNome)} · ${r.subtipo === "nota" ? "documento completo" : "grupo de tributação"} · estrutura conforme o XSD oficial.</p></div>`;
    } else {
      alvo.innerHTML = r.erros.map((e) => `<div class="card resultado-erro">
        <b>✗ XML com erro${e.linha ? ` na linha ${e.linha}, coluna ${e.coluna}` : ""}</b>
        <p>${esc(e.mensagem)}</p>
        ${trechoXml(xml, e.linha, e.coluna)}
        <p class="muted">${esc(tipoNome)} · a validação para no primeiro erro; corrija e valide de novo.</p>
        <details><summary>Mensagem técnica original</summary><pre>${esc(e.original)}</pre></details>
      </div>`).join("");
    }
  } catch (e) {
    alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

// ============================================================================
// ROTEAMENTO
// ============================================================================
function mostrarTela(nome) {
  $$(".tela").forEach((t) => { t.hidden = t.id !== `tela-${nome}`; });
  $$(".abas a").forEach((a) => a.classList.toggle("ativa", a.dataset.aba === nome));
}

function rotear() {
  const [, rota, a, b] = decodeURIComponent(location.hash).split("/");
  if (rota === "simulador") {
    mostrarTela("simulador");
    document.title = "Simulador · Consulta RTC";
    iniciarSimulador().then(() => {
      if ((a === "ncm" || a === "nbs") && b) {
        const vazio = $$(".item-sim").find((el) => !el.dataset.codigo);
        if (vazio) vazio.remove();
        adicionarItem({ tipo: a, codigo: b });
        renumerar();
        history.replaceState(null, "", "#/simulador");
      }
    });
    return;
  }
  if (rota === "xml") { mostrarTela("xml"); document.title = "Validar XML · Consulta RTC"; iniciarXml(); return; }
  mostrarTela("consulta");
  if (rota === "busca" && a) return mostrarBusca(a);
  if ((rota === "ncm" || rota === "nbs") && a) return mostrarItem(rota, a);
  document.title = "Consulta RTC";
  resultados.innerHTML = ""; ficha.innerHTML = "";
}

$("#form-busca").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const q = $("#q").value.trim();
  if (q.length < 2) return;
  const alvo = `#/busca/${encodeURIComponent(q)}`;
  if (location.hash === alvo) rotear(); else location.hash = alvo;
});
$$("input[name=tipo]").forEach((el) => el.addEventListener("change", () => {
  if (location.hash.startsWith("#/busca/")) rotear();
}));
window.addEventListener("hashchange", rotear);

montarDatas();
$("#mcp-url").textContent = `${location.origin}/mcp/`;
api("/api/versao").then((v) => {
  const c = v.calculadora || {};
  $("#versao").textContent = `Calculadora oficial ${c.versaoApp || "?"} · base de dados ${c.versaoDb || "?"}${c.dataVersaoDb ? ` (${c.dataVersaoDb})` : ""} · Consulta RTC ${v.projeto}`;
}).catch(() => { $("#versao").textContent = "Calculadora oficial indisponível no momento."; });
rotear();
