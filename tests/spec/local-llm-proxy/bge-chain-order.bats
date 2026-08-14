#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-chain-order.bats
load "../../unit/lib/bats-support/load"
load "../../unit/lib/bats-assert/load"
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T006143
#
# PRUEFMODUS (T002448-M4): ERGEBNIS-basiert — der Test importiert die ECHTE
# Parser-Funktion loadRoles() aus bge-routes.mjs und prueft, welche Ketten
# sie aus der echten loadouts.json liest. Kein Source-Grep: waere der
# roles-Block syntaktisch kaputt, wuerfe loadRoles beim Start — genau das
# ist die Semantik, die hier gemessen wird.
#
# ZUSICHERUNG: die Reihenfolge der Kettenglieder ist die Topologie-
# Entscheidung E2/E3 des Design-Docs: Laptop/Tablet zuerst (GPU), Cluster
# zweit (always-on), Desktop-CPU-Loadout zuletzt (on-demand).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

@test "T006143: embed-Kette fuehrt LM Studio vor Cluster" {
  run node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    import { loadRoles } from '${REPO_ROOT}/scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const embed = loadRoles(doc).get('embed');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(embed.length === 2, 'embed chain must have exactly 2 entries');
    assert(embed[0].kind === 'url' && embed[0].baseUrl === 'http://127.0.0.1:1234', 'embed[0] must be LM Studio :1234');
    assert(embed[1].kind === 'url' && embed[1].baseUrl === 'http://127.0.0.1:8081', 'embed[1] must be cluster :8081');
    console.log('embed chain OK');
  "
  assert_success
  assert_output --partial "embed chain OK"
}

@test "T006143: Tablet-Rerank-Endpoint live erreichbar (Skip wenn offline)" {
  # ERREICHBARKEITS-GUARD wie in bge-role-routes.bats: Laeuft das Tablet
  # nicht (CI, Gerät schlaeft), wird geskippt statt rot (T002716).
  load helpers/llm-endpoint
  local code
  if ! code=$(llm_endpoint_healthy "http://192.168.100.12:8080/health" 5); then
    skip "PK-Tablet nicht erreichbar (HTTP ${code}) — kein Aussagewert"
  fi
  [ "$code" = "200" ]
}

@test "T006143: rerank-Kette fuehrt Tablet vor Cluster vor Desktop-CPU" {
  run node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    import { loadRoles } from '${REPO_ROOT}/scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const rerank = loadRoles(doc).get('rerank');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(rerank.length === 3, 'rerank chain must have exactly 3 entries');
    assert(rerank[0].kind === 'url' && rerank[0].baseUrl === 'http://192.168.100.12:8080', 'rerank[0] must be tablet 192.168.100.12:8080');
    assert(rerank[1].kind === 'url' && rerank[1].baseUrl === 'http://127.0.0.1:8093', 'rerank[1] must be cluster :8093');
    assert(rerank[2].kind === 'loadout' && rerank[2].slug === 'bge-rerank-cpu', 'rerank[2] must be loadout bge-rerank-cpu');
    console.log('rerank chain OK');
  "
  assert_success
  assert_output --partial "rerank chain OK"
}
