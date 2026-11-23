"use strict";
// Roteamento por hash. #/  #/busca/x  #/ncm/x  #/nbs/x  #/simulador  #/simples  #/xml  #/danfse
// #/ferramentas  #/ferramenta/rr/<caminho>  #/tabelas  #/tabela/rr/<caminho>  #/sobre
(() => {
  const { $, esc, api, dataBR } = RTC;
  const MAPA = { "": "consulta", busca: "consulta", ncm: "consulta", nbs: "consulta", simulador: "simulador", simples: "simples",
    xml: "xml", danfse: "danfse", ferramentas: "ferramentas", ferramenta: "ferramenta", tabelas: "tabelas", tabela: "tabela", sobre: "sobre" };

  let anterior = "";
  RTC.rotear = function () {
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    const tela = MAPA[partes[0]] || "consulta";
    const args = partes.map((p, i) => (i === 0 ? p : decodeURIComponent(p)));
    RTC.mostrar(tela, args);
    if (tela !== anterior) window.scrollTo(0, 0);
    anterior = tela;
  };

  RTC.iniciarTema();
  window.addEventListener("hashchange", RTC.rotear);
  RTC.rotear();

  api("/api/versao").then((v) => {
    const c = v.calculadora || {}, s = v.simplesNacional || {};
    $("#versoes").textContent = `Regime regular ${c.versaoApp || "?"} · Simples Nacional ${s.versaoApp || "?"} · base ${c.versaoDb || "?"} de ${dataBR(c.dataVersaoDb)} · Consulta RTC ${v.projeto}`;
  }).catch(() => { $("#versoes").textContent = "Serviços oficiais indisponíveis no momento."; });
})();
