"""Neue Topologie: getrennte Retrieval-Ketten je Vektorraum.

Registry (LLM_PROXY_BACKENDS_JSON) und E3-Rueckfall (loadouts.json, roles-Block)
fuehren drei Rollen: embed (Tablet vor Cluster), rerank und lfm-embed (je nur
Cluster). Tablet-Rerank und ColBERT-Rollen entfernt 2026-10-26. Kein
Desktop-Loopback, kein lmstudio-Glied (entfernt in 5fe38fbbb).
"""

CHAINS_JS = """
    import { readFileSync } from 'node:fs';
    import { loadRoles } from './scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('./scripts/llm/loadouts.json', 'utf8'));
    const roles = loadRoles(doc);
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(roles.size === 3, 'es muessen genau 3 Rollen sein, gefunden: ' + roles.size);
    const urls = (name) => roles.get(name).map((e) => e.kind + ' ' + e.baseUrl);
    assert(JSON.stringify(urls('embed')) === JSON.stringify([
      'url http://llm-gateway-tablet:8081',
      'url http://llm-gateway-embed.workspace.svc.cluster.local:8081',
    ]), 'embed muss Tablet vor Cluster fuehren, gefunden: ' + JSON.stringify(urls('embed')));
    assert(JSON.stringify(urls('rerank')) === JSON.stringify([
      'url http://llm-gateway-rerank.workspace.svc.cluster.local:8081',
    ]), 'rerank nur Cluster, gefunden: ' + JSON.stringify(urls('rerank')));
    assert(JSON.stringify(urls('lfm-embed')) === JSON.stringify([
      'url http://llm-gateway-lfm-embed.workspace.svc.cluster.local:8081',
    ]), 'lfm-embed-Kette falsch: ' + JSON.stringify(urls('lfm-embed')));
    const all = [...roles.values()].flat().map((e) => e.baseUrl);
    assert(!all.some((u) => u.includes('127.0.0.1') || u.includes('1234')),
      'kein Desktop-Loopback und kein lmstudio in einer Kette: ' + JSON.stringify(all));
    assert(new Set(all).size === all.length, 'kein Glied in zwei Ketten (kein Quer-Fallback)');
    console.log('retrieval chains OK');
"""


def test_bge_chain_order_drei_getrennte_ketten(run_cmd, repo_root):
    res = run_cmd(["node", "--input-type=module", "-e", CHAINS_JS], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "retrieval chains OK" in res.output

