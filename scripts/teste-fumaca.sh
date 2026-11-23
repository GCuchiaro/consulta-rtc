#!/usr/bin/env bash
# Teste de fumaça com dados reais contra um Consulta RTC no ar (local ou produção).
# Uso: scripts/teste-fumaca.sh http://localhost:8000
# Sai com erro se alguma das ferramentas oficiais não responder como esperado.
set -euo pipefail
BASE="${1:-http://localhost:8000}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
falhas=0
ok()    { printf '  ok    %s\n' "$1"; }
falha() { printf '  FALHA %s\n' "$1"; falhas=$((falhas + 1)); }
checa() { local nome="$1"; shift; if "$@" > /dev/null 2>&1; then ok "$nome"; else falha "$nome"; fi; }

echo "Teste de fumaça em $BASE"
v=$(curl -sf "$BASE/api/versao")
echo "  versões: $(echo "$v" | jq -c '{rr: .calculadora.versaoApp, db: .calculadora.versaoDb, sn: .simplesNacional.versaoApp, danfse: .danfse.ok}')"
checa "regime regular no ar"     jq -e '.calculadora.versaoApp' <<< "$v"
checa "Simples Nacional no ar"   jq -e '.simplesNacional.versaoApp' <<< "$v"
checa "gerador de DANFSe no ar"  jq -e '.danfse.ok == true' <<< "$v"

checa "busca acha arroz" bash -c "curl -sf '$BASE/api/busca?q=arroz&tipo=ncm' | jq -e '.ncm | length > 3'"
checa "arroz tem cesta básica (200003)" bash -c "curl -sf '$BASE/api/produto/10063021' | jq -e '[.classificacoes[].cClassTrib] | index(\"200003\")'"
checa "educação tem redução (200028)" bash -c "curl -sf '$BASE/api/servico/122011200' | jq -e '[.classificacoes[].cClassTrib] | index(\"200028\")'"

sim='{"data":"2026-11-23","uf":"SP","municipio":3550308,"itens":[{"tipo":"ncm","codigo":"84713012","valor":1000}]}'
checa "simulação regime regular calcula" bash -c "curl -sf -X POST '$BASE/api/simular' -H 'Content-Type: application/json' -d '$sim' | jq -e '.totais.total > 0'"
xml=$(curl -sf -X POST "$BASE/api/simular/xml?tipo=nfe" -H 'Content-Type: application/json' -d "$sim" || true)
checa "XML gerado é válido no XSD oficial" bash -c "curl -sf -X POST '$BASE/api/validar-xml?tipo=nfe&subtipo=grupo' --data-binary @- <<< '$xml' | jq -e '.valido == true'"

sn='{"id":"t","versao":"3.0.0","data":"2027-03-15","tpDoc":"55","CRT":"1","aliquotasEfetivas":{"fatorR":true,"impedimentoSublimite":false,"anexoI":{"pCBSSN":"1.1612","pIBSSN":"0.0129"}},"itens":[{"numero":1,"cAtivSN":"01","cClassTrib":"000001","baseCalculo":"1000.00","valorImpostoSeletivo":"0.00"}]}'
checa "Simples Nacional calcula" bash -c "curl -sf -X POST '$BASE/api/oficial/sn/calculadora/observabilidade/simples-nacional/nao-assistido' -H 'Content-Type: application/json' -d '$sn' | jq -e '.total.totalTributos | tonumber > 0'"
checa "atividades do Simples" bash -c "curl -sf '$BASE/api/oficial/sn/calculadora/simples-nacional/atividades?data=2027-03-15' | jq -e 'length > 10'"

checa "base de cálculo unificada" bash -c "curl -sf -X POST '$BASE/api/oficial/rr/calculadora/base-calculo/base-calculo-unificada' -H 'Content-Type: application/json' -d '{\"anoFatoGerador\":2027,\"tipoDocumento\":55,\"natureza\":\"bem\",\"vProd\":1000}' | jq -e '.baseRG > 0'"
checa "OpenAPI oficial disponível" bash -c "curl -sf '$BASE/api/oficial/rr/openapi.json' | jq -e '.paths | length > 20'"
checa "DANFSe gera PDF" bash -c "curl -sf -X POST '$BASE/api/danfse' --data-binary @'$AQUI/fixtures/nfse-exemplo.xml' | head -c 5 | grep -q '%PDF'"
checa "site carrega" bash -c "curl -sf '$BASE/' | grep -q 'Consulta'"
checa "MCP lista ferramentas" bash -c "curl -sf -X POST '$BASE/mcp/' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | grep -q simular_simples_nacional"

if [ "$falhas" -gt 0 ]; then echo "$falhas verificação(ões) falharam"; exit 1; fi
echo "Tudo certo."
