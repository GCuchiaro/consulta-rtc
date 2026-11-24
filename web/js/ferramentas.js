"use strict";
// Bases de cálculo, pedágio, NFS-e e tabelas: formulários e consultas montados a partir do OpenAPI
// oficial. Campo novo numa versão oficial aparece aqui sem mudar o site.
(() => {
  const { $, $$, esc, hoje, api, postJSON, cabeca, tabelaDeObjetos, chaveValor, jsonBruto } = RTC;
  const SERV = { rr: "Regime regular", sn: "Simples Nacional" };
  const docs = {};
  const openapi = (s) => (docs[s] ||= api(`/api/oficial/${s}/openapi.json`));
  const chave = (s, p) => `${s}:${p}`;
  const rota = (base, s, p) => `#/${base}/${s}/${encodeURIComponent(p.replace(/^\//, ""))}`;

  // Telas com interface própria não aparecem nas listas automáticas.
  const DEDICADAS = new Set(["rr:/calculadora/regime-geral", "rr:/calculadora/observabilidade/regime-geral", "rr:/calculadora/xml/generate",
    "rr:/calculadora/xml/validate", "sn:/calculadora/observabilidade/simples-nacional/nao-assistido"]);

  const FERRAMENTAS = [
    ["rr", "/calculadora/base-calculo/base-calculo-unificada", "Base de cálculo unificada · NF-e e NFC-e", "Bases do regime regular, do Imposto Seletivo e do Simples a partir dos valores da nota, com a vigência de cada componente."],
    ["rr", "/calculadora/base-calculo/base-calculo-unificada-nfse", "Base de cálculo unificada · NFS-e", "Base de IBS e CBS da nota de serviço, com documentos de ajuste e locação. Experimental na versão oficial."],
    ["rr", "/calculadora/nfse/base-calculo", "Base de cálculo da NFS-e", "Valor do serviço menos descontos, reembolsos, deduções e tributos que saem da base."],
    ["rr", "/calculadora/base-calculo/cbs-ibs-mercadorias", "Base de CBS e IBS · mercadorias", "Composição da base de CBS/IBS na venda de bens: acréscimos, encargos, tributos e descontos."],
    ["rr", "/calculadora/base-calculo/is-mercadorias", "Base do Imposto Seletivo · mercadorias", "Composição da base do IS: valor do bem, acréscimos, tributos e devoluções."],
    ["rr", "/calculadora/pedagio", "Pedágio", "CBS e IBS do pedágio, repartidos pelos trechos e municípios atravessados."],
    ["rr", "/calculadora/nfse/indicador-operacao/validate", "Validar indicador de operação · NFS-e", "Confere se o cIndOp combina com o NBS e a classificação tributária na data."],
  ];

  const TABELAS = [
    ["rr", "/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs", "Classificações tributárias (cClassTrib) · CBS e IBS", "Todas as cClassTrib vigentes, com reduções, créditos e documentos."],
    ["rr", "/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs", "CST e suas classificações · CBS e IBS", "Situações tributárias com as classificações de cada uma."],
    ["rr", "/calculadora/dados-abertos/classificacoes-tributarias/imposto-seletivo", "Classificações do Imposto Seletivo", "cClassTrib do IS vigentes."],
    ["rr", "/calculadora/dados-abertos/fundamentacoes-legais", "Fundamentação legal", "Dispositivo da LC 214/2025 de cada classificação."],
    ["rr", "/calculadora/dados-abertos/aliquota-uniao", "Alíquota de referência · CBS", "Alíquota padrão ou de referência da União."],
    ["rr", "/calculadora/dados-abertos/aliquota-uf", "Alíquota de referência · IBS estadual", "Por UF (código IBGE)."],
    ["rr", "/calculadora/dados-abertos/aliquota-municipio", "Alíquota de referência · IBS municipal", "Por município (código IBGE)."],
    ["rr", "/calculadora/dados-abertos/redutores-compra-governamental", "Redutor de compra governamental", "Redução de alíquota nas compras de entes públicos."],
    ["rr", "/calculadora/dados-abertos/transferencias-cbs", "Transferência da CBS a entes", "Percentuais de transferência da CBS."],
    ["rr", "/calculadora/dados-abertos/transferencias-ibs", "Transferência do IBS a entes", "Percentuais de transferência do IBS."],
    ["rr", "/calculadora/nfse/indicador-operacao", "Indicadores de operação · NFS-e", "cIndOp, tipo de operação e local de incidência."],
    ["rr", "/calculadora/nfse/locais-incidencia", "Locais de incidência · NFS-e", "Onde o IBS é devido, por tipo de operação."],
    ["rr", "/calculadora/nfse/locais-fornecimento", "Locais de fornecimento · NFS-e", "Regras de local de fornecimento."],
    ["rr", "/calculadora/dados-abertos/ator/grupos", "Atores", "Grupos de atores (adquirente, fornecedor etc.) das classificações."],
    ["rr", "/calculadora/dados-abertos/dfe/grupos", "Documentos fiscais eletrônicos", "Tipos de DF-e agrupados."],
    ["sn", "/calculadora/simples-nacional/atividades", "Atividades do Simples Nacional", "cAtivSN, anexo, fator \"r\" e documentos admitidos."],
    ["rr", "/calculadora/dados-abertos/ufs", "UFs", "Unidades federativas e códigos IBGE."],
    ["rr", "/calculadora/dados-abertos/ufs/municipios", "Municípios", "Municípios de uma UF com código IBGE."],
  ];

  // ---------------- utilidades de schema ----------------
  function resolver(doc, s) {
    let n = 0;
    while (s && s.$ref && n++ < 20) s = doc.components.schemas[s.$ref.split("/").pop()];
    if (s && s.allOf) s = Object.assign({}, ...s.allOf.map((x) => resolver(doc, x)));
    return s || {};
  }
  function exemplo(doc, s, prof = 0) {
    s = resolver(doc, s);
    if (s.example !== undefined) return s.example;
    if (s.examples && s.examples.length) return s.examples[0];
    if (s.enum) return s.enum[0];
    if (prof > 4) return null;
    const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
    if (tipo === "object" || s.properties) return Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, exemplo(doc, v, prof + 1)]));
    if (tipo === "array") return [exemplo(doc, s.items || {}, prof + 1)];
    if (tipo === "integer" || tipo === "number") return 0;
    if (tipo === "boolean") return false;
    if (s.format === "date") return hoje();
    return "";
  }
  const tipoDe = (s) => (Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type) || (s.properties ? "object" : "string");
  function operacao(doc, caminho, metodo) { return ((doc.paths || {})[caminho] || {})[metodo]; }
  const descr = (t) => esc((t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

  // ---------------- índice de bases e cálculos ----------------
  RTC.registrar("ferramentas", {
    nav: "ferramentas",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>04</b> · Bases e cálculos",
          "Bases de cálculo, pedágio e <em>NFS-e</em>",
          "As demais calculadoras oficiais da Receita. Os formulários são montados a partir da documentação da própria API oficial: quando uma versão nova muda um campo, a mudança aparece aqui.")}
        <div class="indice">${FERRAMENTAS.map(([s, p, t, d]) => `<a href="${rota("ferramenta", s, p)}"><b>${esc(t)}</b><span class="indice-meta">${SERV[s]}</span><span>${esc(d)}</span></a>`).join("")}</div>
        <section id="f-outras"></section>`;
      outras(el, "post", "ferramenta", FERRAMENTAS, "#f-outras", "Outras operações oficiais");
    },
    entrar() { document.title = "Bases e cálculos · Consulta RTC"; },
  });

  async function outras(el, metodo, base, curadas, alvo, titulo) {
    const conhecidas = new Set(curadas.map(([s, p]) => chave(s, p)));
    const extras = [];
    for (const s of Object.keys(SERV)) {
      try {
        const doc = await openapi(s);
        for (const [p, ops] of Object.entries(doc.paths || {})) {
          const op = ops[metodo];
          if (!op || conhecidas.has(chave(s, p)) || DEDICADAS.has(chave(s, p)) || op.deprecated || /\{/.test(p) || /versao/.test(p)) continue;
          extras.push([s, p, op.summary || p, op.description || ""]);
        }
      } catch (e) { /* serviço fora do ar: lista só as curadas */ }
    }
    if (!extras.length) return;
    $(alvo, el).innerHTML = `<h2 class="secao" style="margin-top:var(--s-12)">${titulo}</h2><p class="muted" style="margin-top:0">Lidas da documentação oficial.</p>
      <div class="indice">${extras.map(([s, p, t, d]) => `<a href="${rota(base, s, p)}"><b>${esc(t)}</b><span class="indice-meta">${SERV[s]} · <span class="mono">${esc(p.replace("/calculadora/", ""))}</span></span><span>${descr(d).slice(0, 160)}</span></a>`).join("")}</div>`;
  }

  // ---------------- uma ferramenta (POST) ----------------
  RTC.registrar("ferramenta", {
    nav: "ferramentas",
    montar(el) { el.innerHTML = `<div id="fe-corpo"></div>`; },
    async entrar([, s, pCod], el) {
      const caminho = "/" + decodeURIComponent(pCod || "");
      const corpo = $("#fe-corpo", el);
      corpo.innerHTML = `<p class="carregando">Lendo a documentação oficial</p>`;
      const cur = FERRAMENTAS.find(([a, b]) => a === s && b === caminho);
      try {
        const doc = await openapi(s);
        const op = operacao(doc, caminho, "post");
        if (!op) throw new Error("Operação não encontrada na versão oficial em uso.");
        const titulo = cur ? cur[2] : op.summary || caminho;
        document.title = `${titulo} · Consulta RTC`;
        const schema = resolver(doc, op.requestBody?.content?.["application/json"]?.schema || {});
        const req = new Set(schema.required || []);
        const campos = Object.entries(schema.properties || {});
        corpo.innerHTML = `
          ${cabeca(`<b>04</b> · ${SERV[s]} · <span class="mono">${esc(caminho.replace("/calculadora/", ""))}</span>`, esc(titulo), descr(cur ? cur[3] : op.description))}
          <p><a href="#/ferramentas">${RTC.seta("esq")} Bases e cálculos</a></p>
          <form id="fe-form" class="card" novalidate>
            <div class="grade">${campos.map(([nome, v]) => campo(doc, nome, v, req.has(nome))).join("")}</div>
            <div class="acoes"><button type="button" class="btn btn-secundario" id="fe-ex">Preencher com o exemplo oficial</button><button class="btn btn-primario" type="submit">Calcular</button></div>
          </form>
          <div id="fe-res" aria-live="polite"></div>`;
        $("#fe-ex", corpo).addEventListener("click", () => preencherExemplo(doc, corpo, campos));
        $("#fe-form", corpo).addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const alvo = $("#fe-res", corpo);
          let dados;
          try { dados = lerCampos(doc, corpo, campos, req); } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; return; }
          alvo.innerHTML = `<p class="carregando">Calculando na API oficial</p>`;
          try {
            const r = await postJSON(`/api/oficial/${s}${caminho}`, dados);
            alvo.innerHTML = `<section class="card"><div class="card-titulo"><h3>Resultado</h3><span class="eyebrow">API oficial · ${SERV[s]}</span></div>
              ${resumoNumerico(r)}${chaveValor(r)}${jsonBruto("Requisição (JSON)", dados)}${jsonBruto("Resposta (JSON)", r)}</section>`;
          } catch (e) { alvo.innerHTML = erroOficial(e, dados); }
        });
      } catch (e) { corpo.innerHTML = `${cabeca("<b>04</b> · Bases e cálculos", "Ferramenta indisponível", "")}<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
    },
  });

  function campo(doc, nome, v, obrig) {
    const s = resolver(doc, v);
    const tipo = tipoDe(s);
    const rotulo = `<span>${esc(nome)}${obrig ? ' <span class="obrig">*</span>' : ""}</span>`;
    const dica = s.description ? `<span class="dica">${descr(s.description).slice(0, 220)}</span>` : "";
    const ex = s.example !== undefined && typeof s.example !== "object" ? ` placeholder="ex.: ${esc(s.example)}"` : "";
    if (s.enum) return `<label class="campo c4">${rotulo}<select data-campo="${esc(nome)}"><option value="">—</option>${s.enum.map((o) => `<option>${esc(o)}</option>`).join("")}</select>${dica}</label>`;
    if (tipo === "boolean") return `<label class="check c4"><input type="checkbox" data-campo="${esc(nome)}"> ${esc(nome)}</label>`;
    if (tipo === "object" || tipo === "array") {
      return `<label class="campo c12">${rotulo}<textarea rows="6" data-campo="${esc(nome)}" data-json="1" spellcheck="false">${esc(JSON.stringify(exemplo(doc, s), null, 2))}</textarea>${dica || '<span class="dica">JSON. Edite o exemplo.</span>'}</label>`;
    }
    if (tipo === "integer" || tipo === "number") return `<label class="campo c4">${rotulo}<input type="number" step="any" data-campo="${esc(nome)}" data-num="1"${ex}>${dica}</label>`;
    if (s.format === "date") return `<label class="campo c4">${rotulo}<input type="date" data-campo="${esc(nome)}">${dica}</label>`;
    return `<label class="campo c4">${rotulo}<input type="text" data-campo="${esc(nome)}"${ex}>${dica}</label>`;
  }

  // Exemplo oficial com as datas trazidas para hoje (os exemplos da documentação fixam datas
  // que podem não ter alíquota de referência cadastrada).
  function atualizarDatas(nome, ex) {
    if (typeof ex === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ex)) return `${hoje()}T10:00:00-03:00`;
    if (typeof ex === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ex)) return hoje();
    if (/^ano/i.test(nome) && typeof ex === "number") return Number(hoje().slice(0, 4));
    return ex;
  }
  function preencherExemplo(doc, corpo, campos) {
    for (const [nome, v] of campos) {
      const el = $(`[data-campo="${CSS.escape(nome)}"]`, corpo);
      const ex = atualizarDatas(nome, exemplo(doc, v));
      if (!el || ex == null) continue;
      if (el.type === "checkbox") el.checked = !!ex;
      else if (el.dataset.json) el.value = JSON.stringify(ex, null, 2);
      else if (el.tagName === "SELECT") {
        const op = [...el.options].find((o) => o.value.toLowerCase() === String(ex).toLowerCase());
        if (op) el.value = op.value;
      } else el.value = ex;
    }
  }

  function lerCampos(doc, corpo, campos, req) {
    const dados = {};
    for (const [nome] of campos) {
      const el = $(`[data-campo="${CSS.escape(nome)}"]`, corpo);
      if (!el) continue;
      if (el.type === "checkbox") { if (el.checked) dados[nome] = true; continue; }
      const v = el.value.trim();
      if (v === "") { if (req.has(nome)) throw new Error(`Preencha o campo obrigatório ${nome}.`); continue; }
      if (el.dataset.json) { try { dados[nome] = JSON.parse(v); } catch (e) { throw new Error(`O campo ${nome} precisa ser um JSON válido.`); } }
      else if (el.dataset.num) dados[nome] = Number(v);
      else dados[nome] = v;
    }
    return dados;
  }

  // Valores numéricos de primeiro nível em destaque (ex.: baseRG, baseIS, baseSN).
  function resumoNumerico(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return "";
    const nums = Object.entries(r).filter(([k, v]) => typeof v === "number" && !/munic|codigo|^uf|numero|^cst|^ano|^id/i.test(k));
    if (!nums.length || nums.length > 6) return "";
    return `<div class="kpis" style="margin-bottom:var(--s-4)">${nums.map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><b>${RTC.nf(2).format(Number(v))}</b></div>`).join("")}</div>`;
  }

  function erroOficial(e, dados) {
    const c = e.corpo || {};
    const det = [...(c.violations || []), ...(c.errors || []), ...(c.erros || [])]
      .map((x) => `<li>${esc(x.field || x.pointer || x.campo || "")} ${esc(x.message || x.detail || x.mensagem || x.title || JSON.stringify(x))}</li>`).join("");
    return `<div class="caixa-erro"><b>${esc(e.message)}</b>${det ? `<ul class="muted">${det}</ul>` : ""}</div>
      <section class="card">${jsonBruto("Requisição (JSON)", dados)}${jsonBruto("Resposta (JSON)", c)}</section>`;
  }

  // ---------------- tabelas (GET) ----------------
  RTC.registrar("tabelas", {
    nav: "tabelas",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>05</b> · Tabelas oficiais",
          "As tabelas da Reforma, em <em>dados abertos</em>",
          "Classificações, CST, fundamentação legal, alíquotas de referência, regras da NFS-e e atividades do Simples Nacional, direto da base da calculadora oficial, na data que você escolher.")}
        <div class="indice">${TABELAS.map(([s, p, t, d]) => `<a href="${rota("tabela", s, p)}"><b>${esc(t)}</b><span class="indice-meta">${SERV[s]}</span><span>${esc(d)}</span></a>`).join("")}</div>
        <section id="t-outras"></section>`;
      outras(el, "get", "tabela", TABELAS, "#t-outras", "Outras consultas oficiais");
    },
    entrar() { document.title = "Tabelas · Consulta RTC"; },
  });

  const PADROES = { data: () => hoje(), dataOcorrenciaFatoGerador: () => hoje(), siglaUf: () => "SP", codigoUf: () => "35", codigoMunicipio: () => "3550308", platform: () => "" };

  RTC.registrar("tabela", {
    nav: "tabelas",
    montar(el) { el.innerHTML = `<div id="ta-corpo"></div>`; },
    async entrar([, s, pCod], el) {
      const caminho = "/" + decodeURIComponent(pCod || "");
      const corpo = $("#ta-corpo", el);
      corpo.innerHTML = `<p class="carregando">Lendo a documentação oficial</p>`;
      const cur = TABELAS.find(([a, b]) => a === s && b === caminho);
      try {
        const doc = await openapi(s);
        const op = operacao(doc, caminho, "get");
        if (!op) throw new Error("Consulta não encontrada na versão oficial em uso.");
        const titulo = cur ? cur[2] : op.summary || caminho;
        document.title = `${titulo} · Consulta RTC`;
        const params = (op.parameters || []).filter((p) => p.in === "query");
        corpo.innerHTML = `
          ${cabeca(`<b>05</b> · ${SERV[s]} · <span class="mono">${esc(caminho.replace("/calculadora/", ""))}</span>`, esc(titulo), descr(cur ? cur[3] : op.description))}
          <p><a href="#/tabelas">${RTC.seta("esq")} Tabelas</a></p>
          <form id="ta-form" class="card" novalidate>
            ${params.length ? `<div class="grade">${params.map((p) => {
              const sch = resolver(doc, p.schema || {});
              const t = sch.format === "date" ? "date" : (tipoDe(sch) === "integer" ? "number" : "text");
              let pad = PADROES[p.name] ? PADROES[p.name]() : "";
              // As tabelas do Simples Nacional (CBS/IBS) só valem a partir de 2027.
              if (s === "sn" && p.name === "data" && pad < "2027-01-01") pad = "2027-01-01";
              return `<label class="campo c4"><span>${esc(p.name)}${p.required ? ' <span class="obrig">*</span>' : ""}</span>
                <input type="${t}" data-param="${esc(p.name)}" value="${esc(pad)}"${sch.example !== undefined ? ` placeholder="ex.: ${esc(sch.example)}"` : ""}>
                ${p.description ? `<span class="dica">${descr(p.description).slice(0, 160)}</span>` : ""}</label>`;
            }).join("")}</div>` : `<p class="muted">Esta consulta não tem parâmetros.</p>`}
            <div class="acoes"><button class="btn btn-primario" type="submit">Consultar</button></div>
          </form>
          <div id="ta-res" aria-live="polite"></div>`;
        const consultar = async () => {
          const alvo = $("#ta-res", corpo);
          const q = new URLSearchParams();
          for (const i of $$("[data-param]", corpo)) {
            if (i.value.trim()) q.set(i.dataset.param, i.value.trim());
            else if (params.find((p) => p.name === i.dataset.param)?.required) { alvo.innerHTML = `<p class="caixa-erro"><b>Preencha ${esc(i.dataset.param)}.</b></p>`; return; }
          }
          alvo.innerHTML = `<p class="carregando">Consultando a base oficial</p>`;
          try {
            const r = await api(`/api/oficial/${s}${caminho}?${q}`);
            mostrarTabela(alvo, r, titulo);
          } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.status === 404 ? "Nenhum registro para esses parâmetros. " : "")}${esc(e.message)}</b></p>`; }
        };
        $("#ta-form", corpo).addEventListener("submit", (ev) => { ev.preventDefault(); consultar(); });
        if (params.every((p) => !p.required || PADROES[p.name])) consultar();
      } catch (e) { corpo.innerHTML = `${cabeca("<b>05</b> · Tabelas", "Consulta indisponível", "")}<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
    },
  });

  // Achata listas aninhadas (ex.: CST com suas classificações) em linhas.
  function achatar(lista) {
    if (!Array.isArray(lista) || !lista.length || typeof lista[0] !== "object") return lista;
    const filho = Object.keys(lista[0]).find((k) => Array.isArray(lista[0][k]) && lista[0][k].length && typeof lista[0][k][0] === "object");
    if (!filho) return lista;
    return lista.flatMap((o) => {
      const pai = Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== filho && (v === null || typeof v !== "object")).map(([k, v]) => [`${k}`, v]));
      const filhos = o[filho] || [];
      return filhos.length ? filhos.map((f) => ({ ...pai, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [pai[k] !== undefined ? `${filho}.${k}` : k, v])) })) : [pai];
    });
  }

  function mostrarTabela(alvo, r, titulo) {
    const lista = Array.isArray(r) ? achatar(r) : null;
    if (!lista) { alvo.innerHTML = `<section class="card">${chaveValor(r)}${jsonBruto("JSON", r)}</section>`; return; }
    alvo.innerHTML = `<section class="card">
      <div class="card-titulo"><h3>${lista.length} registro(s)</h3>
        <div style="display:flex;gap:var(--s-2);flex-wrap:wrap"><input type="search" id="ta-filtro" placeholder="Filtrar" style="max-width:260px"><button type="button" class="btn btn-secundario btn-p" id="ta-csv">Baixar CSV</button></div></div>
      <div id="ta-tab">${tabelaDeObjetos(lista)}</div></section>`;
    const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    $("#ta-filtro", alvo).addEventListener("input", (ev) => {
      const q = norm(ev.target.value.trim());
      const f = q ? lista.filter((o) => norm(JSON.stringify(o)).includes(q)) : lista;
      $("#ta-tab", alvo).innerHTML = tabelaDeObjetos(f);
    });
    $("#ta-csv", alvo).addEventListener("click", () => {
      const cols = [...new Set(lista.flatMap((o) => Object.keys(o)))];
      const cel = (v) => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const csv = "﻿" + [cols.join(";"), ...lista.map((o) => cols.map((c) => cel(o[c])).join(";"))].join("\n");
      RTC.baixar(`${titulo.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`, csv, "text/csv;charset=utf-8");
    });
  }
})();
