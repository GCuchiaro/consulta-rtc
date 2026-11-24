"use strict";
// Consulta: busca de NCM/NBS e ficha de tributação do código.
(() => {
  const { $, $$, esc, pct, hoje, dataBR, api, cabeca, guardar, ler, tabelaDeObjetos } = RTC;

  const datas = () => [[hoje(), `Hoje · ${dataBR(hoje())}`], ["2027-01-01", "A partir de 01.01.2027"]];

  function cardClasse(c) {
    const red = c.reducao ? [["CBS", c.reducao.cbs], ["IBS UF", c.reducao.ibsUf], ["IBS mun.", c.reducao.ibsMun]]
      .filter(([, v]) => v != null).map(([t, v]) => `<span class="tag ok"><i></i>Redução ${t} ${pct(v)}</span>`).join("") : "";
    const extras = [
      c.origem === "Tabela da NFS-e" && `<span class="tag info"><i></i>Tabela da NFS-e</span>`,
      c.creditoPresumidoFornecedor && `<span class="tag info"><i></i>Crédito presumido · fornecedor</span>`,
      c.creditoPresumidoAdquirente && `<span class="tag info"><i></i>Crédito presumido · adquirente</span>`,
      ...(c.documentos || []).map((d) => `<span class="tag">${esc(d)}</span>`),
    ].filter(Boolean).join("");
    return `<article class="classe">
      <div class="cod">${esc(c.cClassTrib)}</div>
      <div>
        <h4>${esc(c.descricao)}</h4>
        ${c.tratamento ? `<p>${esc(c.tratamento)}</p>` : ""}
        ${(c.anexos || []).map((a) => `<p class="lei">LC 214/2025, Anexo ${esc(a.anexo)}${a.item ? `, item ${esc(a.item)}` : ""}: ${esc(a.texto)}</p>`).join("")}
        ${red || extras ? `<div class="tags">${red}${extras}</div>` : ""}
      </div>
    </article>`;
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
        <div id="c-res" aria-live="polite"></div>
        <div id="c-ficha" aria-live="polite"></div>`;
      const salva = ler("rtc-data");
      if (salva && datas().some(([v]) => v === salva)) $("#c-data", el).value = salva;
      $("#c-data", el).addEventListener("change", () => { guardar("rtc-data", $("#c-data", el).value); RTC.rotear(); });
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
      const grupo = (titulo, itens, rota) => !itens ? "" : `
        <section class="grupo-res"><p class="eyebrow"><span>${titulo}</span><span>${itens.length}${itens.length >= 20 ? "+" : ""}</span></p>
        ${itens.length ? `<ul class="lista">${itens.map((i) => `
          <li><a href="#/${rota}/${i.codigo}"><span class="cod">${esc(i.codigoFormatado)}</span>
            <span>${(i.caminho || []).length ? `<span class="trilha">${esc(i.caminho.join(" › "))}</span>` : ""}${esc(i.descricao)}</span></a></li>`).join("")}
        </ul>` : `<p class="vazio">Nenhum resultado com esse termo.</p>`}</section>`;
      res.innerHTML = grupo("Produtos · NCM", r.ncm, "ncm") + grupo("Serviços · NBS", r.nbs, "nbs");
    } catch (e) {
      res.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
    }
  }

  async function ficha(el, tipo, codigo) {
    $("#c-res", el).innerHTML = "";
    const alvo = $("#c-ficha", el);
    alvo.innerHTML = `<p class="carregando">Consultando a calculadora oficial</p>`;
    const data = dataRef(el);
    try {
      const r = await api(`/api/${tipo === "ncm" ? "produto" : "servico"}/${encodeURIComponent(codigo)}?data=${data}`);
      document.title = `${r.codigoFormatado} · Consulta RTC`;
      const is = r.impostoSeletivo || {};
      const classes = r.classificacoes || [];
      const outras = r.outrasPermitidas || [];
      const nome = tipo === "ncm" ? "produto" : "serviço";
      alvo.innerHTML = `
        <p style="margin-top:var(--space-6)"><a href="javascript:history.back()">← Voltar</a></p>
        <article class="card ficha-topo">
          <p class="eyebrow">${tipo.toUpperCase()} <b>${esc(r.codigoFormatado)}</b>${(r.caminho || []).length ? ` · ${esc(r.caminho.join(" › "))}` : ""}</p>
          <h2 class="titulo">${esc(r.descricao || "Sem descrição na tabela oficial")}</h2>
          <div class="tags">
            ${is.incide ? `<span class="tag alerta"><i></i>Incide Imposto Seletivo${is.aliquotaAdValorem != null ? ` · ${pct(is.aliquotaAdValorem)}` : ""}</span>`
                        : `<span class="tag ok"><i></i>Sem Imposto Seletivo</span>`}
            ${r.unidade ? `<span class="tag">Unidade ${esc(r.unidade)}</span>` : ""}
            <span class="tag">Referência ${dataBR(r.data)}</span>
          </div>
          <div class="acoes esq">
            <a class="btn btn-primario" href="#/simulador/${tipo}/${esc(r.codigo)}">Simular no regime regular</a>
            <a class="btn btn-secundario" href="#/simples/${tipo}/${esc(r.codigo)}">Simular no Simples Nacional</a>
          </div>
        </article>
        <section class="card">
          <div class="card-titulo"><h2 class="secao">Benefícios deste ${nome}</h2><span class="eyebrow">${classes.length} classificação(ões)</span></div>
          ${classes.length
            ? `<p class="muted" style="max-width:var(--measure)">Classificações tributárias (cClassTrib) que a calculadora oficial aceita para este código por constarem de um anexo da LC 214/2025${tipo === "nbs" ? " ou da tabela da NFS-e" : ""}. Cada uma tem condições próprias (destinatário, tipo de operação): confira a fundamentação antes de usar.</p>
               ${classes.map(cardClasse).join("")}`
            : `<p class="muted">Nenhuma redução ou regime específico ligado a este código pelos anexos da LC 214/2025.</p>`}
          <p class="nota">Fora dessas hipóteses vale a tributação integral: CST 000, cClassTrib ${esc(r.regraGeral)}.</p>
          ${outras.length ? `<details style="margin-top:var(--space-4)"><summary>Outras ${outras.length} classificações aceitas, sem anexo</summary>
            <p class="muted">${is.incide ? "Produtos com Imposto Seletivo só podem usar as classificações desta lista." : "Situações específicas em que o código também pode ser usado."}</p>
            ${outras.map(cardClasse).join("")}</details>` : ""}
        </section>
        ${tipo === "nbs" ? `<section class="card" id="c-nfse"><h2 class="secao">Na NFS-e</h2><p class="carregando">Consultando as regras da NFS-e</p></section>` : ""}`;
      if (tipo === "nbs") nfse($("#c-nfse", el), r.codigo, data);
    } catch (e) {
      alvo.innerHTML = `<p style="margin-top:var(--space-6)"><a href="#/consulta">← Consulta</a></p><p class="erro">${esc(e.message)}</p>`;
    }
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
