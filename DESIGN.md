# Design

O site segue o design system **Giovanni Cuchiaro**, sem desvios. A fonte da verdade fica fora deste repositório, na pasta do design system (`BRAND.md`, `tokens.json`/`tokens.css`, `referencia/guia.css`, `referencia/guia-animacoes.js`).

- `web/tokens.css` é uma cópia literal do `tokens.css` do design system. Para mudar uma cor, fonte ou espaço, mude lá e copie de novo.
- `web/estilo.css` recria os componentes do guia (botão pílula de 52 px, campo de 52 px, card com borda de 1 px sem raio e sem sombra, badges, réguas, KpiCard, DataTable com traço duplo no total, linhas expansíveis) usando só os tokens pelo nome.
- Fundo claro (névoa) é o padrão; bandas escuras recebem `.dark`. Não há seletor de tema.
- Tipografia: Inter Tight, Instrument Serif itálico (um por título, no fim, em `accent`) e IBM Plex Mono para rótulos e códigos.
- Movimento conforme o guia: revelação de bloco e de linha, números que contam do zero, régua verde que fecha, faixa rolante, órbita, magnetismo do botão primário, cursor e fio de progresso; tudo estático com "reduzir movimento".
- Logos em `web/marca/` copiados de `logos/` do design system.

Antes de entregar: um botão primário por tela, um itálico serifado por título, números tabulares, contraste AA nos dois fundos.
