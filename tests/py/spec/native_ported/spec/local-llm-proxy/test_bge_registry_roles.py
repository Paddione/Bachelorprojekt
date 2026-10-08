"""Native migration of tests/spec/local-llm-proxy/bge-registry-roles.bats."""

REGISTRY_JS = """
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
    assert(rerank[2].kind === 'url' && rerank[2].baseUrl === 'http://127.0.0.1:18235', 'rerank[2] priority 30');

    console.log('registry roles OK');
"""

FALLBACK_JS = """
    import { resolveRoleChain } from './scripts/llm-proxy/bge-routes.mjs';
    const fallbackDoc = {
      roles: {
        embed: { chain: ['http://127.0.0.1:8085', 'http://127.0.0.1:8081'] },
        rerank: { chain: ['http://127.0.0.1:8081'] }
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
"""


def _node(run_cmd, repo_root, js):
    return run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)


def test_bge_registry_roles_rolesfromregistry_sortiert_nach_priority_und_filtert_disabled(run_cmd, repo_root):
    res = _node(run_cmd, repo_root, REGISTRY_JS)
    assert res.returncode == 0, res.output
    assert "registry roles OK" in res.output


def test_bge_registry_roles_resolverolechain_faellt_auf_loadouts_json_zurueck_bei_leerer_registry(run_cmd, repo_root):
    res = _node(run_cmd, repo_root, FALLBACK_JS)
    assert res.returncode == 0, res.output
    assert "resolveRoleChain fallback OK" in res.output
