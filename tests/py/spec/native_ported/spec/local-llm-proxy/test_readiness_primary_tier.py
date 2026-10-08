"""Native migration of tests/spec/local-llm-proxy/readiness-primary-tier.bats."""

# [T900212]

import json
import shutil

import pytest

READINESS_JS = """
    const mod = await import('REPO/scripts/llm-proxy/discovery.mjs');
    const list = JSON.parse(process.env.BACKENDS);
    mod._testSeed({ backends: list.map((b) => ({ name: b.name, priority: b.priority, healthy: b.healthy, models: [] })) });
    const backends = list.map((b) => ({ name: b.name, priority: b.priority, kind: b.kind, baseUrl: 'http://192.0.2.1:' + (8000 + b.priority) + '/v1' }));
    const r = mod.evaluateReadiness(() => backends);
    console.log(JSON.stringify({ ready: r.ready, degraded: r.degraded.map((d) => d.name) }));
"""


def _readiness(run_cmd, repo_root, backends):
    return run_cmd(
        ["node", "--input-type=module", "-e", READINESS_JS.replace("REPO", str(repo_root))],
        cwd=repo_root, env={"BACKENDS": json.dumps(backends)},
    )


@pytest.fixture(autouse=True)
def _need_node():
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")


def test_readiness_primary_tier_gesundes_priority_0_backend_macht_den_proxy_ready(run_cmd, repo_root):
    res = _readiness(run_cmd, repo_root, [
        {"name": "freetoken-local", "priority": 0, "kind": "openai", "healthy": True},
        {"name": "cluster-rerank", "priority": 10, "kind": "tei", "healthy": True},
    ])
    assert res.returncode == 0, res.output
    assert res.output == '{"ready":true,"degraded":[]}'


def test_readiness_primary_tier_totes_priority_0_backend_mit_lebendem_cloud_fallback_bleibt_not_ready(run_cmd, repo_root):
    res = _readiness(run_cmd, repo_root, [
        {"name": "freetoken-local", "priority": 0, "kind": "openai", "healthy": False},
        {"name": "deepseek", "priority": 2, "kind": "openai-remote", "healthy": True},
    ])
    assert res.returncode == 0, res.output
    assert res.output == '{"ready":false,"degraded":["freetoken-local"]}'


def test_readiness_primary_tier_ohne_backend_mit_priority_1_bleibt_der_proxy_not_ready(run_cmd, repo_root):
    res = _readiness(run_cmd, repo_root, [
        {"name": "deepseek", "priority": 2, "kind": "openai-remote", "healthy": True},
        {"name": "cluster-embed", "priority": 10, "kind": "tei", "healthy": True},
    ])
    assert res.returncode == 0, res.output
    assert res.output == '{"ready":false,"degraded":[]}'
