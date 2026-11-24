"use strict";
// Gravura de segurança: rosetas guilhochê geradas a partir de um texto (o código consultado) e microtexto.
// Cada código ganha a sua roseta, sempre a mesma: a "gravura" do documento daquele código.
(() => {
  // Gerador pseudoaleatório determinístico a partir do texto (FNV-1a + mulberry32).
  function sorteio(texto) {
    let h = 2166136261;
    for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Uma faixa guilhochê: linhas fechadas que ondulam em torno de um raio, cada uma defasada da anterior.
  function faixa(r, raio, amplitude, lobos, linhas) {
    const pontos = Math.max(110, lobos * 13);
    const harm = 2 * lobos + 1;
    const caminhos = [];
    for (let j = 0; j < linhas; j++) {
      const fase = (j / linhas) * ((2 * Math.PI) / lobos);
      let d = "";
      for (let i = 0; i <= pontos; i++) {
        const t = (i / pontos) * 2 * Math.PI;
        const rad = raio + amplitude * Math.sin(lobos * t + fase * lobos) + amplitude * 0.32 * Math.sin(harm * t - fase * harm);
        d += `${i ? "L" : "M"}${Math.round(500 + rad * Math.cos(t))} ${Math.round(500 + rad * Math.sin(t))}`;
      }
      caminhos.push(`<path d="${d}Z" pathLength="1"/>`);
    }
    return caminhos.join("");
  }

  // SVG da roseta. `faixas`: 1 (selo, miniatura) ou 2 (documento).
  function roseta(texto, { faixas = 2, linhas = 12 } = {}) {
    const r = sorteio(texto);
    // amplitude baixa em relação ao raio: as linhas se entrelaçam num campo denso, como gravura
    const ext = faixa(r, 360 + r() * 40, 38 + r() * 16, 7 + Math.floor(r() * 6), linhas);
    const meio = faixas > 1 ? faixa(r, 250 + r() * 30, 30 + r() * 12, 9 + Math.floor(r() * 6), linhas) : "";
    const int = faixas > 1 ? faixa(r, 140 + r() * 30, 24 + r() * 10, 6 + Math.floor(r() * 5), linhas) : "";
    return `<svg class="roseta-svg" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" vector-effect="non-scaling-stroke">${ext}${meio}${int}
      <circle cx="500" cy="500" r="${faixas > 1 ? 96 : 230}" pathLength="1"/></g></svg>`;
  }

  // Preenche [data-roseta] e [data-micro] dentro de `raiz`.
  function gravar(raiz = document) {
    raiz.querySelectorAll("[data-roseta]:not([data-gravada])").forEach((el) => {
      el.innerHTML = roseta(el.dataset.roseta, { faixas: Number(el.dataset.faixas || 2), linhas: Number(el.dataset.linhas || 12) });
      el.dataset.gravada = "1";
    });
    raiz.querySelectorAll("[data-micro]:not([data-gravada])").forEach((el) => {
      el.setAttribute("aria-hidden", "true");
      el.textContent = `${el.dataset.micro} · `.repeat(40);
      el.dataset.gravada = "1";
    });
  }

  window.RTC = window.RTC || {};
  RTC.roseta = roseta;
  RTC.gravar = gravar;
})();
