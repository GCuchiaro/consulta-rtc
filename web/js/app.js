"use strict";
// Roteamento por hash. #/ (landing)  #/consulta  #/busca/x  #/ncm/x  #/nbs/x  #/simulador  #/simples  #/xml  #/danfse
// #/ferramentas  #/ferramenta/rr/<caminho>  #/tabelas  #/tabela/rr/<caminho>  #/sobre
(() => {
  const { $, api, dataBR } = RTC;
  const MAPA = { consulta: "consulta", busca: "consulta", ncm: "consulta", nbs: "consulta", simulador: "simulador", simples: "simples",
    xml: "xml", danfse: "danfse", ferramentas: "ferramentas", ferramenta: "ferramenta", tabelas: "tabelas", tabela: "tabela", sobre: "sobre" };
  const TITULO_LP = document.title;

  let anterior = null;
  RTC.rotear = function () {
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    const lp = partes[0] === "" || !(partes[0] in MAPA);
    document.body.classList.toggle("modo-lp", lp);
    const tela = lp ? "lp" : MAPA[partes[0]];
    if (lp) document.title = TITULO_LP;
    else RTC.mostrar(tela, partes.map((p, i) => (i === 0 ? p : decodeURIComponent(p))));
    if (tela !== anterior) window.scrollTo(0, 0);
    anterior = tela;
  };

  // Landing: botão "ver o que ela faz" rola até a seção (sem mexer no hash, que é das rotas) e busca direta.
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-rolar]");
    if (b) document.getElementById(b.dataset.rolar)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#lp-busca").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = $("#lp-q").value.trim();
    if (q.length >= 2) location.hash = `#/busca/${encodeURIComponent(q)}`;
  });

  RTC.iniciarTema();
  window.addEventListener("hashchange", RTC.rotear);
  RTC.rotear();

  api("/api/versao").then((v) => {
    const c = v.calculadora || {}, s = v.simplesNacional || {};
    const txt = `Regime regular ${c.versaoApp || "?"} · Simples Nacional ${s.versaoApp || "?"} · base ${c.versaoDb || "?"} de ${dataBR(c.dataVersaoDb)}`;
    $("#versoes").textContent = `${txt} · Consulta RTC ${v.projeto}`;
    $("#lp-versoes").textContent = `Em uso agora: ${txt}.`;
  }).catch(() => {
    $("#versoes").textContent = "Serviços oficiais indisponíveis no momento.";
    $("#lp-versoes").textContent = "Não foi possível consultar as versões agora.";
  });
})();
