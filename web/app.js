"use strict";
// Consulta RTC: site estático que consome a API do próprio projeto (/api).
// Rotas por hash para links compartilháveis: #/busca/arroz, #/ncm/10063021, #/nbs/122011200

const $ = (s) => document.querySelector(s);
const resultados = $("#resultados");
const ficha = $("#ficha");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtPct = (n) => (n == null ? null : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

// ---- datas de referência ----------------------------------------------------
function montarDatas() {
  const hoje = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const opcoes = [
    [iso(hoje), `Hoje (${hoje.toLocaleDateString("pt-BR")})`],
    ["2027-01-01", "A partir de 01/01/2027"],
  ];
  $("#data").innerHTML = opcoes.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
  try { const salva = localStorage.getItem("rtc-data"); if (salva && opcoes.some(([v]) => v === salva)) $("#data").value = salva; } catch {}
  $("#data").addEventListener("change", () => {
    try { localStorage.setItem("rtc-data", $("#data").value); } catch {}
    rotear();
  });
}
const dataRef = () => $("#data").value;
const tipoRef = () => document.querySelector("input[name=tipo]:checked").value;

async function api(caminho) {
  const r = await fetch(caminho, { headers: { Accept: "application/json" } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || corpo.detail || `Erro ${r.status}`);
  return corpo;
}

// ---- busca --------------------------------------------------------------------
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

// ---- ficha do NCM/NBS -----------------------------------------------------------
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
      </div>
      <div class="card">
        <h2 class="secao">Benefícios previstos para este ${tipo === "ncm" ? "produto" : "serviço"}</h2>
        ${classes.length
          ? `<p class="muted" style="margin:6px 0 0">Classificações tributárias (cClassTrib) que a calculadora oficial aceita para este código e que reduzem ou mudam a carga. Cada uma tem condições próprias (destinatário, tipo de operação etc.): confira a fundamentação antes de usar.</p>
             <div class="classes">${classes.map(cardClasse).join("")}</div>`
          : `<p class="muted">Nenhuma redução ou tratamento específico ligado a este código.</p>`}
        <div class="nota">Fora dessas hipóteses, aplica-se a <b>tributação integral</b> (CST 000, cClassTrib ${esc(r.regraGeral)}).</div>
        ${outras.length ? `<details class="outras"><summary>Outras ${outras.length} classificações permitidas para este código, sem redução</summary>
          <p class="muted">${r.impostoSeletivo?.incide ? "Produtos com Imposto Seletivo só podem usar as classificações desta lista." : "Situações específicas em que o código também pode ser usado."}</p>
          <div class="classes">${outras.map(cardClasse).join("")}</div></details>` : ""}
      </div>`;
  } catch (e) {
    ficha.innerHTML = `<a class="voltar" href="#/">← Início</a><p class="erro">${esc(e.message)}</p>`;
  }
}

// ---- roteamento ----------------------------------------------------------------------
function rotear() {
  const [, rota, arg] = decodeURIComponent(location.hash).split("/");
  if (rota === "busca" && arg) return mostrarBusca(arg);
  if ((rota === "ncm" || rota === "nbs") && arg) return mostrarItem(rota, arg);
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
document.querySelectorAll("input[name=tipo]").forEach((el) => el.addEventListener("change", () => {
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
