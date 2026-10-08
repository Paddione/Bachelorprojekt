"""Native migration of tests/spec/local-llm-proxy/bge-chain-order.bats."""

from pathlib import Path

import pytest

HELPER = "tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"

EMBED_JS = """
    import { readFileSync } from 'node:fs';
    import { loadRoles } from './scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('./scripts/llm/loadouts.json', 'utf8'));
    const embed = loadRoles(doc).get('embed');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(embed.length === 3, 'embed chain must have exactly 3 entries');
    assert(embed[0].kind === 'url' && embed[0].baseUrl === 'http://127.0.0.1:8085', 'embed[0] must be desktop :8085');
    assert(embed[1].kind === 'url' && embed[1].baseUrl === 'http://127.0.0.1:8081', 'embed[1] must be cluster :8081');
    assert(embed[2].kind === 'url' && embed[2].baseUrl === 'http://127.0.0.1:1234', 'embed[2] must be LM Studio :1234');
    console.log('embed chain OK');
"""

RERANK_JS = """
    import { readFileSync } from 'node:fs';
    import { loadRoles } from './scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('./scripts/llm/loadouts.json', 'utf8'));
    const rerank = loadRoles(doc).get('rerank');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(rerank.length === 3, 'rerank chain must have exactly 3 entries');
    assert(rerank[0].kind === 'url' && rerank[0].baseUrl === 'http://127.0.0.1:8085', 'rerank[0] must be desktop :8085');
    assert(rerank[1].kind === 'url' && rerank[1].baseUrl === 'http://127.0.0.1:8093', 'rerank[1] must be cluster :8093');
    assert(rerank[2].kind === 'url' && rerank[2].baseUrl === 'http://192.168.100.12:8080', 'rerank[2] must be tablet 192.168.100.12:8080');
    console.log('rerank chain OK');
"""


def test_bge_chain_order_t006143_t900006_embed_kette_fuehrt_desktop_vor_cluster_vor_lm_studio(run_cmd, repo_root):
    res = run_cmd(["node", "--input-type=module", "-e", EMBED_JS], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "embed chain OK" in res.output


def test_bge_chain_order_t006143_tablet_rerank_endpoint_live_erreichbar_skip_wenn_offline(run_cmd, repo_root):
    res = run_cmd(
        ["bash", "-c", f'source "{repo_root / HELPER}"; llm_endpoint_healthy "http://192.168.100.12:8080/health" 5'],
        cwd=repo_root,
    )
    if res.returncode != 0:
        code = res.stdout.strip() or "000"
        pytest.skip(f"PK-Tablet nicht erreichbar (HTTP {code}) — kein Aussagewert")
    assert res.stdout.strip() == "200"


def test_bge_chain_order_t006143_t900006_rerank_kette_fuehrt_desktop_vor_cluster_vor_tablet(run_cmd, repo_root):
    res = run_cmd(["node", "--input-type=module", "-e", RERANK_JS], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "rerank chain OK" in res.output
