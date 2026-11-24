"use strict";
// Simulador do regime regular (CBS, IBS e IS) + campo de busca de produto reutilizado pelo Simples.
(() => {
  const { $, $$, esc, reais, pct, hoje, api, postJSON, baixar, cabeca, subNav, jsonBruto, guardar, ler,
    falha, mostrarErro, limparErros, vigiarResultado, resultadoPronto } = RTC;

  RTC.seqSugestoes = 0;
  RTC.abasSimuladores = (ativo) => subNav([["#/simulador", "Regime regular", "rr"], ["#/simples", "Simples Nacional", "sn"]], ativo);

  // ---- campo de produto/serviço com sugestões (usado nos dois simuladores) ----
  RTC.ligarBuscaProduto = function (item, { data, aoEscolher }) {
    const input = $(".cod-busca", item);
    const ul = $(".sugestoes", item);
    const id = `sug-${++RTC.seqSugestoes}`;
    ul.id = id; ul.setAttribute("role", "listbox");
    Object.entries({ role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": id })
      .forEach(([k, v]) => input.setAttribute(k, v));
    const abrir = (sim) => { ul.hidden = !sim; input.setAttribute("aria-expanded", String(sim)); };
    let timer, ultimo = "";
    input.addEventListener("input", () => {
      item.dataset.tipo = ""; item.dataset.codigo = "";
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { abrir(false); return; }
      timer = setTimeout(async () => {
        ultimo = q;
        try {
          const r = await api(`/api/busca?q=${encodeURIComponent(q)}&tipo=todos&data=${data()}`);
          if (ultimo !== q) return;
          const itens = [...(r.ncm || []).slice(0, 8).map((i) => ({ ...i, tipo: "ncm" })), ...(r.nbs || []).slice(0, 6).map((i) => ({ ...i, tipo: "nbs" }))];
          ul.innerHTML = itens.length ? itens.map((i) => `<li role="none"><button type="button" role="option" tabindex="-1" data-tipo="${i.tipo}" data-codigo="${i.codigo}" data-rotulo="${esc(`${i.codigoFormatado} · ${i.descricao}`)}">
              <span class="cod">${i.tipo.toUpperCase()} ${esc(i.codigoFormatado)}</span>
              <span>${(i.caminho || []).length ? `<span class="trilha">${esc(i.caminho.slice(-2).join(" › "))}</span>` : ""}${esc(i.descricao)}</span></button></li>`).join("")
            : `<li class="vazio" role="none">Nada encontrado com esse termo</li>`;
          abrir(true);
        } catch (e) { abrir(false); }
      }, 250);
    });
    ul.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-codigo]");
      if (!b) return;
      item.dataset.tipo = b.dataset.tipo; item.dataset.codigo = b.dataset.codigo;
      input.value = b.dataset.rotulo; abrir(false); input.focus();
      aoEscolher(b.dataset.tipo, b.dataset.codigo);
    });
    // Setas percorrem as sugestões, Enter escolhe (clique do botão), Esc fecha e volta ao campo.
    const opcoes = () => $$("button[data-codigo]", ul);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") abrir(false);
      if (ev.key === "ArrowDown" && !ul.hidden && opcoes().length) { ev.preventDefault(); opcoes()[0].focus(); }
    });
    ul.addEventListener("keydown", (ev) => {
      const lista = opcoes(), i = lista.indexOf(document.activeElement);
      if (ev.key === "ArrowDown") { ev.preventDefault(); lista[Math.min(i + 1, lista.length - 1)]?.focus(); }
      if (ev.key === "ArrowUp") { ev.preventDefault(); if (i <= 0) input.focus(); else lista[i - 1].focus(); }
      if (ev.key === "Escape") { abrir(false); input.focus(); }
    });
    document.addEventListener("click", (ev) => { if (!item.contains(ev.target)) abrir(false); });
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

  const est = { seq: 0, ultimo: null, link: null, marcar: () => {} };
  const desde2027 = (el) => ($("#s-data", el).value || "") >= "2027-01-01";

  RTC.registrar("simulador", {
    nav: "simuladores",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>02</b> · Simulador · regime regular",
          "Simule CBS, IBS e Imposto Seletivo de uma <em>operação</em>",
          "Monte a operação e veja os tributos calculados pela calculadora oficial, item a item, com a memória de cálculo. O resultado gera o XML dos grupos de tributação da nota.")}
        ${RTC.abasSimuladores("rr")}
        <div class="aviso aviso-item" id="s-link" role="status" hidden></div>
        <form id="s-form" class="card" autocomplete="off" novalidate>
          <fieldset><legend>Operação</legend>
            <div class="grade">
              <label class="campo c3"><span>Data do fato gerador</span><input id="s-data" type="date" required></label>
              <label class="campo c3"><span>UF</span><select id="s-uf" required></select></label>
              <label class="campo c6"><span>Município</span><select id="s-mun" required><option value="">Escolha a UF</option></select></label>
            </div>
          </fieldset>
          <fieldset id="s-aliq" hidden style="margin-top:var(--space-6)"><legend>Alíquotas para testar · obrigatórias a partir de 2027</legend>
            <div class="grade">
              <label class="campo c4"><span>CBS (%)</span><input id="s-cbs" type="number" step="0.0001" min="0" value="8.8"></label>
              <label class="campo c4"><span>IBS estadual (%)</span><input id="s-ibsuf" type="number" step="0.0001" min="0" value="0.05"></label>
              <label class="campo c4"><span>IBS municipal (%)</span><input id="s-ibsmun" type="number" step="0.0001" min="0" value="0.05"></label>
            </div>
            <p class="aviso"><b>Não são as alíquotas oficiais.</b> Os valores vêm do exemplo da documentação da calculadora; as alíquotas de 2027 em diante ainda serão fixadas por resolução. Troque pelos números que quer testar: o resultado sai marcado como simulado.</p>
          </fieldset>
          <p class="nota" id="s-2026">Em 2026 a calculadora usa as alíquotas de teste oficiais: CBS 0,9% e IBS 0,1%.</p>
          <hr class="separador">
          <div class="card-titulo"><p class="eyebrow" style="margin:0">Itens</p></div>
          <div id="s-itens"></div>
          <div class="acoes">
            <button type="button" class="btn btn-fantasma" id="s-limpar">Nova simulação</button>
            <button type="button" class="btn btn-secundario" id="s-add">Adicionar item</button>
            <button type="submit" class="btn btn-primario">Calcular tributos</button>
          </div>
        </form>
        <div id="s-res" aria-live="polite"></div>`;
      // A data não é guardada entre visitas: o simulador sempre abre em hoje.
      $("#s-data", el).value = hoje();
      $("#s-data", el).addEventListener("change", () => {
        atualizarAliq(el);
        $$(".item", el).forEach((it) => carregarClasses(el, it));
      });
      atualizarAliq(el);
      RTC.preencherUfMunicipio($("#s-uf", el), $("#s-mun", el), "rtc-sim");
      est.marcar = vigiarResultado($("#s-form", el), $("#s-res", el));
      $("#s-add", el).addEventListener("click", () => { adicionarItem(el); est.marcar(); });
      $("#s-limpar", el).addEventListener("click", () => {
        novaSimulacao(el);
        est.link = null;
        if (location.hash !== "#/simulador") history.replaceState(null, "", "#/simulador");
      });
      $("#s-form", el).addEventListener("submit", (ev) => { ev.preventDefault(); calcular(el); });
      adicionarItem(el);
    },
    // Link vindo da ficha (#/simulador/ncm/<código>/<cClassTrib>): o endereço fica na barra, para voltar e compartilhar.
    entrar([, tipo, codigo, cClassTrib], el) {
      document.title = "Simulador · Consulta RTC";
      const caixa = $("#s-link", el);
      if (!((tipo === "ncm" || tipo === "nbs") && codigo)) { est.link = null; caixa.hidden = true; return; }
      if (est.link === location.hash) return; // voltou ao mesmo link: mantém o que já está montado
      est.link = location.hash;
      const pre = { tipo, codigo, cClassTrib, valor: "1000" };
      const montados = $$(".item", el).filter((it) => it.dataset.codigo);
      if (!montados.length) { novaSimulacao(el, pre); return; }
      // Já há uma simulação montada: a pessoa escolhe entre começar outra ou somar o item.
      caixa.innerHTML = `<span>Você abriu ${tipo.toUpperCase()} <b class="mono">${esc(codigo)}</b>${cClassTrib ? ` com a classificação <b class="mono">${esc(cClassTrib)}</b>` : ""}.
        A simulação atual tem ${montados.length === 1 ? "1 item" : `${montados.length} itens`}.</span>
        <button type="button" class="btn btn-fantasma btn-p" data-acao="nova">Começar nova simulação</button>
        <button type="button" class="btn btn-fantasma btn-p" data-acao="somar">Adicionar como item</button>`;
      caixa.hidden = false;
      caixa.scrollIntoView({ behavior: "smooth", block: "center" });
      $$("button", caixa).forEach((b) => b.addEventListener("click", () => {
        caixa.hidden = true;
        if (b.dataset.acao === "nova") { novaSimulacao(el, pre); return; }
        $$(".item", el).filter((it) => !it.dataset.codigo).forEach((it) => it.remove());
        adicionarItem(el, pre);
        est.marcar();
      }));
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

  // Formulário com um item só (o do link, se houver) e sem resultado na tela.
  function novaSimulacao(el, pre) {
    $("#s-link", el).hidden = true;
    $("#s-itens", el).innerHTML = "";
    adicionarItem(el, pre);
    const res = $("#s-res", el);
    res.innerHTML = ""; resultadoPronto(res, false);
    limparErros($("#s-form", el));
  }

  function atualizarAliq(el) {
    $("#s-aliq", el).hidden = !desde2027(el);
    $("#s-2026", el).hidden = desde2027(el);
    $$(".item", el).forEach((it) => { $(".campo-is", it).hidden = !(it.dataset.is && desde2027(el)); });
  }

  function adicionarItem(el, pre) {
    pre = pre || {};
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
      </div>
      <p class="aviso aviso-item" hidden></p>`;
    $("#s-itens", el).appendChild(it);
    renumerar(el);
    $(".remover", it).addEventListener("click", () => { it.remove(); renumerar(el); est.marcar(); });
    RTC.ligarBuscaProduto(it, { data: () => $("#s-data", el).value || hoje(), aoEscolher: () => carregarClasses(el, it) });
    $(".cclass", it).addEventListener("change", () => avisoBeneficio(it));
    if (pre.tipo && pre.codigo) {
      Object.assign(it.dataset, { tipo: pre.tipo, codigo: pre.codigo, cclassPre: pre.cClassTrib || "" });
      $(".cod-busca", it).value = pre.codigo;
      if (pre.valor) $(".valor", it).value = pre.valor;
      carregarClasses(el, it);
    }
  }

  const beneficiosDo = (it) => { try { return JSON.parse(it.dataset.beneficios || "[]"); } catch (e) { return []; } };

  // Regra geral escolhida num código que tem benefício em lei: diz qual é e oferece trocar.
  function avisoBeneficio(it) {
    const aviso = $(".aviso-item", it), b = beneficiosDo(it);
    const regraGeral = $(".cclass", it).value === "000001";
    aviso.hidden = !(regraGeral && b.length);
    if (aviso.hidden) return;
    const [p] = b;
    aviso.innerHTML = `Este código tem ${b.length === 1 ? "1 benefício previsto" : `${b.length} benefícios previstos`} na LC 214
      (${esc(p.c)} · ${esc(String(p.t).toLowerCase())}). Você está simulando a regra geral.
      <button type="button" class="btn btn-fantasma btn-p">Usar ${esc(p.c)}</button>`;
    $("button", aviso).addEventListener("click", () => { $(".cclass", it).value = p.c; avisoBeneficio(it); });
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
      const quer = it.dataset.cclassPre || atual;
      if ([...sel.options].some((o) => o.value === quer)) sel.value = quer;
      it.dataset.cclassPre = "";
      // Benefícios do código, do mais favorável (maior redução) para o menos.
      const reducao = (c) => Math.max(0, ...Object.values(c.reducao || {}).map(Number).filter((n) => !isNaN(n)));
      it.dataset.beneficios = JSON.stringify((ficha.classificacoes || [])
        .map((c) => ({ c: c.cClassTrib, t: c.tratamento || c.descricao, f: reducao(c) })).sort((a, b) => b.f - a.f));
      avisoBeneficio(it);
      it.dataset.is = ficha.impostoSeletivo?.incide ? "1" : "";
      const campo = $(".cod-busca", it);
      if (campo.value === codigo) campo.value = `${ficha.codigoFormatado} · ${ficha.descricao || ""}`;
      $(".escolhido", it).textContent = ficha.impostoSeletivo?.incide ? "Incide Imposto Seletivo" : "";
      atualizarAliq(el);
    } catch (e) { $(".escolhido", it).textContent = e.message; }
  }

  function lerForm(el) {
    const itens = $$(".item", el).map((it, i) => {
      if (!it.dataset.codigo) throw falha(`Item ${i + 1}: escolha o produto ou serviço na lista de sugestões.`, $(".cod-busca", it));
      const valor = parseFloat($(".valor", it).value);
      if (!(valor >= 0)) throw falha(`Item ${i + 1}: informe o valor.`, $(".valor", it));
      const item = { tipo: it.dataset.tipo, codigo: it.dataset.codigo, cClassTrib: $(".cclass", it).value, valor };
      const qtd = parseFloat($(".qtd", it).value); if (qtd > 0) item.quantidade = qtd;
      const is = parseFloat($(".aliq-is", it).value); if (!$(".campo-is", it).hidden && is >= 0) item.aliquotaIS = is;
      return item;
    });
    const d = { data: $("#s-data", el).value, uf: $("#s-uf", el).value, municipio: Number($("#s-mun", el).value), itens };
    if (!d.data) throw falha("Informe a data do fato gerador.", $("#s-data", el));
    if (!d.uf) throw falha("Escolha a UF.", $("#s-uf", el));
    if (!d.municipio) throw falha("Escolha o município.", $("#s-mun", el));
    if (desde2027(el)) d.aliquotas = { cbs: +$("#s-cbs", el).value || 0, ibsEstadual: +$("#s-ibsuf", el).value || 0, ibsMunicipal: +$("#s-ibsmun", el).value || 0 };
    return d;
  }

  async function calcular(el) {
    const alvo = $("#s-res", el);
    let dados;
    const form = $("#s-form", el);
    try { dados = lerForm(el); } catch (e) { mostrarErro(form, alvo, e); return; }
    limparErros(form);
    resultadoPronto(alvo, false);
    alvo.innerHTML = `<p class="carregando">Calculando na calculadora oficial</p>`;
    try {
      const r = await postJSON("/api/simular", dados);
      est.ultimo = dados;
      alvo.innerHTML = resultado(el, r);
      resultadoPronto(alvo, true);
      faixaDeProva(el, dados, r);
      ligarXml(el);
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#s-resumo", el)?.focus({ preventScroll: true });
    } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
  }

  // Faixa de prova: a mesma operação calculada com a regra geral e com o benefício mais favorável, lado a lado.
  async function faixaDeProva(el, dados, r) {
    const caixa = $("#s-prova", el);
    const dom = $$(".item", el);
    const melhores = dom.map((it) => beneficiosDo(it)[0]?.c);
    if (!caixa || !melhores.some(Boolean)) return;
    const cenario = (fn) => ({ ...dados, itens: dados.itens.map((i, n) => ({ ...i, cClassTrib: fn(i, n) })) });
    const [geral, benef] = await Promise.allSettled([
      postJSON("/api/simular", cenario(() => "000001")),
      postJSON("/api/simular", cenario((i, n) => melhores[n] || i.cClassTrib)),
    ]);
    if (geral.status !== "fulfilled" || benef.status !== "fulfilled" || !caixa.isConnected) return;
    const tg = Number(geral.value.totais?.total), tb = Number(benef.value.totais?.total), atual = Number(r.totais?.total);
    const economia = tg - tb;
    caixa.innerHTML = `<div class="prova" aria-label="Comparação entre regra geral e benefício">
      <div class="${atual === tg ? "atual" : ""}"><span>Regra geral em todos os itens</span><b>${reais(tg)}</b></div>
      <div class="melhor ${atual === tb ? "atual" : ""}"><span>Com o benefício mais favorável</span><b>${reais(tb)}</b></div>
      <div class="prova-nota">${economia > 0 ? `O benefício reduz ${reais(economia)} (${pct((economia / tg) * 100)}) nesta operação, se ela cumprir as condições da LC 214. ` : ""}As duas faixas saem da mesma calculadora oficial.</div>
    </div>`;
  }

  function linha(nome, t) {
    if (!t) return "";
    return `<tr><td>${nome}</td><td class="num">${pct(t.aliquota)}</td><td class="num">${t.reducao != null ? pct(t.reducao) : "—"}</td>
      <td class="num">${pct(t.aliquotaEfetiva)}</td><td class="num">${reais(t.valor)}</td></tr>`;
  }

  function resultado(el, r) {
    const t = r.totais || {};
    const domItens = $$(".item", el);
    const rotulos = domItens.map((it) => $(".cod-busca", it).value);
    const itens = (r.itens || []).map((i) => {
      const nome = `<p class="eyebrow">Item ${String(i.numero).padStart(2, "0")} · ${esc(rotulos[i.numero - 1] || "")}</p>`;
      if (i.erros?.length) return `<article class="card">${nome}<span class="tag erro"><i></i>${esc(i.estadoTexto)}</span>
        ${i.erros.map((e) => `<p><b>${esc(e.titulo)}</b> <span class="cod">${esc(e.codigo)}</span><br><span class="muted">${esc(e.detalhe)}</span></p>`).join("")}</article>`;
      const mem = Object.entries(i.memoria || {}).map(([k, v]) => `<p><b>${{ cbs: "CBS", ibsUF: "IBS estadual", ibsMun: "IBS municipal", is: "Imposto Seletivo" }[k] || esc(k)}.</b> ${esc(v)}</p>`).join("");
      const subtotal = [i.cbs?.valor, i.ibsUf?.valor, i.ibsMun?.valor, i.is?.valor].reduce((a, b) => a + (Number(b) || 0), 0);
      return `<article class="card">
        <div class="card-titulo">${nome}<span class="tag ${i.estado === "CALCULADO" ? "ok" : "info"}"><i></i>${esc(i.estadoTexto)}</span></div>
        <p class="muted mono" style="font-size:13px">CST ${esc(i.cst)} · cClassTrib ${esc(i.cClassTrib)} · base de cálculo ${reais(i.base)}</p>
        ${i.cClassTrib === "000001" && domItens[i.numero - 1] && beneficiosDo(domItens[i.numero - 1]).length
          ? `<p class="aviso">Calculado pela regra geral. Este código tem benefício previsto na LC 214 (${esc(beneficiosDo(domItens[i.numero - 1])[0].c)}): escolha a classificação no item e calcule de novo se a operação se enquadra.</p>` : ""}
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
      <p class="resumo" id="s-resumo" tabindex="-1">Total de <b>${reais(t.total)}</b> em tributos sobre ${reais(t.base)} de base${Number(t.base) > 0 ? `, ${pct((Number(t.total) / Number(t.base)) * 100)} da base` : ""}${r.simulado ? ", com as alíquotas de teste informadas" : ""}.</p>
      <div id="s-prova"></div>
      <div class="kpis">
        <div class="kpi"><span>Base de cálculo</span><b>${reais(t.base)}</b></div>
        <div class="kpi"><span>CBS</span><b>${reais(t.cbs)}</b></div>
        <div class="kpi"><span>IBS</span><b>${reais(t.ibs)}</b><small>UF ${reais(t.ibsUf)} · mun. ${reais(t.ibsMun)}</small></div>
        ${t.is ? `<div class="kpi"><span>Imposto Seletivo</span><b>${reais(t.is)}</b></div>` : ""}
        <div class="kpi total"><span>Total de tributos</span><b>${reais(t.total)}</b></div>
      </div>
      ${r.itensComErro ? `<p class="aviso">${r.itensComErro === 1 ? "1 item com inconsistência ficou" : `${r.itensComErro} itens com inconsistência ficaram`} fora dos totais.</p>` : ""}
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
