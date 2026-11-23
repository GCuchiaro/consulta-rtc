"use strict";
// Simulador do regime regular (CBS, IBS e IS) + campo de busca de produto reutilizado pelo Simples.
(() => {
  const { $, $$, esc, reais, pct, hoje, api, postJSON, baixar, cabeca, subNav, guardar, ler, jsonBruto } = RTC;

  RTC.abasSimuladores = (ativo) => subNav([["#/simulador", "Regime regular", "rr"], ["#/simples", "Simples Nacional", "sn"]], ativo);

  // ---- campo de produto/serviço com sugestões (usado nos dois simuladores) ----
  RTC.ligarBuscaProduto = function (item, { data, aoEscolher }) {
    const input = $(".cod-busca", item);
    const ul = $(".sugestoes", item);
    let timer, ultimo = "";
    input.addEventListener("input", () => {
      item.dataset.tipo = ""; item.dataset.codigo = "";
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { ul.hidden = true; return; }
      timer = setTimeout(async () => {
        ultimo = q;
        try {
          const r = await api(`/api/busca?q=${encodeURIComponent(q)}&tipo=todos&data=${data()}`);
          if (ultimo !== q) return;
          const itens = [...(r.ncm || []).slice(0, 8).map((i) => ({ ...i, tipo: "ncm" })), ...(r.nbs || []).slice(0, 6).map((i) => ({ ...i, tipo: "nbs" }))];
          ul.innerHTML = itens.length ? itens.map((i) => `<li><button type="button" data-tipo="${i.tipo}" data-codigo="${i.codigo}" data-rotulo="${esc(`${i.codigoFormatado} · ${i.descricao}`)}">
              <span class="cod">${i.tipo.toUpperCase()} ${esc(i.codigoFormatado)}</span>
              <span>${(i.caminho || []).length ? `<span class="trilha">${esc(i.caminho.slice(-2).join(" › "))}</span>` : ""}${esc(i.descricao)}</span></button></li>`).join("")
            : `<li class="vazio">Nada encontrado com esse termo</li>`;
          ul.hidden = false;
        } catch (e) { ul.hidden = true; }
      }, 250);
    });
    ul.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-codigo]");
      if (!b) return;
      item.dataset.tipo = b.dataset.tipo; item.dataset.codigo = b.dataset.codigo;
      input.value = b.dataset.rotulo; ul.hidden = true;
      aoEscolher(b.dataset.tipo, b.dataset.codigo);
    });
    input.addEventListener("keydown", (ev) => { if (ev.key === "Escape") ul.hidden = true; });
    document.addEventListener("click", (ev) => { if (!item.contains(ev.target)) ul.hidden = true; });
  };

  // Opções de cClassTrib para um código (regra geral + benefícios + outras aceitas).
  RTC.opcoesClassificacao = async function (tipo, codigo, data) {
    const r = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${codigo}?data=${data}`);
    const opt = (c) => `<option value="${c.cClassTrib}">${c.cClassTrib} · ${esc(c.descricao.length > 80 ? c.descricao.slice(0, 78) + "…" : c.descricao)}</option>`;
    const html = `<option value="000001">000001 · Tributação integral (regra geral)</option>`
      + ((r.classificacoes || []).length ? `<optgroup label="Benefícios deste código">${r.classificacoes.map(opt).join("")}</optgroup>` : "")
      + ((r.outrasPermitidas || []).length ? `<optgroup label="Outras aceitas">${r.outrasPermitidas.map(opt).join("")}</optgroup>` : "");
    return { html, ficha: r };
  };

  const est = { seq: 0, ultimo: null };
  const desde2027 = (el) => ($("#s-data", el).value || "") >= "2027-01-01";

  RTC.registrar("simulador", {
    nav: "simuladores",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>02</b> · Simulador · regime regular",
          "Simule CBS, IBS e Imposto Seletivo de uma <em>operação</em>",
          "Monte a operação e veja os tributos calculados pela calculadora oficial, item a item, com a memória de cálculo. O resultado gera o XML dos grupos de tributação da nota.")}
        ${RTC.abasSimuladores("rr")}
        <form id="s-form" class="card" autocomplete="off" novalidate>
          <fieldset><legend>Operação</legend>
            <div class="grade">
              <label class="campo c3"><span>Data do fato gerador</span><input id="s-data" type="date" required></label>
              <label class="campo c3"><span>UF</span><select id="s-uf" required></select></label>
              <label class="campo c6"><span>Município</span><select id="s-mun" required><option value="">Escolha a UF</option></select></label>
            </div>
          </fieldset>
          <fieldset id="s-aliq" hidden style="margin-top:var(--space-6)"><legend>Alíquotas nominais · obrigatórias a partir de 2027</legend>
            <div class="grade">
              <label class="campo c4"><span>CBS (%)</span><input id="s-cbs" type="number" step="0.0001" min="0" value="8.8"></label>
              <label class="campo c4"><span>IBS estadual (%)</span><input id="s-ibsuf" type="number" step="0.0001" min="0" value="0.05"></label>
              <label class="campo c4"><span>IBS municipal (%)</span><input id="s-ibsmun" type="number" step="0.0001" min="0" value="0.05"></label>
            </div>
            <p class="nota">Pré-preenchidas com o exemplo da documentação oficial. As alíquotas definitivas ainda serão fixadas por resolução; o resultado sai marcado como simulado.</p>
          </fieldset>
          <p class="nota" id="s-2026">Em 2026 a calculadora usa as alíquotas de teste oficiais: CBS 0,9% e IBS 0,1%.</p>
          <hr class="separador">
          <div class="card-titulo"><p class="eyebrow" style="margin:0">Itens</p></div>
          <div id="s-itens"></div>
          <div class="acoes">
            <button type="button" class="btn btn-secundario" id="s-add">Adicionar item</button>
            <button type="submit" class="btn btn-primario">Calcular tributos</button>
          </div>
        </form>
        <div id="s-res" aria-live="polite"></div>`;
      $("#s-data", el).value = ler("rtc-sim-data") || hoje();
      $("#s-data", el).addEventListener("change", () => {
        guardar("rtc-sim-data", $("#s-data", el).value);
        atualizarAliq(el);
        $$(".item", el).forEach((it) => carregarClasses(el, it));
      });
      atualizarAliq(el);
      RTC.preencherUfMunicipio($("#s-uf", el), $("#s-mun", el), "rtc-sim");
      $("#s-add", el).addEventListener("click", () => adicionarItem(el));
      $("#s-form", el).addEventListener("submit", (ev) => { ev.preventDefault(); calcular(el); });
      adicionarItem(el);
    },
    entrar([, tipo, codigo], el) {
      document.title = "Simulador · Consulta RTC";
      if ((tipo === "ncm" || tipo === "nbs") && codigo) {
        const vazio = $$(".item", el).find((it) => !it.dataset.codigo);
        if (vazio) vazio.remove();
        adicionarItem(el, { tipo, codigo });
        history.replaceState(null, "", "#/simulador");
      }
    },
  });

  // UF + município (compartilhado com outras telas)
  RTC.preencherUfMunicipio = async function (selUf, selMun, chave) {
    const capitais = { SP: 3550308, RJ: 3304557, MG: 3106200, RS: 4314902, PR: 4106902, SC: 4205407, BA: 2927408, DF: 5300108, PE: 2611606, CE: 2304400, GO: 5208707 };
    async function municipios(preferido) {
      const uf = selUf.value;
      selMun.innerHTML = `<option value="">${uf ? "Carregando" : "Escolha a UF"}</option>`;
      if (!uf) return;
      const lista = await api(`/api/municipios?uf=${uf}`);
      selMun.innerHTML = lista.map((m) => `<option value="${m.codigo}">${esc(m.nome)}</option>`).join("");
      const alvo = lista.find((m) => String(m.codigo) === String(preferido)) || lista.find((m) => m.codigo === capitais[uf]) || lista[0];
      if (alvo) selMun.value = alvo.codigo;
    }
    try {
      const ufs = await api("/api/ufs");
      selUf.innerHTML = `<option value="">UF</option>` + ufs.map((u) => `<option value="${u.sigla}">${u.sigla} · ${esc(u.nome)}</option>`).join("");
      selUf.value = ler(`${chave}-uf`) || "SP";
      await municipios(ler(`${chave}-mun`));
    } catch (e) { selMun.innerHTML = `<option value="">${esc(e.message)}</option>`; }
    selUf.addEventListener("change", () => { guardar(`${chave}-uf`, selUf.value); municipios(); });
    selMun.addEventListener("change", () => guardar(`${chave}-mun`, selMun.value));
  };

  function atualizarAliq(el) {
    $("#s-aliq", el).hidden = !desde2027(el);
    $("#s-2026", el).hidden = desde2027(el);
    $$(".item", el).forEach((it) => { $(".campo-is", it).hidden = !(it.dataset.is && desde2027(el)); });
  }

  function adicionarItem(el, pre = {}) {
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="item-topo"><p class="eyebrow">Item <span class="n"></span></p><button type="button" class="btn btn-fantasma btn-p remover">Remover</button></div>
      <div class="grade">
        <label class="campo c6 sugestoes-wrap"><span>Produto ou serviço</span>
          <input class="cod-busca" type="text" placeholder="Nome ou código NCM/NBS" autocomplete="off">
          <ul class="sugestoes" hidden></ul><span class="escolhido"></span></label>
        <label class="campo c3"><span>Valor (R$)</span><input class="valor" type="number" step="0.01" min="0" placeholder="0,00"></label>
        <label class="campo c3"><span>Quantidade</span><input class="qtd" type="number" step="0.0001" min="0" placeholder="1"></label>
        <label class="campo c8"><span>Classificação tributária</span><select class="cclass"><option value="000001">000001 · Tributação integral (regra geral)</option></select></label>
        <label class="campo c4 campo-is" hidden><span>Alíquota do IS (%)</span><input class="aliq-is" type="number" step="0.0001" min="0" placeholder="ex.: 10"></label>
      </div>`;
    $("#s-itens", el).appendChild(it);
    renumerar(el);
    $(".remover", it).addEventListener("click", () => { it.remove(); renumerar(el); });
    RTC.ligarBuscaProduto(it, { data: () => $("#s-data", el).value || hoje(), aoEscolher: () => carregarClasses(el, it) });
    if (pre.tipo && pre.codigo) { it.dataset.tipo = pre.tipo; it.dataset.codigo = pre.codigo; $(".cod-busca", it).value = pre.codigo; carregarClasses(el, it); }
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
      const { html, ficha } = await RTC.opcoesClassificacao(tipo, codigo, $("#s-data", el).value || hoje());
      sel.innerHTML = html;
      if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
      it.dataset.is = ficha.impostoSeletivo?.incide ? "1" : "";
      const campo = $(".cod-busca", it);
      if (campo.value === codigo) campo.value = `${ficha.codigoFormatado} · ${ficha.descricao || ""}`;
      $(".escolhido", it).textContent = ficha.impostoSeletivo?.incide ? "Incide Imposto Seletivo" : "";
      atualizarAliq(el);
    } catch (e) { $(".escolhido", it).textContent = e.message; }
  }

  function lerForm(el) {
    const itens = $$(".item", el).map((it, i) => {
      if (!it.dataset.codigo) throw new Error(`Item ${i + 1}: escolha o produto ou serviço na lista de sugestões.`);
      const valor = parseFloat($(".valor", it).value);
      if (!(valor >= 0)) throw new Error(`Item ${i + 1}: informe o valor.`);
      const item = { tipo: it.dataset.tipo, codigo: it.dataset.codigo, cClassTrib: $(".cclass", it).value, valor };
      const qtd = parseFloat($(".qtd", it).value); if (qtd > 0) item.quantidade = qtd;
      const is = parseFloat($(".aliq-is", it).value); if (!$(".campo-is", it).hidden && is >= 0) item.aliquotaIS = is;
      return item;
    });
    const d = { data: $("#s-data", el).value, uf: $("#s-uf", el).value, municipio: Number($("#s-mun", el).value), itens };
    if (!d.data) throw new Error("Informe a data do fato gerador.");
    if (!d.uf || !d.municipio) throw new Error("Escolha a UF e o município.");
    if (desde2027(el)) d.aliquotas = { cbs: +$("#s-cbs", el).value || 0, ibsEstadual: +$("#s-ibsuf", el).value || 0, ibsMunicipal: +$("#s-ibsmun", el).value || 0 };
    return d;
  }

  async function calcular(el) {
    const alvo = $("#s-res", el);
    let dados;
    try { dados = lerForm(el); } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; return; }
    alvo.innerHTML = `<p class="carregando">Calculando na calculadora oficial</p>`;
    try {
      const r = await postJSON("/api/simular", dados);
      est.ultimo = dados;
      alvo.innerHTML = resultado(el, r);
      ligarXml(el);
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
  }

  function linha(nome, t) {
    if (!t) return "";
    return `<tr><td>${nome}</td><td class="num">${pct(t.aliquota)}</td><td class="num">${t.reducao != null ? pct(t.reducao) : "—"}</td>
      <td class="num">${pct(t.aliquotaEfetiva)}</td><td class="num">${reais(t.valor)}</td></tr>`;
  }

  function resultado(el, r) {
    const t = r.totais || {};
    const rotulos = $$(".item", el).map((it) => $(".cod-busca", it).value);
    const itens = (r.itens || []).map((i) => {
      const nome = `<p class="eyebrow">Item ${String(i.numero).padStart(2, "0")} · ${esc(rotulos[i.numero - 1] || "")}</p>`;
      if (i.erros?.length) return `<article class="card">${nome}<span class="tag erro"><i></i>${esc(i.estadoTexto)}</span>
        ${i.erros.map((e) => `<p><b>${esc(e.titulo)}</b> <span class="cod">${esc(e.codigo)}</span><br><span class="muted">${esc(e.detalhe)}</span></p>`).join("")}</article>`;
      const mem = Object.entries(i.memoria || {}).map(([k, v]) => `<p><b>${{ cbs: "CBS", ibsUF: "IBS estadual", ibsMun: "IBS municipal", is: "Imposto Seletivo" }[k] || esc(k)}.</b> ${esc(v)}</p>`).join("");
      const subtotal = [i.cbs?.valor, i.ibsUf?.valor, i.ibsMun?.valor, i.is?.valor].reduce((a, b) => a + (Number(b) || 0), 0);
      return `<article class="card">
        <div class="card-titulo">${nome}<span class="tag ${i.estado === "CALCULADO" ? "ok" : "info"}"><i></i>${esc(i.estadoTexto)}</span></div>
        <p class="muted mono" style="font-size:13px">CST ${esc(i.cst)} · cClassTrib ${esc(i.cClassTrib)} · base de cálculo ${reais(i.base)}</p>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Tributo</th><th class="num">Alíquota</th><th class="num">Redução</th><th class="num">Efetiva</th><th class="num">Valor</th></tr></thead>
          <tbody>${linha("CBS", i.cbs)}${linha("IBS estadual", i.ibsUf)}${linha("IBS municipal", i.ibsMun)}
            ${i.is ? `<tr><td>Imposto Seletivo</td><td class="num">${pct(i.is.aliquota)}</td><td class="num">—</td><td class="num">${pct(i.is.aliquota)}</td><td class="num">${reais(i.is.valor)}</td></tr>` : ""}</tbody>
          <tfoot><tr><td colspan="4">Total do item</td><td class="num">${reais(subtotal)}</td></tr></tfoot>
        </table></div>
        ${mem ? `<details><summary>Memória de cálculo oficial</summary><div class="muted" style="font-size:13px;max-width:var(--measure)">${mem}</div></details>` : ""}
      </article>`;
    }).join("");
    return `
      ${(r.avisos || []).map((a) => `<p class="aviso">${esc(a)}</p>`).join("")}
      <div class="kpis">
        <div class="kpi"><span>Base de cálculo</span><b>${reais(t.base)}</b></div>
        <div class="kpi"><span>CBS</span><b>${reais(t.cbs)}</b></div>
        <div class="kpi"><span>IBS</span><b>${reais(t.ibs)}</b><small>UF ${reais(t.ibsUf)} · mun. ${reais(t.ibsMun)}</small></div>
        ${t.is ? `<div class="kpi"><span>Imposto Seletivo</span><b>${reais(t.is)}</b></div>` : ""}
        <div class="kpi total"><span>Total de tributos</span><b>${reais(t.total)}</b></div>
      </div>
      ${r.itensComErro ? `<p class="aviso">${r.itensComErro} item(ns) com inconsistência ficaram fora dos totais.</p>` : ""}
      ${itens}
      <section class="card">
        <div class="card-titulo"><h3>XML dos grupos de tributação</h3><span class="eyebrow">gerado pela calculadora oficial</span></div>
        <div class="grade" style="align-items:end">
          <label class="campo c4"><span>Documento</span><select id="s-xml-tipo">
            <option value="nfe">NF-e</option><option value="nfce">NFC-e</option><option value="nfse">NFS-e</option>
            <option value="cte">CT-e</option><option value="bpe">BP-e</option><option value="nf3e">NF3-e</option></select></label>
          <div class="c8"><button type="button" class="btn btn-secundario" id="s-xml">Baixar XML</button> <span class="muted" id="s-xml-msg"></span></div>
        </div>
        ${r.itensComErro ? `<p class="nota">Para gerar o XML, corrija os itens com inconsistência: a geração usa o cálculo oficial sem tolerância a erro.</p>` : ""}
      </section>
      <section class="card">${jsonBruto("Requisição enviada à calculadora oficial (JSON)", r.oficial?.requisicao)}${jsonBruto("Resposta da calculadora oficial (JSON)", r.oficial?.resposta)}</section>`;
  }

  function ligarXml(el) {
    $("#s-xml", el)?.addEventListener("click", async () => {
      const tipo = $("#s-xml-tipo", el).value, msg = $("#s-xml-msg", el);
      msg.textContent = "Gerando";
      try {
        const r = await fetch(`/api/simular/xml?tipo=${tipo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(est.ultimo) });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.erro || `Erro ${r.status}`); }
        baixar(`tributacao-${tipo}.xml`, await r.blob());
        msg.textContent = "";
      } catch (e) { msg.innerHTML = `<span class="erro">${esc(e.message)}</span>`; }
    });
  }
})();
