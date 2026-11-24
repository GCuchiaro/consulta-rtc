---
name: Consulta RTC
description: Como cada produto e serviço é tributado na Reforma, impresso como documento de segurança.
colors:
  surface: "#ECEAE6"
  surface-raised: "#F5F3EF"
  surface-sunken: "#E2DFD8"
  line: "#CDC8BE"
  line-strong: "#8B867C"
  text-primary: "#15171A"
  text-secondary: "#55534E"
  accent: "#273D31"
  accent-fill-hover: "#1B2B22"
  accent-soft: "#DCE2DC"
  accent-escuro: "#67A282"
  gravura-tenue: "rgba(39, 61, 49, 0.16)"
  face: "#1C5236"
  serie: "#8C2F23"
  positive: "#2E6B45"
  negative: "#9A3B2E"
  warning: "#7E5408"
  info: "#34557E"
typography:
  display:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(44px, 5vw, 70px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontVariation: "\"opsz\" 96"
  face:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(64px, 9vw, 104px)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontVariation: "\"opsz\" 96"
  headline:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(34px, 4.6vw, 52px)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  headline-secao:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(32px, 4vw, 48px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  veredito:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.25
  title:
    fontFamily: "Libre Franklin, Franklin Gothic, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Libre Franklin, Franklin Gothic, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Libre Franklin, Franklin Gothic, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.1em"
  codigo:
    fontFamily: "Courier Prime, Courier New, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "20px"
  micro:
    fontFamily: "Libre Franklin, Franklin Gothic, system-ui, sans-serif"
    fontSize: "6.5px"
    fontWeight: 600
    lineHeight: "10px"
    letterSpacing: "0.12em"
rounded:
  "0": "0"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "18": "72px"
  "24": "96px"
components:
  btn-primario:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.0}"
    padding: "0 24px"
    height: "44px"
  btn-primario-hover:
    backgroundColor: "{colors.accent-fill-hover}"
  btn-secundario:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.0}"
    padding: "0 24px"
    height: "44px"
  btn-fantasma:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.0}"
    padding: "0 12px"
    height: "44px"
  btn-fantasma-hover:
    backgroundColor: "{colors.accent-soft}"
  campo:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.0}"
    padding: "0 12px"
    height: "44px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.0}"
    padding: "3px 8px"
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.0}"
    padding: "24px"
  serie:
    textColor: "{colors.serie}"
    typography: "{typography.codigo}"
  face-valor:
    textColor: "{colors.face}"
    backgroundColor: "{colors.surface-raised}"
    typography: "{typography.face}"
---

# Design System: Consulta RTC

## Overview

**Creative North Star: "Impressão de segurança"**

Cada código consultado é impresso como um documento de segurança para ele. A resposta é o valor de face, a lei é o microtexto, a origem oficial é a gravura. O papel é off-white com um campo de linhas onduladas finas; a tinta é verde inglês; o texto é grafite. O sistema existe para que um número tributário (0%, 70%, 100% da alíquota cheia) seja lido como se lê o valor de uma cédula: grande, inequívoco, cercado por gravura que atesta a procedência.

A densidade é de documento, não de vitrine. Fios finos de 1px organizam tudo; o ritmo vem de réguas (fio simples, fio grafite de abertura, traço duplo de total), nunca de caixas com sombra. A landing usa o mundo em escala cheia (moldura que ocupa a dobra, roseta grande, selos perfurados); as telas de trabalho usam a versão contida (o certificado da ficha, a faixa de prova do simulador, tabelas de livro-razão).

O mundo recusa o padrão da categoria: hero dividido de fintech, cards de funcionalidade com ícone, mockup de tela. Também não imita documento ou brasão do governo: a gravura é própria, gerada pelos dígitos do código.

