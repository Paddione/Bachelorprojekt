#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T002729
#
# [T900107] findExclusiveConflict und die exclusiveGroup-Arbitrierung sind
# entfallen (Proxy laeuft im Cluster ohne GPU). Die Pruefung, dass die beiden
# bge-CPU-Loadouts verschiedene Ports belegen, bleibt bestehen.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

@test "loadouts: die bge-CPU-Loadouts belegen weiterhin verschiedene Ports" {
  # Ohne getrennte Ports waere ein gleichzeitiger Betrieb unmoeglich.
  # Der Positiv-Anker steckt in der Pruefung selbst — beide Ports muessen
  # gesetzt UND verschieden sein.
  run node --input-type=module -e "
    import { parseLoadouts, findLoadout } from '${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const a = findLoadout(doc, 'bge-embed-cpu')?.port;
    const b = findLoadout(doc, 'bge-rerank-cpu')?.port;
    console.log(Number.isInteger(a) && Number.isInteger(b) && a !== b ? 'DISTINCT' : \`BAD:\${a}/\${b}\`);
  "
  [ "$status" -eq 0 ]
  [ "$output" = "DISTINCT" ]
}
