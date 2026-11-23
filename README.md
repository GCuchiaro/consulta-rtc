# Consulta RTC

Consulta pública e gratuita de como produtos (NCM) e serviços (NBS) são tributados na
**Reforma Tributária do Consumo** (CBS, IBS e Imposto Seletivo, LC 214/2025): benefícios
do código (reduções, alíquota zero, regimes específicos), o item do anexo da lei, Imposto
Seletivo e as demais classificações tributárias (cClassTrib) permitidas.

Os dados e as regras vêm da **[Calculadora de Tributos oficial](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)**
da Receita Federal/Serpro (licença MIT), usada **sem modificações**. Este é um projeto
independente: não é um site do governo e não substitui a orientação de um contador.

## O que tem

- **Site** (`web/`): busca por nome ou código (com a hierarquia da NCM/NBS) e ficha do código.
- **API** (`/api/...`, documentação em `/api/docs`): `busca`, `produto/{ncm}`, `servico/{nbs}`, `classificacao/{cClassTrib}`, `versao`.
- **Servidor MCP** (`/mcp/`, Streamable HTTP): ferramentas `buscar_ncm_nbs`, `consultar_produto`,
  `consultar_servico` e `consultar_classificacao`, para usar no Claude ou em outro assistente.

## Como funciona

```
navegador / cliente MCP ─► gateway (FastAPI) ─► calculadora oficial (Java, rede interna)
                              │ cache, limite por IP, busca textual
                              └─ cópia somente leitura do banco SQLite oficial
```

- `calculadora/Dockerfile` baixa o código oficial na versão fixada (tag + hash do commit),
  gera o banco com as migrações oficiais (Flyway) e empacota o JAR. Nada é alterado.
- O gateway **não implementa regra tributária**. Ele:
  - consulta os endpoints de dados abertos da calculadora e guarda em cache o que muda pouco;
  - lê do banco oficial só a hierarquia da NCM/NBS (para a busca achar "arroz" em
    "Polido ou brunido") e as classificações candidatas a cada código (tabelas
    `NCM_APLICAVEL`/`NBS_APLICAVEL` e o anexo que as liga);
  - confirma cada candidata no endpoint oficial `ncm-aplicavel`/`nbs-aplicavel`, que aplica
    exceções e vigência.
- Classificações ligadas ao código **por um anexo da LC 214** aparecem como benefícios. As
  ligadas sem anexo (por exemplo, a lista restrita de quem tem Imposto Seletivo) aparecem em
  "outras permitidas". Classificações sem lista de NCM/NBS (valem para qualquer código, sob
  outras condições) não aparecem: o endpoint oficial as considera válidas para tudo.

### Inconsistência conhecida nos dados oficiais

No banco oficial (versão V0073), cerca de 25% dos vínculos NBS→anexo apontam para um item de
outro anexo (ex.: serviços de educação → "Anexo IX, item 35: Vinhaça"). O site só mostra o texto
do anexo quando ele confere com o anexo citado na descrição da classificação.

## Rodar localmente

Requisitos: Docker.

```bash
docker compose up --build
```

Abra http://localhost:8000. O primeiro build leva alguns minutos (Maven + migrações).

Testes do gateway (Python 3.12):

```bash
cd gateway && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt && .venv/Scripts/python -m pytest -q
```

## Atualizar a calculadora oficial

Troque `VERSAO` e `COMMIT` em `calculadora/Dockerfile` pela nova tag do repositório oficial e o
hash do commit dela (`git rev-list -n1 <tag>`). O build falha se o hash não conferir.

## Deploy (VPS)

`.github/workflows/deploy.yml`: a cada push na `main`, roda os testes, monta as duas imagens,
envia por SSH e sobe com `deploy/docker-compose.yml` atrás do proxy Caddy da VPS
(`deploy/Caddyfile`). Segredos: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`.
Memória: ~520 MB a calculadora, ~70 MB o gateway.

## Licença

MIT (veja `LICENSE`). A calculadora oficial é da Receita Federal/Serpro, também MIT.
