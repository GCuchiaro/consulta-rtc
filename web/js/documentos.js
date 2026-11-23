"use strict";
// Documentos: validação de XML (XSD oficiais) e geração do DANFSe (gerador oficial).
(() => {
  const { $, esc, api, cabeca, subNav, baixar } = RTC;
  const abas = (ativo) => subNav([["#/xml", "Validar XML", "xml"], ["#/danfse", "Gerar DANFSe", "danfse"]], ativo);

  // Área de arquivo reutilizável: arrastar, escolher ou colar.
  function areaArquivo(prefixo, titulo) {
    return `
      <label class="solta" id="${prefixo}-solta">
        <input id="${prefixo}-arq" type="file" accept=".xml,text/xml,application/xml">
        <b>${titulo}</b><span class="muted">ou clique para escolher · até 2 MB</span><span class="mono" id="${prefixo}-nome"></span>
      </label>
      <details style="margin-top:var(--space-4)"><summary>Colar o XML</summary>
        <textarea id="${prefixo}-texto" rows="8" spellcheck="false" placeholder="&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;…"></textarea></details>`;
  }
  function ligarArquivo(el, prefixo, estado, aoCarregar) {
    const solta = $(`#${prefixo}-solta`, el);
    const carregar = async (arq) => {
      if (!arq) return;
      if (arq.size > 2 * 1024 * 1024) { aoCarregar(null, "Arquivo maior que 2 MB."); return; }
      estado.xml = await arq.text(); estado.nome = arq.name;
      $(`#${prefixo}-nome`, el).textContent = `${arq.name} · ${(arq.size / 1024).toFixed(1)} KB`;
      $(`#${prefixo}-texto`, el).value = "";
      aoCarregar(estado.xml);
    };
    $(`#${prefixo}-arq`, el).addEventListener("change", (ev) => carregar(ev.target.files[0]));
    ["dragenter", "dragover"].forEach((t) => solta.addEventListener(t, (ev) => { ev.preventDefault(); solta.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((t) => solta.addEventListener(t, (ev) => { ev.preventDefault(); solta.classList.remove("sobre"); }));
    solta.addEventListener("drop", (ev) => carregar(ev.dataTransfer.files[0]));
    $(`#${prefixo}-texto`, el).addEventListener("input", () => { estado.xml = ""; $(`#${prefixo}-nome`, el).textContent = ""; });
    return () => estado.xml || $(`#${prefixo}-texto`, el).value.trim();
  }

  // ------------------------------- Validar XML ---------------------------------------
  const vx = { xml: "", nome: "" };
  RTC.registrar("xml", {
    nav: "documentos",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>03</b> · Documentos · validação",
          "Seu XML segue o leiaute <em>oficial</em>?",
          "Valide NF-e, NFC-e, NFS-e, CT-e, BP-e e NF3-e com os grupos de IBS, CBS e Imposto Seletivo, contra os mesmos XSD da calculadora da Receita. O erro vem explicado em português, com a linha destacada.")}
        ${abas("xml")}
        <form id="x-form" class="card" novalidate>
          ${areaArquivo("x", "Arraste o XML da nota")}
          <div class="grade" style="margin-top:var(--space-6)">
            <label class="campo c6"><span>Tipo de documento</span><select id="x-tipo"><option value="">Detectar pelo conteúdo</option></select></label>
            <label class="campo c6"><span>O que validar</span><select id="x-sub"><option value="nota">Documento completo</option><option value="grupo">Só o grupo de tributação</option></select></label>
          </div>
          <p class="nota">O XML é usado só para a validação e não é guardado. A validação confere estrutura e formatos (XSD); para conferir valores, use o simulador.</p>
          <div class="acoes"><button class="btn btn-primario" type="submit">Validar XML</button></div>
        </form>
        <div id="x-res" aria-live="polite"></div>`;
      api("/api/xml/tipos").then((tipos) => {
        $("#x-tipo", el).innerHTML += tipos.map((t) => `<option value="${esc(t.mnemonico)}">${esc(t.nome)} · NT ${esc(t.versaoNotaTecnica)}</option>`).join("");
      }).catch(() => {});
      const obter = ligarArquivo(el, "x", vx, (xml, erro) => (erro ? ($("#x-res", el).innerHTML = `<p class="caixa-erro"><b>${esc(erro)}</b></p>`) : validar(el, obter)));
      $("#x-form", el).addEventListener("submit", (ev) => { ev.preventDefault(); validar(el, obter); });
    },
    entrar() { document.title = "Validar XML · Consulta RTC"; },
  });

  function trecho(xml, linha, coluna) {
    if (!linha) return "";
    const linhas = xml.split(/\r?\n/);
    const l = linhas[linha - 1] || "";
    if (linhas.length === 1 || l.length > 300) {
      const ini = Math.max(0, (coluna || 1) - 120);
      return `<pre class="trecho"><span class="linha-erro">${esc(l.slice(ini, ini + 240))}</span></pre>`;
    }
    let html = "";
    for (let n = Math.max(1, linha - 3); n <= Math.min(linhas.length, linha + 2); n++) {
      html += `<span class="${n === linha ? "linha-erro" : ""}"><i>${n}</i>${esc(linhas[n - 1])}</span>\n`;
    }
    return `<pre class="trecho">${html}</pre>`;
  }

  async function validar(el, obter) {
    const alvo = $("#x-res", el);
    const xml = obter();
    if (!xml) { alvo.innerHTML = `<p class="caixa-erro"><b>Escolha um arquivo ou cole o XML.</b></p>`; return; }
    alvo.innerHTML = `<p class="carregando">Validando contra o XSD oficial</p>`;
    const p = new URLSearchParams({ subtipo: $("#x-sub", el).value });
    if ($("#x-tipo", el).value) p.set("tipo", $("#x-tipo", el).value);
    try {
      const r = await api(`/api/validar-xml?${p}`, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml });
      const nome = $(`#x-tipo option[value="${r.tipo}"]`, el)?.textContent || r.tipo;
      alvo.innerHTML = r.valido
        ? `<div class="resultado-ok"><p class="eyebrow">Resultado</p><h2 class="titulo">XML <em>válido</em></h2><p class="muted">${esc(nome)} · ${r.subtipo === "nota" ? "documento completo" : "grupo de tributação"} · estrutura conforme o XSD oficial.</p></div>`
        : r.erros.map((e) => `<div class="caixa-erro">
            <p class="eyebrow">Erro${e.linha ? ` · linha ${e.linha}, coluna ${e.coluna}` : ""}</p>
            <p style="font-size:17px;line-height:26px;margin:0 0 var(--space-3)"><b>${esc(e.mensagem)}</b></p>
            ${trecho(xml, e.linha, e.coluna)}
            <p class="muted">${esc(nome)}. A validação oficial para no primeiro erro: corrija e valide de novo.</p>
            <details><summary>Mensagem técnica original</summary><pre class="codigo">${esc(e.original)}</pre></details></div>`).join("");
    } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
  }

  // --------------------------------- DANFSe ---------------------------------------------
  const vd = { xml: "", nome: "" };
  RTC.registrar("danfse", {
    nav: "documentos",
    montar(el) {
      el.innerHTML = `
        ${cabeca("<b>03</b> · Documentos · DANFSe",
          "O PDF da sua NFS-e, pelo gerador <em>oficial</em>",
          "Envie o XML da NFS-e nacional (elemento raiz NFSe) e baixe o DANFSe em PDF, gerado pela ferramenta de código aberto da Receita Federal.")}
        ${abas("danfse")}
        <form id="d-form" class="card" novalidate>
          ${areaArquivo("d", "Arraste o XML da NFS-e")}
          <div class="grade" style="margin-top:var(--space-6)">
            <label class="campo c6"><span>Situação da nota</span><select id="d-sit"><option value="0">Válida</option><option value="1">Substituída</option><option value="2">Cancelada</option></select></label>
            <label class="check c6" style="align-self:end"><input type="checkbox" id="d-canhoto" checked> Incluir canhoto (recibo)</label>
          </div>
          <p class="nota">O XML é usado só para gerar o PDF e não é guardado.</p>
          <div class="acoes"><button class="btn btn-primario" type="submit">Gerar PDF</button></div>
        </form>
        <div id="d-res" aria-live="polite"></div>`;
      const obter = ligarArquivo(el, "d", vd, (xml, erro) => { if (erro) $("#d-res", el).innerHTML = `<p class="caixa-erro"><b>${esc(erro)}</b></p>`; });
      $("#d-form", el).addEventListener("submit", (ev) => { ev.preventDefault(); gerar(el, obter); });
    },
    entrar() { document.title = "DANFSe · Consulta RTC"; },
  });

  async function gerar(el, obter) {
    const alvo = $("#d-res", el);
    const xml = obter();
    if (!xml) { alvo.innerHTML = `<p class="caixa-erro"><b>Escolha o arquivo XML da NFS-e ou cole o conteúdo.</b></p>`; return; }
    alvo.innerHTML = `<p class="carregando">Gerando o DANFSe</p>`;
    try {
      const r = await fetch(`/api/danfse?situacao=${$("#d-sit", el).value}&canhoto=${$("#d-canhoto", el).checked}`,
        { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.erro || e.detail || `Erro ${r.status}`); }
      const pdf = await r.blob();
      const nome = (vd.nome || "nfse").replace(/\.xml$/i, "") + "-danfse.pdf";
      baixar(nome, pdf);
      const url = URL.createObjectURL(pdf);
      alvo.innerHTML = `<div class="resultado-ok"><p class="eyebrow">Pronto · ${(pdf.size / 1024).toFixed(0)} KB</p><h2 class="titulo">DANFSe <em>gerado</em></h2>
        <div class="acoes esq"><a class="btn btn-primario" href="${url}" download="${esc(nome)}">Baixar PDF</a><a class="btn btn-secundario" href="${url}" target="_blank" rel="noopener">Abrir em outra aba</a></div></div>`;
    } catch (e) { alvo.innerHTML = `<p class="caixa-erro"><b>${esc(e.message)}</b></p>`; }
  }
})();