**Key Characteristics:**
- Papel de segurança (#ECEAE6) com campo ondulado; tinta de gravura verde inglês; texto grafite.
- Rosetas guilhochê em SVG, determinísticas por código: o mesmo código, sempre a mesma roseta.
- Molduras de fio duplo com faixa de microtexto.
- Valor de face em Bodoni Moda; texto em Libre Franklin; códigos em Courier Prime.
- Cantos retos em tudo; nenhuma sombra de elevação.
- Tema claro é o padrão; tema escuro por escolha explícita, com a tinta em #67A282.

## Colors

Paleta de papel e tinta: um verde de gravura sobre off-white, grafite para o texto, e dois tons de destaque com papel estrito (verde intenso do valor de face, vermelho do numerador).

### Primary
- **Verde inglês de gravura** (accent / gravura): a tinta do mundo. Fios das molduras, rosetas, links, botão principal cheio, marca de foco, sublinhado da navegação ativa. No escuro vira **Verde inglês claro** (accent-escuro), que assume o mesmo papel; o botão principal continua cheio no verde inglês escuro.
- **Verde de gravura profundo** (accent-fill-hover): só o hover do botão principal.
- **Verde lavado** (accent-soft): fundo de hover de linhas de lista, índice, tabelas, sugestões e botão fantasma.
- **Gravura tênue** (gravura-tenue): fios internos que separam a faixa de microtexto do corpo do documento e as metades da faixa de prova.

### Secondary
- **Verde de face** (face): exclusivamente o valor de face (ficha, selos da landing, a metade "benefício" da faixa de prova). No escuro, #86CFA5.

### Tertiary
- **Vermelho de numerador** (serie): exclusivamente o código de série (NCM/NBS impresso no topo do certificado, nos selos e no canhoto da API), em Courier Prime. No escuro, #E08A73.

### Neutral
- **Papel de segurança** (surface): fundo da página e do topo fixo. No escuro, grafite #15171A.
- **Papel prensado** (surface-raised): interior das molduras, cards, campos, células dos selos. Também é o "recorte" atrás do valor de face sobre a roseta.
- **Papel sombreado** (surface-sunken): notas, blocos de código, o corpo perfurado dos selos.
- **Fio de papel** (line): divisores e bordas de card.
- **Fio forte** (line-strong): bordas de campo, botão secundário e tags.
- **Grafite** (text-primary): texto, e o fio de abertura (1px) no topo de listas, tabelas e chave/valor.
- **Grafite lavado** (text-secondary): texto de apoio, rótulos, legendas.
- **Estados** (positive, negative, warning, info): apenas mensagens, tags de estado e erros de campo, sempre como borda ou texto, nunca como fundo cheio.

### Named Rules
**The Tinta Única Rule.** Toda gravura (fios de moldura, rosetas, microtexto, onda do papel) sai de uma só tinta, `--gravura`. Não existe gravura em duas cores.

**The Valor de Face Rule.** O verde de face aparece só no número que diz quanto da alíquota cheia se paga. Um segundo uso dilui o único ponto que deve gritar.

**The Numerador Rule.** O vermelho fica restrito ao código de série. Erros usam `--negative`, nunca `--serie`.

## Typography

**Display Font:** Bodoni Moda (com Didot, Bodoni 72, Georgia), eixo óptico em 96 nos tamanhos grandes
**Body Font:** Libre Franklin (com Franklin Gothic, system-ui)
**Label/Mono Font:** Courier Prime (com Courier New, ui-monospace)

**Character:** o Bodoni de alto contraste é a voz do valor impresso e dos títulos, como numa cédula; o Franklin é a letra de serviço, tabular e legível; o Courier é a máquina que numera o documento.

### Hierarchy
- **Display** (500, clamp(44px, 5vw, 70px), 1): título da landing, até 14ch. No celular, 34px.
- **Face** (600, clamp(64px, 9vw, 104px), 0.9): valor de face do certificado. Variante textual em itálico 28–38px ("Regime específico"). Nos selos, 54px (42px no celular); na faixa de prova, 32px e 40px para o benefício.
- **Headline** (500, clamp(34px, 4.6vw, 52px), 1.04): h1 das telas, até 20ch; itálico em `em`. Títulos de seção da landing em clamp(32px, 4vw, 48px); `h2.secao` do app em 30px.
- **Veredito** (400, 24px, 1.25, serifa): a frase-resposta da ficha, até 34ch, com o termo decisivo em itálico verde. O resumo do simulador usa a mesma voz em 22px.
- **Title** (600, 17px, 24px): h3 e títulos de classificação (15px/22px).
- **Body** (400, 15px, 24px): texto corrido, números tabulares em todo o corpo. Lead 16px/26px até 64ch.
- **Label** (600, 11px, 0.1em, caixa alta): cabeçalhos de tabela, legendas da face e da prova, rótulos de KPI, legend, metadados à direita de um título de card.
- **Código** (700, 13px, Courier Prime): códigos NCM/NBS e cClassTrib; série a 13px/18px com 0.04em.
- **Microtexto** (600, 6.5px, 0.12em, caixa alta): faixas de microtexto das molduras, decorativas e `aria-hidden`.

### Named Rules
**The Três Máquinas Rule.** Serifa para o que é impresso como valor ou título, sans para o que é lido, mono para o que é numerado. Um código nunca aparece em serifa; um valor de face nunca aparece em sans.

**The Rótulo Lateral Rule.** O rótulo em caixa alta acompanha um dado (coluna, legenda, contagem, metadado ao lado do título). Ele não é colocado acima de um título como chamada de seção.

## Layout

Contêiner de até 1240px com 16px de gutter (32px a partir de 1200px); medida de leitura de 64ch. Espaçamento em escala de 4px (4 a 96). Formulários em grade de 12 colunas que cai para 2 abaixo de 760px. A navegação vira faixa horizontal rolável abaixo de 760px, com máscara de esmaecimento à direita.

A landing é uma folha: o campo ondulado cobre a primeira seção e a moldura do documento ocupa a dobra, em duas colunas (1.12fr / 1fr) com a roseta grande entre elas, sob o texto e os selos. Abaixo de 960px as colunas empilham e a roseta se desloca para o canto superior direito. As seções seguintes são livros-razão: listas abertas com traço duplo grafite (3px double), linhas com fio de 1px, colunas 4fr/7fr.

A ficha é um certificado: cabeçalho com série e data de referência, título, e um corpo em duas colunas (face de 200–260px | veredito), que empilha abaixo de 720px. A largura de cada faixa é medida pelo conteúdo, não por uma grade fixa.

## Elevation & Depth

Sem elevação. O sistema é plano e a profundidade vem da impressão: camadas de papel (surface, surface-raised, surface-sunken), fios e a sobreposição de texto sobre gravura. `box-shadow` aparece apenas como `inset`, para desenhar fios internos (moldura dupla da faixa de prova e do KPI total, fio de tarja do botão principal, contorno das células do selo); nunca projeta sombra.

### Named Rules
**The Papel Plano Rule.** Nada flutua. Se um elemento precisa se destacar, ele ganha um fio ou uma moldura, não uma sombra. Sobreposições (sugestões da busca) usam fundo surface-raised e fio de 1px.

**The Recorte Rule.** Quando texto é impresso sobre uma roseta, ele leva um recorte de papel (fundo surface-raised atrás do número ou da legenda), como numa cédula. A gravura nunca passa por trás de um algarismo sem esse recorte.

## Shapes

Cantos retos em tudo (raio 0): botões, campos, cards, tags, molduras, até os marcadores das tags (quadrados de 6px). A forma de assinatura é a moldura de fio duplo: fio externo de 1px, 7px de faixa ondulada e fio interno de 1px; o miolo leva o microtexto no topo separado por fio tênue. A segunda forma é o selo perfurado: máscara radial de 12px que recorta a borda como picote de selo. Rosetas são círculos guilhochê de linhas finas (0.6px), sem preenchimento. Totais levam traço duplo (3px double) em verde.

## Components

### Buttons
Tarjas gravadas: retos, firmes, sem arredondamento.
- **Shape:** retos (0), altura mínima 44px (34px na variante pequena), 600 14px.
- **Primary:** verde inglês cheio com texto off-white e um fio interno claro a 3px da borda, como uma tarja impressa. Na busca da landing fica dentro do campo, com 56px.
- **Hover / Focus:** hover escurece o fundo e acentua o fio interno; foco é contorno de 2px na cor de foco, 2px de afastamento.
- **Secundário:** transparente com fio forte; no hover o fio vira grafite.
- **Fantasma:** texto verde, sem borda; hover com fundo verde lavado. Usado no seletor de tema e em "Remover".

### Chips (tags)
- **Style:** fio forte de 1px, fundo transparente, 500 12px, com um quadrado de 6px à esquerda que carrega o estado (verde = ok, âmbar = alerta, vermelho = erro, azul = info).
- **State:** a tag de alerta também troca a cor do fio.

### Cards / Containers
- **Corner Style:** reto (0).
- **Background:** papel prensado; notas em papel sombreado.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** fio de papel de 1px; documentos importantes usam a moldura de fio duplo.
- **Internal Padding:** 24px (card), 16px (bloco), 32px no certificado (20px no celular).

### Inputs / Fields
- **Style:** fio forte de 1px, fundo papel prensado, reto, 44px de altura, 400 15px. Textarea em Courier Prime 13px.
- **Focus:** contorno de 2px na cor de foco e fio na mesma cor.
- **Error / Disabled:** `aria-invalid` troca o fio para vermelho de erro; mensagem 600 13px vermelha ligada ao campo. Desabilitado a 45% de opacidade.
- **Busca da landing:** a linha de preenchimento do documento. Caixa com fio grafite e 4px de respiro; dentro, o campo sem borda com sublinhado tracejado que fica verde no foco, e o botão Buscar encostado.

### Navigation
- Topo fixo em papel de segurança com fio inferior. Marca: monograma GC de 30px e "Consulta *RTC*" em Bodoni 23px, RTC em itálico verde.
- Links 500 14px em grafite lavado; hover grafite; ativo grafite com sublinhado de 2px verde que encosta no fio do topo. Subnavegação igual, em 600.
- Celular: a navegação desce para uma linha própria e rola na horizontal.

### Certificado (ficha do código)
A ficha de cada NCM/NBS impressa como documento: moldura de fio duplo, faixa de microtexto com a lei, série vermelha em Courier e data de referência no cabeçalho, título em Bodoni, e o corpo com a **face** (roseta do código gravada atrás do valor de face verde, com recorte de papel e legenda em caixa alta) ao lado do veredito. A roseta se desenha uma vez ao abrir (1.8s, cubic-bezier(.16, 1, .3, 1)), e fica estática com movimento reduzido.

### Classificações (impressão fantasma)
Lista de cClassTrib com coluna de código de 96px. A classificação aplicável é impressa nítida, dentro de um fio de gravura sobre papel de segurança; as alternativas ficam em impressão fantasma (82% de opacidade) e voltam a 100% no hover ou foco. A base legal entra com um § verde em serifa.

### Selo perfurado
Exemplo real clicável da landing: célula do valor (roseta de uma faixa a 55%, número em Bodoni verde de face) e célula do texto (série vermelha, nome em Bodoni 21px, linha de prova em 12.5px), separadas por fios de gravura e recortadas por picote de 12px. Foco desenha fio de 2px nas duas células.

### Faixa de prova
No simulador, a mesma operação lado a lado: regra geral (valor em grafite lavado) e benefício (valor maior em verde de face), dentro de moldura dupla desenhada com fios internos, metades separadas por fio tênue, nota de rodapé em largura total. Empilha abaixo de 560px.

### Livro-razão
Listas, tabelas e chave/valor abrem com fio grafite de 1px (ou traço duplo de 3px nas seções da landing), cada linha fechada por fio de papel; totais de tabela com fio grafite em cima e traço duplo verde embaixo. Hover de linha em verde lavado.

## Do's and Don'ts

### Do:
- **Do** gerar toda roseta com `RTC.roseta(texto)` a partir do código, para que cada código tenha sempre a mesma gravura.
- **Do** emoldurar todo documento-resposta (certificado, canhoto da API, chamada final) com a moldura de fio duplo e uma faixa de microtexto `aria-hidden`.
- **Do** imprimir o valor de face em Bodoni Moda com `"opsz" 96` e o verde de face, com recorte de papel atrás quando houver roseta.
- **Do** abrir listas e tabelas com fio grafite e fechar totais com traço duplo (3px double).
- **Do** manter cantos retos (0) e alvos de toque de 44px.
- **Do** respeitar `prefers-reduced-motion`: a roseta só se desenha quando não há preferência por movimento reduzido.

### Don't:
- **Don't** usar sombras projetadas ou cantos arredondados em nenhum componente.
- **Don't** usar o vermelho de numerador fora do código de série, nem o verde de face fora do valor de face.
- **Don't** imitar brasão, armas ou layout de documento do governo; a gravura é própria do produto.
- **Don't** voltar ao padrão da categoria: hero dividido com mockup de tela e grade de cards de funcionalidade com ícone.
- **Don't** pôr rótulo em caixa alta acima de um título como chamada de seção.
- **Don't** usar ícones de glifo; setas e sinais são SVG em traço (`.seta`) ou tipografia do próprio texto (o § da lei).
- **Don't** trocar as cores de marca: verde inglês (#273D31 / #67A282), grafite (#15171A) e off-white (#ECEAE6) são obrigatórios.
