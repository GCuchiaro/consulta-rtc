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
    // Endereço de onde a pessoa veio (o "voltar" da ficha só aponta para uma busca real).
    if (location.hash !== RTC.hashAtual) { RTC.hashAnterior = RTC.hashAtual || ""; RTC.hashAtual = location.hash; }
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    const lp = partes[0] === "" || !(partes[0] in MAPA);
    document.body.classList.toggle("modo-lp", lp);
    const tela = lp ? "lp" : MAPA[partes[0]];
    if (lp) document.title = TITULO_LP;
    else RTC.mostrar(tela, partes.map((p, i) => (i === 0 ? p : decodeURIComponent(p))));
    if (tela !== anterior) window.scrollTo(0, 0);
    anterior = tela;
  };

  // Landing: a busca da abertura leva direto aos resultados.
  $("#lp-busca").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = $("#lp-q").value.trim();
    // Sem termo, leva à tela da consulta (com exemplos) em vez de não fazer nada.
    location.hash = q.length >= 2 ? `#/busca/${encodeURIComponent(q)}` : "#/consulta";
  });

  window.addEventListener("hashchange", RTC.rotear);
  RTC.rotear();
  RTC.animar($("#lp"));

  // Fio de progresso no topo da página.
  const prog = $("#progresso");
  const rolar = () => { const h = document.documentElement; prog.style.transform = `scaleX(${h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1)})`; };
  addEventListener("scroll", rolar, { passive: true }); rolar();

  // Cursor e magnetismo do botão primário: só ponteiro fino e sem "reduzir movimento".
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const c = $("#cursor"); let x = 0, y = 0, cx = 0, cy = 0;
    addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.opacity = 1; });
    const laco = () => { cx += (x - cx) * 0.18; cy += (y - cy) * 0.18; c.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(laco); };
    laco();
    document.addEventListener("mouseover", (e) => c.classList.toggle("grande", !!e.target.closest("a, button, summary, select, input, label")));
    document.addEventListener("mousemove", (e) => {
      const b = e.target.closest(".mag");
      document.querySelectorAll(".mag").forEach((m) => { if (m !== b) { m.style.setProperty("--bx", "0px"); m.style.setProperty("--by", "0px"); } });
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty("--bx", `${(e.clientX - r.left - r.width / 2) * 0.3}px`);
      b.style.setProperty("--by", `${(e.clientY - r.top - r.height / 2) * 0.3}px`);
    });
  }

  api("/api/versao").then((v) => {
    const c = v.calculadora || {}, s = v.simplesNacional || {};
    $("#versoes").textContent = `Regime regular ${c.versaoApp || "?"} · Simples Nacional ${s.versaoApp || "?"} · base ${c.versaoDb || "?"} de ${dataBR(c.dataVersaoDb)} · Consulta RTC ${v.projeto}`;
    $("#lp-base").textContent = `${c.versaoDb || "?"} · ${dataBR(c.dataVersaoDb)}`;
  }).catch(() => {
    $("#versoes").textContent = "Serviços oficiais indisponíveis no momento.";
    $("#lp-base").textContent = "indisponível agora";
  });
})();
