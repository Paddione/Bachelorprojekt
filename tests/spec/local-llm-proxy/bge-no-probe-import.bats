#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-no-probe-import.bats
load "../../unit/lib/bats-support/load"
load "../../unit/lib/bats-assert/load"
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T900006
#
# Guard: bge-routes.mjs darf discovery.mjs weder direkt noch transitiv importieren,
# damit das anfragegetriebene Failover nicht unbemerkt zu einem probe-getriebenen wird.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

@test "T900006: bge-routes.mjs importiert discovery.mjs weder direkt noch transitiv" {
  run node --input-type=module -e "
    import { readFileSync, existsSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';

    const visited = new Set();
    const targetFile = resolve('${REPO_ROOT}/scripts/llm-proxy/bge-routes.mjs');
    const discoveryFile = resolve('${REPO_ROOT}/scripts/llm-proxy/discovery.mjs');

    function checkImports(file) {
      if (visited.has(file)) return;
      visited.add(file);
      if (file === discoveryFile) {
        console.error('FAIL: discovery.mjs is imported in the bge-routes dependency graph!');
        process.exit(1);
      }
      if (!existsSync(file)) return;
      const content = readFileSync(file, 'utf8');
      const importRegex = /(?:import|from)\s+['\"](\.[^'\"]+)['\"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const depPath = resolve(dirname(file), match[1]);
        const candidates = [depPath, depPath + '.mjs', depPath + '.js'];
        for (const c of candidates) {
          if (existsSync(c)) {
            checkImports(c);
            break;
          }
        }
      }
    }

    checkImports(targetFile);
    console.log('no probe import OK');
  "
  assert_success
  assert_output --partial "no probe import OK"
}