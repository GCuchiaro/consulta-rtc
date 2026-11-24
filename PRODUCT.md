# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally:

- **Contadores** (escritórios contábeis): conferem, várias vezes por dia, qual cClassTrib usar para um NCM/NBS, a base legal na LC 214/2025 e o valor de CBS/IBS/IS de uma operação, para orientar clientes e preencher notas fiscais.
- **Donos de empresa** (muitos optantes pelo Simples Nacional): querem saber, em linguagem simples, como o produto ou serviço que vendem será tributado na Reforma Tributária e quanto isso pesa.

A landing tende a falar com o empresário; as telas de trabalho (ficha, simuladores, documentos, bases) servem sobretudo o contador.

## Product Purpose

Site público e gratuito que mostra como cada produto (NCM) e serviço (NBS) é tributado na Reforma Tributária do Consumo (CBS, IBS e Imposto Seletivo), usando as calculadoras oficiais da Receita Federal sem alterar uma linha do código oficial. Sucesso: a pessoa encontra o código, entende se há benefício (alíquota zero, redução, regime específico) com a fundamentação legal, e simula a operação com números oficiais.

## Positioning

Roda as próprias calculadoras oficiais da Receita (regime regular e Simples Nacional) e as bases oficiais, atualizadas automaticamente a cada 6 horas a partir dos repositórios públicos; cada resposta mostra a requisição e a resposta oficiais. Não é interpretação de terceiros: as regras são da Receita.

## Operating Context

- Rotas: landing (#/), consulta/busca, ficha de NCM/NBS, simulador do regime regular, simulador do Simples Nacional, validação de XML, DANFSe, bases e cálculos (ferramentas oficiais), tabelas, sobre.
- Uso no escritório (desktop) e no celular; consulta pontual e trabalho repetitivo.
- Saídas: XML dos grupos de tributação (NF-e, NFC-e, NFS-e, CT-e, BP-e, NF3-e), PDF de DANFSe, CSV em tabelas, API aberta (/api/docs) e conector MCP para o Claude.
- Datas importam: 2026 usa alíquotas de teste oficiais; o Imposto Seletivo e as alíquotas informadas valem a partir de 2027.

## Capabilities and Constraints

- Site estático (HTML/CSS/JS sem framework, em `web/`) servido por um gateway FastAPI; roteamento por hash. Sem build step.
- Hospedado em VPS própria com Docker Compose, com limites de memória baixos; deve continuar leve.
- Termos do domínio a preservar: NCM, NBS, cClassTrib, CST, CBS, IBS, IS, LC 214/2025, regime regular, Simples Nacional, NFS-e.
- Não inventar alíquotas definitivas: alíquotas de 2027+ são simuladas e precisam continuar marcadas como tal.

## Brand Commitments

- Nome: **Consulta RTC**, assinado por **Giovanni Cuchiaro** (monograma GC em `web/marca/`).
- **Design system obrigatório** (decisão do usuário, 2026-11-24): o site segue integralmente o design system Giovanni Cuchiaro (BRAND.md, tokens, guia de referência). Nada de mundo visual próprio.
- Voz: português do Brasil, direta, sem jargão desnecessário, sem promessas comerciais.

## Evidence on Hand

- Dados reais via API: busca, fichas, simulações, versões das calculadoras e da base (ex.: base V0073), exemplo arroz 1006.30.21 com cClassTrib 200003 (alíquota zero).
- Repositório público GCuchiaro/consulta-rtc.
- Não há depoimentos, clientes, números de uso nem imprensa: nada disso pode ser inventado.

## Product Principles

1. A resposta vem antes da explicação: veredito claro primeiro, base legal logo abaixo.
2. Tudo verificável: mostrar de onde vem cada número (calculadora oficial, versão, requisição/resposta).
3. Duas profundidades: simples para o empresário, completo para o contador, na mesma tela.
4. Leve e rápido, sem dependências pesadas.

## Accessibility & Inclusion

Funcionar por teclado e leitor de tela (combobox, aria-live, erros ligados aos campos), sem rolagem lateral no celular, contraste AA nos dois temas.
