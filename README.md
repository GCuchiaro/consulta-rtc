# Consulta RTC

Site público e gratuito que junta, numa interface só, as três ferramentas de código aberto que a
Receita Federal publicou para a **Reforma Tributária do Consumo** (CBS, IBS e Imposto Seletivo,
LC 214/2025):

| Ferramenta oficial | Repositório | Usada para |
| --- | --- | --- |
| Calculadora de tributos · regime regular (Java) | [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | consulta, simulador, XML, bases de cálculo, pedágio, NFS-e, tabelas |
| Calculadora · Simples Nacional (Java) | [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | simulador do Simples, atividades |
| Gerador de DANFSe (Go) | [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | PDF da NFS-e |

As três rodam **sem nenhuma modificação** e são **atualizadas automaticamente** a cada commit novo
nos repositórios oficiais. Projeto independente: não é um site do governo e não substitui a
orientação de um contador. No ar em <https://rtc.giovannicuchiaro.com>.

## O que o site faz

- **Página de entrada** — a raiz do site (`#/`) apresenta as funcionalidades e leva à calculadora
  (`#/consulta`); é HTML estático, lido também sem JavaScript.
- **Consulta** — busca de produtos (NCM) e serviços (NBS) por nome ou código, com a hierarquia
  oficial. A ficha mostra os benefícios do código (cClassTrib ligadas por anexo da LC 214/2025, com o
  texto do item), Imposto Seletivo, outras classificações aceitas e, para serviços, as regras da NFS-e
  (classificações por NBS, indicador de operação e local de incidência).
- **Simulador · regime regular** — CBS, IBS e IS item a item, memória de cálculo oficial, totais e o
  XML dos grupos de tributação (NF-e, NFC-e, NFS-e, CT-e, BP-e, NF3-e) gerado pela calculadora.
- **Simulador · Simples Nacional** — CBS e IBS de notas de empresas do Simples (NF-e, NFC-e, NFS-e e
  demais), com atividade (cAtivSN), anexo, fator "r", sublimite e alíquotas efetivas do PGDAS.
- **Documentos** — validação de XML contra os XSD oficiais (erro traduzido, linha destacada) e
  geração do DANFSe em PDF.
- **Bases e cálculos** — base unificada (NF-e/NFC-e e NFS-e), base da NFS-e, bases de CBS/IBS e de IS
  de mercadorias, pedágio e validação de indicador de operação. Formulários montados a partir do
  OpenAPI oficial: campo novo numa versão oficial aparece sem mudar o site.
- **Tabelas** — classificações, CST, fundamentação legal, alíquotas de referência, redutores,
  transferências, regras da NFS-e, atividades do Simples, UFs e municípios, com filtro e CSV. Toda
  consulta GET oficial que não está na lista curada aparece automaticamente em "Outras consultas".
- **API e MCP** — tudo por HTTP (`/api/docs`) e a API oficial completa repassada em
  `/api/oficial/rr/…` e `/api/oficial/sn/…` (OpenAPI em `…/openapi.json`). Servidor MCP em `/mcp/`
  com `buscar_ncm_nbs`, `consultar_produto`, `consultar_servico`, `consultar_classificacao`,
  `simular_operacao`, `listar_atividades_simples` e `simular_simples_nacional`.

## Arquitetura

```
navegador / cliente MCP ─► gateway (FastAPI + site estático)
                              ├─► calculadora (regime regular, Java)   ┐
                              ├─► calculadora-sn (Simples, Java)       ├ rede interna, sem acesso externo
                              └─► danfse (gerador de DANFSe, Go)       ┘
```

- `calculadora/`, `calculadora-sn/` e `danfse/` têm um Dockerfile cada, que baixa o código oficial no
  **commit fixado** (`ARG COMMIT`; `ARG VERSAO` é só o rótulo do `git describe`) e confere o hash.
  A calculadora do Simples usa o banco SQLite gerado pelas migrações da calculadora do regime regular,
  como manda o README oficial.
- O `gateway/` não implementa regra tributária: repassa às APIs oficiais (só rotas `/calculadora/…` e
  `/versao`), guarda em cache o que muda pouco, lê do banco oficial apenas a hierarquia NCM/NBS e as
  classificações candidatas de cada código (confirmadas no endpoint oficial `ncm-aplicavel`/
  `nbs-aplicavel`) e organiza as respostas. Limite de 120 requisições/minuto por IP. Nada que o usuário
  envia é guardado.
- `web/` é o site (HTML/CSS/JS sem build), sobre o design system Giovanni Cuchiaro: `tokens.css`
  copiado do sistema, Inter Tight, Instrument Serif itálico e IBM Plex Mono, névoa com bandas escuras,
  verde inglês como único destaque. Detalhes em `DESIGN.md`; o produto, em `PRODUCT.md`.

### Inconsistência conhecida nos dados oficiais

No banco oficial (V0073), cerca de 25% dos vínculos NBS→anexo apontam para um item de outro anexo
(ex.: educação → "Anexo IX, item 35: Vinhaça"). O site só mostra o texto do anexo quando ele confere
com o anexo citado na descrição da classificação.

## Atualização automática

`.github/workflows/atualizar-oficiais.yml`, a cada 6 horas (e sob demanda):

1. compara o `HEAD` da branch principal de cada repositório oficial com o `COMMIT` dos Dockerfiles;
2. havendo mudança, troca `COMMIT`/`VERSAO`, monta as quatro imagens e sobe tudo;
3. roda `scripts/teste-fumaca.sh` com dados reais (consulta, simulação, XML gerado e validado,
   Simples, base de cálculo, DANFSe, MCP);
4. passou: commit na `main` e disparo do deploy. Falhou: nada vai ao ar e uma issue registra o
   resultado e os logs.

## Rodar localmente

```bash
docker compose up --build        # http://localhost:8000
scripts/teste-fumaca.sh http://localhost:8000   # requer curl e jq
```

Testes do gateway (Python 3.12): `cd gateway && pip install -r requirements.txt && pytest -q`.

## Deploy

`.github/workflows/deploy.yml`: a cada push na `main` (ou disparo do robô), roda os testes, monta as
quatro imagens, envia por SSH à VPS, sobe com `deploy/docker-compose.yml` atrás do proxy Caddy
(`deploy/Caddyfile`), espera os quatro serviços ficarem saudáveis e roda o teste de fumaça em
produção. Segredos: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`. Limites de memória:
512 MB e 384 MB nas calculadoras (JVM enxuta: heap em 50% do limite, GC serial, C1, 16 threads HTTP),
64 MB no DANFSe, 160 MB no gateway; ~1,1 GB no total.

## Licença

MIT (veja `LICENSE`). As ferramentas oficiais são da Receita Federal/Serpro, também MIT; o arquivo
`scripts/fixtures/nfse-exemplo.xml` vem dos testes do gerador de DANFSe oficial.
