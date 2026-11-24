"use strict";
// Consulta: busca de NCM/NBS e ficha de tributação do código.
(() => {
  const { $, $$, esc, pct, hoje, dataBR, api, cabeca, guardar, ler, tabelaDeObjetos } = RTC;

  const INICIO_2027 = "2027-01-01";
  const datas = () => [[hoje(), `Hoje · ${dataBR(hoje())}`], [INICIO_2027, "A partir de 2027"]];
  // Como o veredito nomeia o período consultado: a resposta muda com a data (o IS começa em 2027).
  const periodo = (data) => (data === INICIO_2027 ?"A partir de 2027" : `Em ${data.slice(0, 4)}`);

  const EXEMPLOS = ["arroz", "cerveja", "medicamentos", "serviços de contabilidade", "2203.00.00"];
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // sim = { tipo, codigo }: mostra o atalho para simular já com esta classificação.
  // destaque: "principal" (a mais favorável, impressa nítida) ou "fantasma" (alternativas, impressão leve).
  function cardClasse(c, sim, destaque = "") {
    const red = c.reducao ? [["CBS", c.reducao.cbs], ["IBS UF", c.reducao.ibsUf], ["IBS mun.", c.reducao.ibsMun]]
      .filter(([, v]) => v != null).map(([t, v]) => `<span class="tag ok"><i></i>Redução ${t} ${pct(v)}</span>`).join("") : "";
    const extras = [
      c.origem === "Tabela da NFS-e" && `<span class="tag info"><i></i>Tabela da NFS-e</span>`,
      c.creditoPresumidoFornecedor && `<span class="tag info"><i></i>Crédito presumido · fornecedor</span>`,
      c.creditoPresumidoAdquirente && `<span class="tag info"><i></i>Crédito presumido · adquirente</span>`,
      ...(c.documentos || []).map((d) => `<span class="tag">${esc(d)}</span>`),
    ].filter(Boolean).join("");
    return `<article class="classe ${destaque}">
      <div class="cod">${esc(c.cClassTrib)}</div>
      <div>
        <h3>${esc(c.descricao)}</h3>
        ${c.tratamento ? `<p>${esc(c.tratamento)}</p>` : ""}
        ${(c.anexos || []).map((a) => `<p class="lei">LC 214/2025, Anexo ${esc(a.anexo)}${a.item ? `, item ${esc(a.item)}` : ""}: ${esc(a.texto)}</p>`).join("")}
        ${red || extras ? `<div class="tags">${red}${extras}</div>` : ""}
        ${sim ? `<p class="classe-acao"><a href="#/simulador/${sim.tipo}/${esc(sim.codigo)}/${esc(c.cClassTrib)}">Simular com a classificação ${esc(c.cClassTrib)} ${RTC.seta()}</a></p>` : ""}
      </div>
    </article>`;
  }

  // Frase de resposta da ficha: o benefício mais forte, ou a regra geral.
  const forca = (c) => Math.max(...Object.values(c.reducao || {}).map(Number).filter((n) => !isNaN(n)), 0);
  const melhorClasse = (classes) => [...classes].sort((a, b) => forca(b) - forca(a))[0];

  // Valor de face do certificado: quanto da alíquota cheia se paga no caso mais favorável.
  const pctFace = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  function face(classes, codigo) {
    let valor = `100<small>%</small>`, legenda = "da alíquota cheia";
    if (classes.length) {
      const f = forca(melhorClasse(classes));
      valor = f > 0 ? `${pctFace(100 - f)}<small>%</small>` : "";
      legenda = f > 0 ? "da alíquota cheia, se enquadrado" : "ver as condições abaixo";
    }
    return `<div class="face"><span class="roseta gravando" data-roseta="${esc(codigo)}" data-linhas="40"></span>
      <div class="face-miolo">${valor ? `<b class="face-valor">${valor}</b>` : `<b class="face-valor texto">Regime<br>específico</b>`}
      <span class="face-legenda">${legenda}</span></div></div>`;
  }

  function veredito(classes, is, data) {
    const quando = periodo(data);
    if (!classes.length) return `<p class="veredito">${quando}, sem benefício previsto nos anexos da LC 214/2025: vale a <b>tributação integral</b>${is.incide ? " e incide Imposto Seletivo" : ""}.</p>`;
    const melhor = melhorClasse(classes);
    const a = (melhor.anexos || [])[0];
    const como = melhor.tratamento && !/^padr/i.test(melhor.tratamento) ? melhor.tratamento.toLowerCase()
      : forca(melhor) ? `redução de ${pct(forca(melhor))}` : "tratamento específico";
    return `<p class="veredito">${quando}, pode ter <b>${esc(como)}</b>
      <span class="veredito-ref">${esc(melhor.cClassTrib)}${a ? ` · LC 214, Anexo ${esc(a.anexo)}${a.item ? `, item ${esc(a.item)}` : ""}` : ""}${classes.length > 1 ? ` · mais ${plural(classes.length - 1, "hipótese", "hipóteses")} abaixo` : ""}</span></p>`;
  }

  RTC.registrar("consulta", {
    nav: "consulta",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>01</b> · Consulta · CBS, IBS e Imposto Seletivo",
          "Como seu produto ou serviço é tributado na <em>Reforma</em>",
          "Busque pelo nome ou pelo código NCM (produtos) ou NBS (serviços). A resposta vem das tabelas oficiais da Receita Federal, com o item da LC 214/2025 que fundamenta cada benefício.")}
        <form class="barra-busca" id="c-form" autocomplete="off" role="search">
          <input id="c-q" type="search" placeholder="arroz, cerveja, 2203.00.00, serviços de contabilidade" aria-label="Produto ou serviço" minlength="2" required>
          <select id="c-data" aria-label="Data de referência">${datas().map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
          <button class="btn btn-primario" type="submit">Buscar</button>
        </form>
        <div class="filtros" role="radiogroup" aria-label="Tipo de código">
          <label class="check"><input type="radio" name="c-tipo" value="todos" checked> Produtos e serviços</label>
          <label class="check"><input type="radio" name="c-tipo" value="ncm"> Só produtos (NCM)</label>
          <label class="check"><input type="radio" name="c-tipo" value="nbs"> Só serviços (NBS)</label>
        </div>
        <div id="c-exemplos" class="exemplos"><span class="eyebrow">Experimente</span>${EXEMPLOS.map((e) => `<a href="#/busca/${encodeURIComponent(e)}">${esc(e)}</a>`).join("")}</div>
        <div id="c-res" aria-live="polite"></div>
        <div id="c-ficha" aria-live="polite"></div>`;
      // A data não é guardada entre visitas: quem volta ao site sempre começa por hoje.
      $("#c-data", el).addEventListener("change", () => RTC.rotear());
      $("#c-form", el).addEventListener("submit", (ev) => {
        ev.preventDefault();
        const q = $("#c-q", el).value.trim();
        if (q.length < 2) return;
        const alvo = `#/busca/${encodeURIComponent(q)}`;
        if (location.hash === alvo) RTC.rotear(); else location.hash = alvo;
      });
      $$("input[name=c-tipo]", el).forEach((r) => r.addEventListener("change", () => { if (location.hash.startsWith("#/busca/")) RTC.rotear(); }));
    },
    entrar([rota, arg], el) {
      $("#c-exemplos", el).hidden = !!arg;
      // Com resultado na tela, o cabeçalho grande sai e a resposta sobe.
      el.classList.toggle("compacta", !!arg);
      el.classList.toggle("em-ficha", !!arg && (rota === "ncm" || rota === "nbs"));
      if (rota === "busca" && arg) return buscar(el, arg);
      if ((rota === "ncm" || rota === "nbs") && arg) return ficha(el, rota, arg);
      document.title = "Consulta RTC";
      $("#c-res", el).innerHTML = ""; $("#c-ficha", el).innerHTML = "";
    },
  });

  const dataRef = (el) => $("#c-data", el).value;

  async function buscar(el, q) {
    document.title = `${q} · Consulta RTC`;
    $("#c-ficha", el).innerHTML = "";
    $("#c-q", el).value = q;
    const res = $("#c-res", el);
    res.innerHTML = `<p class="carregando">Buscando nas tabelas oficiais</p>`;
    try {
      const tipo = $("input[name=c-tipo]:checked", el).value;
      const r = await api(`/api/busca?q=${encodeURIComponent(q)}&tipo=${tipo}&data=${dataRef(el)}`);
      const VISIVEIS = 10;
      // Grupo vazio só aparece quando o outro também está vazio (ou quando é o único pedido).
      const algum = (r.ncm || []).length + (r.nbs || []).length > 0;
      const grupo = (titulo, itens, rota) => !itens || (!itens.length && algum) ? "" : `
        <section class="grupo-res"><p class="eyebrow"><span>${titulo}</span><span>${itens.length}${itens.length >= 40 ? "+" : ""} ${itens.length === 1 ? "resultado" : "resultados"}</span></p>
        ${itens.length ? `<ul class="lista">${itens.map((i, n) => `
          <li${n >= VISIVEIS ? " hidden" : ""}><a href="#/${rota}/${i.codigo}"><span class="cod">${esc(i.codigoFormatado)}</span>
            <span>${(i.caminho || []).length ? `<span class="trilha">${esc(i.caminho.slice(-2).join(" › "))}</span>` : ""}${esc(i.descricao)}</span>
            ${i.beneficios ? `<span class="tag ok"><i></i>Benefício na LC 214</span>` : `<span></span>`}</a></li>`).join("")}
        </ul>
        ${itens.length > VISIVEIS ? `<button type="button" class="btn btn-fantasma btn-p mais">Mostrar mais ${itens.length - VISIVEIS}</button>` : ""}`
        : `<p class="vazio">Nenhum resultado com esse termo.</p>`}</section>`;
      res.innerHTML = algum || tipo !== "todos" ? grupo("Produtos · NCM", r.ncm, "ncm") + grupo("Serviços · NBS", r.nbs, "nbs")
        : `<p class="vazio">Nenhum produto ou serviço com “${esc(q)}”. Tente uma palavra só (ex.: “arroz”) ou o código NCM/NBS.</p>`;
      $$(".mais", res).forEach((b) => b.addEventListener("click", () => {
        $$("li[hidden]", b.closest(".grupo-res")).forEach((li) => { li.hidden = false; });
        b.remove();
      }));
    } catch (e) {
      res.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
    }
  }

  async function ficha(el, tipo, codigo) {
    $("#c-res", el).innerHTML = "";
    $("#c-q", el).value = "";
    const alvo = $("#c-ficha", el);
    alvo.innerHTML = `<p class="carregando">Consultando a calculadora oficial</p>`;
    const data = dataRef(el);
    const vez = (alvo.dataset.vez = String(Number(alvo.dataset.vez || 0) + 1));
    try {
      const r = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${encodeURIComponent(codigo)}?data=${data}`);
      document.title = `${r.codigoFormatado} · Consulta RTC`;
      const is = r.impostoSeletivo || {};
      const classes = r.classificacoes || [];
      const outras = r.outrasPermitidas || [];
      const nome = tipo === "ncm" ? "produto" : "serviço";
      // "Voltar aos resultados" só quando a pessoa chegou aqui por uma busca.
      const veio = /^#\/busca\/(.+)$/.exec(RTC.hashAnterior || "");
      const qAnterior = veio ? decodeURIComponent(veio[1]) : "";
      const voltar = qAnterior
        ? `<a href="#/busca/${encodeURIComponent(qAnterior)}">${RTC.seta("esq")} Resultados para “${esc(qAnterior)}”</a>`
        : `<a href="#/consulta">${RTC.seta("esq")} Nova consulta</a>`;
      const sim = { tipo, codigo: r.codigo };
      // A mais favorável primeiro (impressa nítida); as outras hipóteses seguem em impressão leve.
      const melhor = classes.length ? melhorClasse(classes) : null;
      const ordenadas = melhor ? [melhor, ...classes.filter((c) => c !== melhor)] : [];
      alvo.innerHTML = `
        <p style="margin-top:var(--space-6)">${voltar}</p>
        <article class="ficha-topo moldura certificado"><div class="miolo">
          <p class="micro" data-micro="CONSULTA RTC · ${tipo.toUpperCase()} ${esc(r.codigoFormatado)} · CALCULADORA OFICIAL DA RECEITA FEDERAL · LC 214/2025"></p>
          <div class="cert-cabeca"><span class="serie">${tipo.toUpperCase()} ${esc(r.codigoFormatado)}</span><span class="ref">Referência ${dataBR(r.data)}</span></div>
          ${(r.caminho || []).length ? `<p class="ficha-trilha">${esc(r.caminho.join(" › "))} ›</p>` : ""}
          <h2 class="titulo">${esc(r.descricao || "Sem descrição na tabela oficial")}</h2>
          <div class="cert-corpo">
          ${face(classes, r.codigo)}
          <div>
          ${veredito(classes, is, r.data || data)}
          <div class="tags">
            ${is.incide ? `<span class="tag alerta"><i></i>Incide Imposto Seletivo${is.aliquotaAdValorem != null ? ` · ${pct(is.aliquotaAdValorem)}` : ""}</span>`
                        : `<span class="tag ok"><i></i>Sem Imposto Seletivo</span>`}
            ${r.unidade ? `<span class="tag">Unidade ${esc(r.unidade)}</span>` : ""}
          </div>
          <div id="c-futuro"></div>
          <div class="acoes esq">
            ${classes.length
              ? `<a class="btn btn-primario" href="#/simulador/${tipo}/${esc(r.codigo)}/${esc(melhorClasse(classes).cClassTrib)}">Simular com o benefício</a>
                 <a class="btn btn-secundario" href="#/simulador/${tipo}/${esc(r.codigo)}/${esc(r.regraGeral)}">Simular a regra geral</a>`
              : `<a class="btn btn-primario" href="#/simulador/${tipo}/${esc(r.codigo)}">Simular no regime regular</a>`}
            <a class="btn btn-secundario" href="#/simples/${tipo}/${esc(r.codigo)}">Simular no Simples Nacional</a>
          </div>
          <p class="nota">Regime regular é a empresa do lucro real ou presumido; Simples Nacional, a optante pelo Simples.</p>
          </div></div>
        </div></article>
        <section class="card">
          <div class="card-titulo"><h2 class="secao">Benefícios deste ${nome}</h2><span class="eyebrow">${plural(classes.length, "classificação", "classificações")}</span></div>
          ${classes.length
            ? `<p class="muted" style="max-width:var(--measure)">Classificações tributárias (cClassTrib, o código que vai na nota) que a calculadora oficial aceita para este código por constarem de um anexo da LC 214/2025${tipo === "nbs" ? " ou da tabela da NFS-e" : ""}. Cada uma tem condições próprias (destinatário, tipo de operação): confira a fundamentação antes de usar.</p>
               ${ordenadas.map((c, n) => cardClasse(c, sim, ordenadas.length > 1 ? (n ? "fantasma" : "principal") : "")).join("")}`
            : `<p class="muted">Nenhuma redução ou regime específico ligado a este código pelos anexos da LC 214/2025.</p>`}
          <p class="nota">Fora dessas hipóteses vale a tributação integral: CST 000, cClassTrib ${esc(r.regraGeral)}.</p>
          ${outras.length ? `<details style="margin-top:var(--space-4)"><summary>Outras ${outras.length} classificações aceitas, sem anexo</summary>
            <p class="muted">${is.incide ? "Produtos com Imposto Seletivo só podem usar as classificações desta lista." : "Situações específicas em que o código também pode ser usado."}</p>
            ${outras.map((c) => cardClasse(c, sim)).join("")}</details>` : ""}
        </section>
        ${tipo === "nbs" ? `<section class="card" id="c-nfse"><h2 class="secao">Na NFS-e</h2><p class="carregando">Consultando as regras da NFS-e</p></section>` : ""}`;
      RTC.gravar(alvo);
      if (tipo === "nbs") nfse($("#c-nfse", el), r.codigo, data);
      if (data < INICIO_2027) mudancaEm2027(el, alvo, vez, tipo, r);
    } catch (e) {
      alvo.innerHTML = `<p style="margin-top:var(--space-6)"><a href="#/consulta">${RTC.seta("esq")} Consulta</a></p><p class="erro">${esc(e.message)}</p>`;
    }
  }

  // Consultando hoje: confere a ficha a partir de 2027 e avisa se a resposta muda (IS, classificações).
  async function mudancaEm2027(el, alvo, vez, tipo, hojeR) {
    let f;
    try { f = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${encodeURIComponent(hojeR.codigo)}?data=${INICIO_2027}`); }
    catch (e) { return; }
    const caixa = $("#c-futuro", alvo);
    if (alvo.dataset.vez !== vez || !caixa) return; // a pessoa já abriu outra ficha
    const mudancas = [];
    const isHoje = !!hojeR.impostoSeletivo?.incide, isDepois = !!f.impostoSeletivo?.incide;
    if (isDepois && !isHoje) mudancas.push(`passa a incidir Imposto Seletivo${f.impostoSeletivo.aliquotaAdValorem != null ? ` (${pct(f.impostoSeletivo.aliquotaAdValorem)})` : ""}`);
    if (isHoje && !isDepois) mudancas.push("deixa de incidir Imposto Seletivo");
    const cods = (x) => (x.classificacoes || []).map((c) => c.cClassTrib).sort().join();
    if (cods(hojeR) !== cods(f)) mudancas.push(`as classificações com benefício mudam (${(hojeR.classificacoes || []).length} hoje, ${(f.classificacoes || []).length} em 2027)`);
    if (!mudancas.length) return;
    caixa.innerHTML = `<p class="aviso aviso-item">A partir de 01.01.2027 ${esc(mudancas.join("; "))}.
      <button type="button" class="btn btn-fantasma btn-p">Ver a partir de 2027</button></p>`;
    $("button", caixa).addEventListener("click", () => { $("#c-data", el).value = INICIO_2027; RTC.rotear(); });
  }

  async function nfse(el, nbs, data) {
    const base = "/api/oficial/rr/calculadora/nfse";
    const [sit, ind] = await Promise.allSettled([
      api(`${base}/situacoes-classificacoes-tributarias?nbs=${nbs}&data=${data}`),
      api(`${base}/indicador-operacao?nbs=${nbs}&dataOcorrenciaFatoGerador=${data}`),
    ]);
    const situacoes = sit.status === "fulfilled" ? sit.value : [];
    const indicadores = ind.status === "fulfilled" ? ind.value : [];
    el.innerHTML = `
      <div class="card-titulo"><h2 class="secao">Na NFS-e</h2><span class="eyebrow">Regras oficiais da nota de serviço</span></div>
      <h3>Classificações aceitas para este NBS</h3>
      ${situacoes.length ? `<div class="tabela-wrap"><table><thead><tr><th>CST</th><th>Situação</th><th>cClassTrib</th><th>Classificação</th></tr></thead><tbody>
        ${situacoes.map((s) => `<tr><td class="cod">${esc(s.codigoSituacaoTributaria)}</td><td>${esc(s.descricaoSituacaoTributaria)}</td>
          <td class="cod">${esc(s.codigoClassificacaoTributaria)}</td><td>${esc(s.descricaoClassificacaoTributaria)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">A tabela da NFS-e não traz classificação específica para este NBS.</p>`}
      <h3 style="margin-top:var(--space-8)">Indicadores de operação (cIndOp) e local de incidência</h3>
      ${indicadores.length ? `<div class="tabela-wrap"><table><thead><tr><th>cIndOp</th><th>Operação</th><th>Local de incidência</th><th>Local de fornecimento</th></tr></thead><tbody>
        ${indicadores.map((i) => `<tr><td class="cod">${esc(i.cIndOp)}</td><td>${esc(i.tipoOperacao)}${i.adquirenteExterior ? ` <span class="tag info"><i></i>adquirente no exterior</span>` : ""}</td>
          <td>${esc(i.localIncidencia)}</td><td class="muted">${esc(i.localFornecimento)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">Nenhum indicador de operação retornado para este NBS.</p>`}`;
  }

  RTC.cardClasse = cardClasse;
})();
