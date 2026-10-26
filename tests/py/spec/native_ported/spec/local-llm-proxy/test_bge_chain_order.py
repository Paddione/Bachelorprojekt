"""Neue Topologie: getrennte Retrieval-Ketten je Vektorraum.

Registry (LLM_PROXY_BACKENDS_JSON) und E3-Rueckfall (loadouts.json, roles-Block)
fuehren fuenf Rollen: embed/rerank (Tablet vor Cluster) sowie lfm-embed,
colbert-embed und colbert-rerank (je nur Cluster). Kein Desktop-Loopback,
kein lmstudio-Glied (entfernt in 5fe38fbbb).
"""

from pathlib import Path

import pytest

HELPER = "tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"

CHAINS_JS = """
    import { readFileSync } from 'node:fs';
    import { loadRoles } from './scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('./scripts/llm/loadouts.json', 'utf8'));
    const roles = loadRoles(doc);
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(roles.size === 5, 'es muessen genau 5 Rollen sein, gefunden: ' + roles.size);
    const urls = (name) => roles.get(name).map((e) => e.kind + ' ' + e.baseUrl);
    assert(JSON.stringify(urls('embed')) === JSON.stringify([
      'url http://llm-gateway-tablet:8081',
      'url http://llm-gateway-embed.workspace.svc.cluster.local:8081',
    ]), 'embed muss Tablet vor Cluster fuehren, gefunden: ' + JSON.stringify(urls('embed')));
    assert(JSON.stringify(urls('rerank')) === JSON.stringify([
      'url http://llm-gateway-tablet:8080',
      'url http://llm-gateway-rerank.workspace.svc.cluster.local:8081',
    ]), 'rerank muss Tablet vor Cluster fuehren, gefunden: ' + JSON.stringify(urls('rerank')));
    assert(JSON.stringify(urls('lfm-embed')) === JSON.stringify([
      'url http://llm-gateway-lfm-embed.workspace.svc.cluster.local:8081',
    ]), 'lfm-embed-Kette falsch: ' + JSON.stringify(urls('lfm-embed')));
    assert(JSON.stringify(urls('colbert-embed')) === JSON.stringify([
      'url http://llm-gateway-lfm-colbert.workspace.svc.cluster.local:8081',
    ]), 'colbert-embed-Kette falsch: ' + JSON.stringify(urls('colbert-embed')));
    assert(JSON.stringify(urls('colbert-rerank')) === JSON.stringify([
      'url http://llm-gateway-colbert-maxsim.workspace.svc.cluster.local:8081',
    ]), 'colbert-rerank-Kette falsch: ' + JSON.stringify(urls('colbert-rerank')));
    const all = [...roles.values()].flat().map((e) => e.baseUrl);
    assert(!all.some((u) => u.includes('127.0.0.1') || u.includes('1234')),
      'kein Desktop-Loopback und kein lmstudio in einer Kette: ' + JSON.stringify(all));
    assert(new Set(all).size === all.length, 'kein Glied in zwei Ketten (kein Quer-Fallback)');
    console.log('retrieval chains OK');
"""


def test_bge_chain_order_fuenf_getrennte_ketten_tablet_vor_cluster(run_cmd, repo_root):
    res = run_cmd(["node", "--input-type=module", "-e", CHAINS_JS], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "retrieval chains OK" in res.output


def test_bge_chain_order_tablet_rerank_endpoint_live_erreichbar_skip_wenn_offline(run_cmd, repo_root):
    res = run_cmd(
        ["bash", "-c", f'source "{repo_root / HELPER}"; llm_endpoint_healthy "http://100.94.91.65:8080/health" 5'],
        cwd=repo_root,
    )
    if res.returncode != 0:
        code = res.stdout.strip() or "000"
        pytest.skip(f"PK-Tablet nicht erreichbar (HTTP {code}) — kein Aussagewert")
    assert res.stdout.strip() == "200"
