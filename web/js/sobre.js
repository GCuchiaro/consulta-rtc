"use strict";
// Sobre, versões em uso, API e MCP.
(() => {
  const { $, esc, api, cabeca, dataBR } = RTC;

  RTC.registrar("sobre", {
    nav: "sobre",
    montar(el) {
      const origem = location.origin;
      el.innerHTML = `
        ${cabeca("<b>06</b> · Sobre, API e MCP",
          "As ferramentas da Receita, num só <em>lugar</em>",
          "A Receita Federal publicou como código aberto a calculadora de tributos da Reforma (regime regular), a calculadora do Simples Nacional e o gerador de DANFSe. Este site junta as três numa interface só, sem alterar nenhuma regra, e se atualiza sozinho quando sai versão nova.")}
        <section class="card">
          <div class="card-titulo"><h2 class="secao">Versões em uso</h2><span class="eyebrow">atualização automática</span></div>
          <div id="so-versoes"><p class="carregando">Consultando os serviços</p></div>
          <p class="nota">Todo dia um robô confere os repositórios oficiais. Saiu versão nova: ele monta o site com ela, testa com dados reais e publica. Se o teste falhar, a versão anterior continua no ar e o problema é registrado no repositório do projeto.</p>
        </section>
        <section class="card">
          <h2 class="secao">Use no Claude <em>(MCP)</em></h2>
          <p class="muted" style="max-width:var(--measure)">Adicione um conector personalizado com o endereço abaixo e pergunte, por exemplo, “qual a tributação do leite UHT em 2027?” ou “calcule a CBS de uma venda de R$ 1.000 de notebook em São Paulo”.</p>
          <pre class="codigo">${esc(origem)}/mcp/</pre>
          <div class="tabela-wrap"><table><thead><tr><th>Ferramenta</th><th>O que faz</th></tr></thead><tbody>
            <tr><td class="cod">buscar_ncm_nbs</td><td>Busca produtos e serviços por nome ou código.</td></tr>
            <tr><td class="cod">consultar_produto</td><td>Benefícios, anexo da LC 214 e Imposto Seletivo de um NCM.</td></tr>
            <tr><td class="cod">consultar_servico</td><td>O mesmo para um NBS.</td></tr>
            <tr><td class="cod">consultar_classificacao</td><td>Detalhes de uma cClassTrib.</td></tr>
            <tr><td class="cod">simular_operacao</td><td>CBS, IBS e IS de uma operação do regime regular.</td></tr>
            <tr><td class="cod">listar_atividades_simples</td><td>Atividades do Simples Nacional (cAtivSN) e anexos.</td></tr>
            <tr><td class="cod">simular_simples_nacional</td><td>CBS e IBS de uma nota de empresa do Simples.</td></tr>
          </tbody></table></div>
        </section>
        <section class="card">
          <h2 class="secao">API</h2>
          <p class="muted" style="max-width:var(--measure)">Tudo o que o site faz está disponível por HTTP, sem cadastro, com limite de 120 requisições por minuto por IP.</p>
          <div class="tabela-wrap"><table><thead><tr><th>Endereço</th><th>Conteúdo</th></tr></thead><tbody>
            <tr><td class="cod"><a href="/api/docs">/api/docs</a></td><td>API do Consulta RTC: busca, ficha de NCM/NBS, simulação, XML, DANFSe.</td></tr>
            <tr><td class="cod"><a href="/api/oficial/rr/openapi.json">/api/oficial/rr/…</a></td><td>API oficial da calculadora do regime regular, completa (OpenAPI no link).</td></tr>
            <tr><td class="cod"><a href="/api/oficial/sn/openapi.json">/api/oficial/sn/…</a></td><td>API oficial da calculadora do Simples Nacional, completa (OpenAPI no link).</td></tr>
            <tr><td class="cod">/api/danfse</td><td>POST com o XML da NFS-e: devolve o PDF do gerador oficial.</td></tr>
          </tbody></table></div>
        </section>
        <section class="card">
          <h2 class="secao">Origem dos dados</h2>
          <div class="tabela-wrap"><table><thead><tr><th>Ferramenta oficial</th><th>Repositório</th></tr></thead><tbody>
            <tr><td>Calculadora de tributos · regime regular</td><td><a href="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular" target="_blank" rel="noopener">ReceitaFederal/calculadora-rtc-regime-regular</a></td></tr>
            <tr><td>Calculadora · Simples Nacional</td><td><a href="https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional" target="_blank" rel="noopener">ReceitaFederal/calculadora-rtc-simples-nacional</a></td></tr>
            <tr><td>Gerador de DANFSe</td><td><a href="https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse" target="_blank" rel="noopener">ReceitaFederal/calculadora-rtc-gerador-danfse</a></td></tr>
          </tbody></table></div>
          <p class="nota">Projeto independente de Giovanni Cuchiaro, código aberto em <a href="https://github.com/GCuchiaro/consulta-rtc" target="_blank" rel="noopener">GCuchiaro/consulta-rtc</a> (licença MIT). Não é um site do governo e não substitui a orientação de um contador. Os dados enviados para cálculo, validação ou PDF não são guardados.</p>
        </section>`;
    },
    async entrar(args, el) {
      document.title = "Sobre e API · Consulta RTC";
      try {
        const v = await api("/api/versao");
        const c = v.calculadora || {}, s = v.simplesNacional || {};
        $("#so-versoes", el).innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th>Versão</th><th>Base de dados</th><th>Situação</th></tr></thead><tbody>
          <tr><td>Calculadora · regime regular</td><td class="num">${esc(c.versaoApp || "—")}</td><td>${esc(c.versaoDb || "—")} · ${dataBR(c.dataVersaoDb)}<br><span class="muted">${esc(c.descricaoVersaoDb || "")}</span></td><td>${c.versaoApp ? '<span class="tag ok"><i></i>no ar</span>' : '<span class="tag erro"><i></i>fora do ar</span>'}</td></tr>
          <tr><td>Calculadora · Simples Nacional</td><td class="num">${esc(s.versaoApp || "—")}</td><td>${esc(s.versaoDb || "—")} · ${dataBR(s.dataVersaoDb)}</td><td>${s.versaoApp ? '<span class="tag ok"><i></i>no ar</span>' : '<span class="tag erro"><i></i>fora do ar</span>'}</td></tr>
          <tr><td>Gerador de DANFSe</td><td class="num">—</td><td>—</td><td>${v.danfse?.ok ? '<span class="tag ok"><i></i>no ar</span>' : '<span class="tag erro"><i></i>fora do ar</span>'}</td></tr>
          <tr><td>Consulta RTC</td><td class="num">${esc(v.projeto)}</td><td>—</td><td><span class="tag ok"><i></i>no ar</span></td></tr>
        </tbody></table></div>`;
      } catch (e) { $("#so-versoes", el).innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
    },
  });
})();
