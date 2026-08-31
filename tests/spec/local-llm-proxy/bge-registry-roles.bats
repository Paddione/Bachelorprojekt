#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-registry-roles.bats
load "../../unit/lib/bats-support/load"
load "../../unit/lib/bats-assert/load"
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T900006
#
# PRUEFMODUS (T002448-M4): ERGEBNIS-basiert — der Test ruft die echten
# Funktionen rolesFromRegistry() und resolveRoleChain() aus bge-routes.mjs auf
# und prueft das Verhalten gegen Fixtures. Kein Datenbankzugriff im Test.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

@test "T900006: rolesFromRegistry sortiert nach priority und filtert disabled" {
  cd "$REPO_ROOT"
  run node --input-type=module -e "
    import { rolesFromRegistry } from './scripts/llm-proxy/bge-routes.mjs';
    const backends = [
      { name: 'b-mid', enabled: true, priority: 20, roles: ['embed', 'rerank'], baseUrl: 'http://127.0.0.1:1234' },
      { name: 'b-first', enabled: true, priority: 1, roles: ['embed'], baseUrl: 'http://127.0.0.1:8085' },
      { name: 'b-disabled', enabled: false, priority: 5, roles: ['embed'], baseUrl: 'http://127.0.0.1:9999' },
      { name: 'b-loadout', enabled: true, priority: 30, roles: ['rerank'], baseUrl: 'http://127.0.0.1:18235', loadoutSlug: 'bge-rerank-cpu' },
      { name: 'b-second', enabled: true, priority: 10, roles: ['embed', 'rerank'], baseUrl: 'http://127.0.0.1:8081' }
    ];
    const roles = rolesFromRegistry(backends);
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

    const embed = roles.get('embed');
    assert(Array.isArray(embed), 'embed chain must exist');
    assert(embed.length === 3, 'embed chain must have 3 entries (disabled excluded)');
    assert(embed[0].kind === 'url' && embed[0].baseUrl === 'http://127.0.0.1:8085', 'embed[0] priority 1');
    assert(embed[1].kind === 'url' && embed[1].baseUrl === 'http://127.0.0.1:8081', 'embed[1] priority 10');
    assert(embed[2].kind === 'url' && embed[2].baseUrl === 'http://127.0.0.1:1234', 'embed[2] priority 20');

    const rerank = roles.get('rerank');
    assert(Array.isArray(rerank), 'rerank chain must exist');
    assert(rerank.length === 3, 'rerank chain must have 3 entries');
    assert(rerank[0].kind === 'url' && rerank[0].baseUrl === 'http://127.0.0.1:8081', 'rerank[0] priority 10');
    assert(rerank[1].kind === 'url' && rerank[1].baseUrl === 'http://127.0.0.1:1234', 'rerank[1] priority 20');
    assert(rerank[2].kind === 'loadout' && rerank[2].slug === 'bge-rerank-cpu', 'rerank[2] priority 30 loadout');

    console.log('registry roles OK');
  "
  assert_success
  assert_output --partial "registry roles OK"
}

@test "T900006: resolveRoleChain faellt auf loadouts.json zurueck bei leerer Registry" {
  cd "$REPO_ROOT"
  run node --input-type=module -e "
    import { resolveRoleChain } from './scripts/llm-proxy/bge-routes.mjs';
    const fallbackDoc = {
      roles: {
        embed: { chain: ['http://127.0.0.1:8085', 'http://127.0.0.1:8081'] },
        rerank: { chain: ['loadout:bge-rerank-cpu'] }
      }
    };
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

    // Leere Registry -> Fallback auf doc
    const embedFallback = resolveRoleChain('embed', [], fallbackDoc);
    assert(embedFallback.length === 2, 'fallback embed chain length 2');
    assert(embedFallback[0].baseUrl === 'http://127.0.0.1:8085', 'fallback embed[0]');

    // Registry liefert Kette -> Registry wird bevorzugt
    const regBackends = [
      { name: 'reg-embed', enabled: true, priority: 1, roles: ['embed'], baseUrl: 'http://127.0.0.1:9000' }
    ];
    const embedReg = resolveRoleChain('embed', regBackends, fallbackDoc);
    assert(embedReg.length === 1, 'reg embed chain length 1');
    assert(embedReg[0].baseUrl === 'http://127.0.0.1:9000', 'reg embed[0]');

    console.log('resolveRoleChain fallback OK');
  "
  assert_success
  assert_output --partial "resolveRoleChain fallback OK"
}