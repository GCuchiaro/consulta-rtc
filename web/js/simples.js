"use strict";
// Simulador do Simples Nacional: calculadora oficial do Simples, endpoint "não assistido" (todos os documentos).
(() => {
  const { $, $$, esc, reais, pct, hoje, api, postJSON, cabeca, guardar, ler, jsonBruto, falha, mostrarErro, limparErros, vigiarResultado, resultadoPronto } = RTC;
  const SN = "/api/oficial/sn/calculadora";
  const DOCS = { "55": "NF-e", "65": "NFC-e", "91": "NFS-e", "57": "CT-e", "67": "CT-e OS", "63": "BP-e", "62": "NFCom", "93": "NF3-e" };
  const ESTADOS = { CALCULADO: ["ok", "Calculado"], CALCULO_SIMULADO: ["info", "Calculado (simulado)"], NAO_CALCULADO: ["alerta", "Não calculado"],
    INCONSISTENCIA_ENTRADA: ["erro", "Dados inconsistentes"], NAO_IMPLEMENTADO: ["alerta", "Não implementado"], FALHA_TECNICA: ["erro", "Falha técnica"] };
  const st = { atividades: [], ultimo: null, link: null, marcar: () => {} };
  const num = (v, casas) => (v === "" || v == null || isNaN(v) ? undefined : Number(v).toFixed(casas));
  const nfse = (el) => $("#n-doc", el).value === "91";

  RTC.registrar("simples", {
    nav: "simuladores",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>02</b> · Simulador · Simples Nacional",
          "CBS e IBS para quem é do <em>Simples</em>",
          "Calcule a CBS e o IBS de uma nota emitida por empresa do Simples Nacional com a calculadora oficial do Simples. Informe as alíquotas efetivas do período, as mesmas do PGDAS, e a atividade de cada item.")}
        ${RTC.abasSimuladores("sn")}
        <form id="n-form" class="card" autocomplete="off" novalidate>
          <fieldset><legend>Documento e regime</legend>
            <div class="grade">
              <label class="campo c3"><span>Data do fato gerador</span><input id="n-data" type="date"></label>
              <label class="campo c3"><span>Documento fiscal</span><select id="n-doc">${Object.entries(DOCS).map(([v, t]) => `<option value="${v}">${t} · ${v}</option>`).join("")}</select></label>
              <label class="campo c3 so-crt"><span>Regime do emitente (CRT)</span><select id="n-crt">
                <option value="1">1 · Simples Nacional</option><option value="2">2 · Excesso de sublimite</option>
                <option value="3">3 · Regime normal</option><option value="4">4 · MEI</option></select></label>
              <label class="campo c3 so-crt"><span>Regime do IBS/CBS</span><select id="n-tpreg">
                <option value="">Não informado</option><option value="1">1 · Optou pelo regime regular</option><option value="2">2 · Opção pelo Simples pendente</option></select></label>
              <label class="campo c4 so-nfse" hidden><span>Situação no Simples</span><select id="n-op">
                <option value="3">3 · ME/EPP</option><option value="2">2 · MEI</option><option value="1">1 · Não optante</option><option value="4">4 · Opção pendente</option></select></label>
              <label class="campo c4 so-nfse" hidden><span>Apuração do IBS/CBS</span><select id="n-regibs">
                <option value="1">1 · IBS e CBS pelo Simples</option><option value="2">2 · CBS pelo Simples, IBS no regular</option><option value="3">3 · Os dois no regime regular</option></select></label>
              <label class="campo c4 so-nfse" hidden><span>Federais e ISS</span><select id="n-regtrib">
                <option value="1">1 · Federais e ISS pelo Simples</option><option value="2">2 · Federais pelo Simples, ISS fora</option><option value="3">3 · Federais e ISS fora</option></select></label>
              <label class="campo c4"><span>Compra governamental</span><select id="n-gov">
                <option value="">Não</option><option value="1">União</option><option value="2">Estado</option><option value="3">Distrito Federal</option><option value="4">Município</option></select></label>
            </div>
          </fieldset>
          <fieldset style="margin-top:var(--s-6)"><legend>Alíquotas efetivas do período (pontos percentuais)</legend>
            <div class="grade">
              <label class="check c4"><input type="checkbox" id="n-fatorr"> Fator "r" igual ou maior que 28%</label>
              <label class="check c4"><input type="checkbox" id="n-sublim"> Impedido de recolher IBS/ISS pelo Simples (sublimite)</label>
            </div>
            <div id="n-anexos"></div>
            <p class="nota">As alíquotas efetivas de CBS e IBS de cada anexo saem do cálculo do PGDAS do período (receita bruta dos últimos 12 meses). Só aparecem os anexos das atividades escolhidas.</p>
          </fieldset>
          <hr class="separador">
          <p class="eyebrow">Itens</p>
          <div id="n-itens"></div>
          <div class="acoes">
            <button type="button" class="btn btn-secundario" id="n-add">Adicionar item</button>
            <button type="submit" class="btn btn-primario mag">Calcular CBS e IBS <span class="ar" aria-hidden="true">→</span></button>
          </div>
        </form>
        <div id="n-res" aria-live="polite"></div>`;
      // A data não é guardada entre visitas (o Simples na reforma começa em 2027).
      $("#n-data", el).value = "2027-01-01";
      $("#n-doc", el).value = ler("rtc-sn-doc") || "55";
      $("#n-data", el).addEventListener("change", () => carregarAtividades(el));
      $("#n-doc", el).addEventListener("change", () => { guardar("rtc-sn-doc", $("#n-doc", el).value); ajustarDoc(el); carregarAtividades(el); });
      $("#n-fatorr", el).addEventListener("change", () => desenharAnexos(el));
      st.marcar = vigiarResultado($("#n-form", el), $("#n-res", el));
      $("#n-add", el).addEventListener("click", () => { adicionarItem(el); st.marcar(); });
      $("#n-form", el).addEventListener("submit", (ev) => { ev.preventDefault(); calcular(el); });
      ajustarDoc(el);
      adicionarItem(el);
      carregarAtividades(el);
    },
    entrar([, tipo, codigo], el) {
      document.title = "Simples Nacional · Consulta RTC";
      if (!((tipo === "ncm" || tipo === "nbs") && codigo)) { st.link = null; return; }
      if (st.link === location.hash) return; // voltou ao mesmo link: mantém o formulário
      st.link = location.hash;
      {
        if (tipo === "nbs") { $("#n-doc", el).value = "91"; ajustarDoc(el); carregarAtividades(el); }
        const it = $$(".item", el)[0] || adicionarItem(el);
        it.dataset.tipo = tipo; it.dataset.codigo = codigo; $(".cod-busca", it).value = codigo;
        if (!$(".valor", it).value) $(".valor", it).value = "1000";
        carregarClasses(el, it);
      }
    },
  });

  function ajustarDoc(el) {
    const ehNfse = nfse(el);
    $$(".so-crt", el).forEach((x) => { x.hidden = ehNfse; });
    $$(".so-nfse", el).forEach((x) => { x.hidden = !ehNfse; });
    $$(".item", el).forEach((it) => {
      $$(".so-nfse-item", it).forEach((x) => { x.hidden = !ehNfse; });
      $(".so-crt-item", it).hidden = ehNfse;
    });
    $("#n-add", el).hidden = ehNfse; // NFS-e: exatamente 1 item
    if (ehNfse) $$(".item", el).slice(1).forEach((it) => it.remove());
    renumerar(el);
  }

  async function carregarAtividades(el) {
    try {
      st.atividades = await api(`${SN}/simples-nacional/atividades?data=${$("#n-data", el).value || hoje()}&tpDoc=${$("#n-doc", el).value}`);
    } catch (e) { st.atividades = []; }
    $$(".item", el).forEach((it) => preencherAtividades(it));
    desenharAnexos(el);
  }

  function preencherAtividades(it) {
    const sel = $(".ativ", it), atual = sel.value;
    sel.innerHTML = `<option value="">Escolha a atividade</option>` + st.atividades.filter((a) => a.disponivel !== false)
      .map((a) => `<option value="${a.codigo}">${a.codigo} · Anexo ${esc(a.rotuloCurtoAnexo || a.anexoSemFatorR)} · ${esc(a.descricao.length > 90 ? a.descricao.slice(0, 88) + "…" : a.descricao)}</option>`).join("");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  }

  function anexoDe(cod, fatorR) {
    const a = st.atividades.find((x) => x.codigo === cod);
    if (!a) return null;
    return fatorR && a.anexoComFatorR ? a.anexoComFatorR : a.anexoSemFatorR;
  }

  function desenharAnexos(el) {
    const caixa = $("#n-anexos", el);
    const valores = {};
    $$("[data-anexo]", caixa).forEach((i) => { valores[i.dataset.anexo + i.dataset.campo] = i.value; });
    const fatorR = $("#n-fatorr", el).checked;
    const anexos = [...new Set($$(".item", el).map((it) => anexoDe($(".ativ", it).value, fatorR)).filter(Boolean))].sort();
    if (!anexos.length) { caixa.innerHTML = `<p class="muted" style="margin-top:var(--s-4)">Escolha a atividade dos itens para informar as alíquotas do anexo.</p>`; return; }
    const campo = (an, c, rot) => `<label class="campo c3"><span>${rot}</span><input type="number" step="0.0001" min="0" class="num" data-anexo="${an}" data-campo="${c}" value="${esc(valores[an + c] || "")}" placeholder="0,0000"></label>`;
    caixa.innerHTML = anexos.map((an) => `
      <div class="bloco"><p class="eyebrow">Anexo ${an}</p>
        <div class="grade">${campo(an, "pCBSSN", "CBS efetiva (%)")}${campo(an, "pIBSSN", "IBS efetivo (%)")}
          ${["III", "IV", "V"].includes(an) ? `${campo(an, "sCBS", "CBS sem redistribuição do ISS")}${campo(an, "sIBS", "IBS sem redistribuição do ISS")}` : ""}
        </div></div>`).join("");
  }

  function adicionarItem(el) {
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="item-topo"><p class="eyebrow">Item <span class="n"></span></p><button type="button" class="btn btn-fantasma btn-p remover">Remover</button></div>
      <div class="grade">
        <label class="campo c12"><span>Atividade do Simples Nacional (cAtivSN)</span><select class="ativ"><option value="">Carregando atividades</option></select></label>
        <label class="campo c6 sugestoes-wrap"><span>Produto ou serviço (opcional na NF-e)</span>
          <input class="cod-busca" type="text" placeholder="Nome ou código NCM/NBS" autocomplete="off"><ul class="sugestoes" hidden></ul><span class="escolhido"></span></label>
        <label class="campo c6"><span>Classificação tributária</span><select class="cclass"><option value="000001">000001 · Tributação integral (regra geral)</option></select></label>
        <label class="campo c4"><span>Receita do item (R$)</span><input class="valor" type="number" step="0.01" min="0" placeholder="0,00"></label>
        <label class="campo c4 so-crt-item"><span>Imposto Seletivo já calculado (R$)</span><input class="vis" type="number" step="0.01" min="0" value="0"></label>
        <label class="campo c4 so-nfse-item" hidden><span>Tributação do ISSQN</span><select class="tribiss">
          <option value="1">1 · Operação tributável</option><option value="2">2 · Imunidade</option><option value="3">3 · Exportação de serviço</option><option value="4">4 · Não incidência</option></select></label>
        <label class="campo c4 so-nfse-item" hidden><span>Retenção do ISSQN</span><select class="retiss">
          <option value="1">1 · Não retido</option><option value="2">2 · Retido pelo tomador</option><option value="3">3 · Retido pelo intermediário</option></select></label>
        <label class="campo c4 so-nfse-item" hidden><span>Benefício municipal do ISS</span><select class="tpbm">
          <option value="">Nenhum</option><option value="1">1 · Isenção</option><option value="2">2 · Redução da base em %</option><option value="3">3 · Redução da base em R$</option><option value="4">4 · Alíquota diferenciada</option></select></label>
      </div>`;
    $("#n-itens", el).appendChild(it);
    preencherAtividades(it);
    $(".ativ", it).addEventListener("change", () => desenharAnexos(el));
    $(".remover", it).addEventListener("click", () => { it.remove(); renumerar(el); desenharAnexos(el); st.marcar && st.marcar(); });
    RTC.ligarBuscaProduto(it, { data: () => $("#n-data", el).value || hoje(), aoEscolher: () => carregarClasses(el, it) });
    ajustarDoc(el);
    return it;
  }

  function renumerar(el) {
    const itens = $$(".item", el);
    itens.forEach((it, i) => { $(".n", it).textContent = String(i + 1).padStart(2, "0"); $(".remover", it).hidden = itens.length === 1; });
  }

  async function carregarClasses(el, it) {
    const { tipo, codigo } = it.dataset;
    if (!tipo || !codigo) return;
    const sel = $(".cclass", it), atual = sel.value;
    try {
      const { html, ficha } = await RTC.opcoesClassificacao(tipo, codigo, $("#n-data", el).value || hoje());
      sel.innerHTML = html;
      if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
      const campo = $(".cod-busca", it);
      if (campo.value === codigo) campo.value = `${ficha.codigoFormatado} · ${ficha.descricao || ""}`;
    } catch (e) { $(".escolhido", it).textContent = e.message; }
  }

  function montarPayload(el) {
    const ehNfse = nfse(el);
    const fatorR = $("#n-fatorr", el).checked;
    const op = { id: "consulta-rtc", versao: "3.0.0", data: $("#n-data", el).value, tpDoc: $("#n-doc", el).value };
    if (!op.data) throw falha("Informe a data do fato gerador.", $("#n-data", el));
    if (ehNfse) Object.assign(op, { opSimpNac: $("#n-op", el).value, regApIBSCBSSN: $("#n-regibs", el).value, regApTribSN: $("#n-regtrib", el).value });
    else { op.CRT = $("#n-crt", el).value; if ($("#n-tpreg", el).value) op.tpRegimeIBSCBS = $("#n-tpreg", el).value; }
    if (ehNfse && ["1", "2"].includes(op.opSimpNac)) { delete op.regApIBSCBSSN; delete op.regApTribSN; }
    if ($("#n-gov", el).value) op.tpEnteGov = $("#n-gov", el).value;
    const aliq = { fatorR, impedimentoSublimite: $("#n-sublim", el).checked };
    const porAnexo = {};
    $$("#n-anexos [data-anexo]", el).forEach((i) => { (porAnexo[i.dataset.anexo] ||= {})[i.dataset.campo] = i.value; });
    for (const [an, v] of Object.entries(porAnexo)) {
      const g = { pCBSSN: num(v.pCBSSN, 4), pIBSSN: num(v.pIBSSN, 4) };
      if (v.sCBS || v.sIBS) g.semRedistribuicaoISS = { pCBSSN: num(v.sCBS, 4), pIBSSN: num(v.sIBS, 4) };
      aliq[`anexo${an}`] = JSON.parse(JSON.stringify(g));
    }
    op.aliquotasEfetivas = aliq;
    op.itens = $$(".item", el).map((it, i) => {
      const valor = $(".valor", it).value;
      if (!(parseFloat(valor) >= 0)) throw falha(`Item ${i + 1}: informe a receita do item.`, $(".valor", it));
      const item = { numero: i + 1, cAtivSN: $(".ativ", it).value || undefined, cClassTrib: $(".cclass", it).value, baseCalculo: num(valor, 2) };
      if (it.dataset.codigo) item[it.dataset.tipo] = it.dataset.codigo;
      if (ehNfse) {
        item.tribISSQN = $(".tribiss", it).value;
        if (item.tribISSQN === "1") item.tpRetISSQN = $(".retiss", it).value;
        if ($(".tpbm", it).value) item.tpBM = $(".tpbm", it).value;
      } else item.valorImpostoSeletivo = num($(".vis", it).value || 0, 2);
      return JSON.parse(JSON.stringify(item));
    });
    return op;
  }

  async function calcular(el) {
    const alvo = $("#n-res", el);
    let op;
    const form = $("#n-form", el);
    try { op = montarPayload(el); } catch (e) { mostrarErro(form, alvo, e); return; }
    limparErros(form);
    resultadoPronto(alvo, false);
    alvo.innerHTML = `<p class="carregando">Calculando na calculadora oficial do Simples Nacional</p>`;
    try {
      const r = await postJSON(`${SN}/observabilidade/simples-nacional/nao-assistido`, op);
      alvo.innerHTML = resultado(el, r, op);
      resultadoPronto(alvo, true);
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      const c = e.corpo || {};
      const lista = c.erros || c.errors || [];
      alvo.innerHTML = `<div class="caixa-erro"><b>${esc(e.message)}</b>${lista.map((x) => `<p class="muted">${esc(x.detail || x.title || JSON.stringify(x))}</p>`).join("")}</div>
        <section class="card">${jsonBruto("Requisição enviada (JSON)", op)}${jsonBruto("Resposta (JSON)", c)}</section>`;
    }
  }

  function resultado(el, r, op) {
    const t = r.total || {};
    const rotulos = $$(".item", el).map((it) => { const a = $(".ativ", it); return a.selectedOptions[0]?.text || ""; });
    const resol = Object.fromEntries(((r.resolucaoAliquotas || {}).itens || []).map((x) => [x.numero, x]));
    const avisosGerais = [...((r.resolucaoAliquotas || {}).avisos || [])];
    const itens = (r.objetos || []).map((o) => {
      const [cls, txt] = ESTADOS[o.estadoItem] || ["", o.estadoItem];
      const rs = resol[o.nObj] || {};
      const tc = o.tribCalc || {};
      const cab = `<div class="card-titulo"><p class="eyebrow" style="margin:0">Item ${String(o.nObj).padStart(2, "0")} · ${esc(rotulos[o.nObj - 1])}</p><span class="tag ${cls}"><i></i>${esc(txt)}</span></div>`;
      const res = rs.anexoAplicado ? `<p class="muted mono" style="font-size:13px">Anexo ${esc(rs.anexoAplicado)} · ${esc((rs.regraAliquota || "").replace(/_/g, " ").toLowerCase())} · ${esc((rs.tipoAliquota || "").replace(/_/g, " ").toLowerCase())}</p>` : "";
      const avisos = [...(rs.avisos || []), ...(o.avisos || [])].map((a) => `<p class="aviso">${esc(typeof a === "string" ? a : a.mensagem || a.detail || JSON.stringify(a))}</p>`).join("");
      if (o.erros?.length) return `<article class="card">${cab}${res}${o.erros.map((e) => `<p><b>${esc(e.title)}</b> <span class="cod">${esc(e.code)}</span><br><span class="muted">${esc(e.detail)}</span></p>`).join("")}${avisos}</article>`;
      if (!o.tribCalc) return `<article class="card">${cab}${res}<p class="muted">${esc(rs.motivo ? `Motivo: ${rs.motivo.replace(/_/g, " ").toLowerCase()}.` : "Item não calculado pela calculadora oficial.")}</p>${avisos}</article>`;
      const mem = Object.entries(tc.memoriaCalculo || {}).map(([k, v]) => `<p><b>${k.toUpperCase()}.</b> ${esc(v)}</p>`).join("");
      return `<article class="card">${cab}${res}
        <p class="muted mono" style="font-size:13px">${esc(tc.tpRBSNDescricao || "")} · receita bruta ${reais(tc.vRBSNitem)} · base ${reais(tc.vBC)}</p>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Tributo</th><th class="num">Alíquota efetiva</th><th class="num">Devido</th><th class="num">Pendente/suspenso</th></tr></thead>
          <tbody><tr><td>CBS</td><td class="num">${pct(tc.pCBSSN)}</td><td class="num">${reais(tc.vCBSSN)}</td><td class="num">${reais(tc.vCBSPendSusp)}</td></tr>
            <tr><td>IBS</td><td class="num">${pct(tc.pIBSSN)}</td><td class="num">${reais(tc.vIBSSN)}</td><td class="num">${reais(tc.vIBSPendSusp)}</td></tr>
            ${tc.IS && Number(tc.IS.valor) ? `<tr><td>Imposto Seletivo (informado)</td><td class="num">—</td><td class="num">${reais(tc.IS.valor)}</td><td class="num">—</td></tr>` : ""}</tbody>
          <tfoot><tr><td colspan="2">Total do item</td><td class="num">${reais(tc.totalItem)}</td><td></td></tr></tfoot>
        </table></div>${avisos}
        ${mem ? `<details><summary>Memória de cálculo oficial</summary><div class="muted" style="font-size:13px;max-width:var(--measure)">${mem}</div></details>` : ""}
      </article>`;
    }).join("");
    return `
      ${avisosGerais.map((a) => `<p class="aviso">${esc(typeof a === "string" ? a : JSON.stringify(a))}</p>`).join("")}
      <p class="muted mono" style="margin-top:var(--s-6);font-size:13px">Regime de apuração: ${esc((r.oper?.regimeApuracao || "—").replace(/_/g, " "))} · documento ${esc(DOCS[op.tpDoc] || op.tpDoc)}</p>
      <div class="kpis">
        <div class="kpi"><span>Receita bruta</span><b>${reais(t.vRBSNtot)}</b></div>
        <div class="kpi"><span>CBS</span><b>${reais(t.vCBSSNtot)}</b>${Number(t.vCBSSNtotPendSusp) ? `<small>pendente ${reais(t.vCBSSNtotPendSusp)}</small>` : ""}</div>
        <div class="kpi"><span>IBS</span><b>${reais(t.vIBSSNtot)}</b>${Number(t.vIBSSNtotPendSusp) ? `<small>pendente ${reais(t.vIBSSNtotPendSusp)}</small>` : ""}</div>
        ${Number(t.totalIs) ? `<div class="kpi"><span>Imposto Seletivo</span><b>${reais(t.totalIs)}</b></div>` : ""}
        <div class="kpi total"><span>Total de tributos</span><b>${reais(t.totalTributos)}</b></div>
      </div>
      ${itens}
      <section class="card">${jsonBruto("Requisição enviada à calculadora oficial (JSON)", op)}${jsonBruto("Resposta da calculadora oficial (JSON)", r)}</section>`;
  }
})();
