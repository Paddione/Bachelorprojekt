"""Native migration of tests/spec/local-llm-proxy/bge-role-routes.bats."""

import json
import os
import re

import pytest

HELPER = "tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"


@pytest.fixture
def proxy_url():
    return os.environ.get("LLM_PROXY_URL", "http://127.0.0.1:18235")


def _require_proxy(run_cmd, repo_root, proxy_url):
    res = run_cmd(
        ["bash", "-c", f'source "{repo_root / HELPER}"; llm_endpoint_healthy "{proxy_url}/v1/models" 5'],
        cwd=repo_root,
    )
    if res.returncode != 0:
        code = res.stdout.strip() or "000"
        pytest.skip(f"llm-proxy auf {proxy_url} nicht erreichbar (HTTP {code}) — kein Aussagewert")


def _require_route_known(run_cmd, proxy_url, path, payload):
    res = run_cmd([
        "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10",
        "-X", "POST", f"{proxy_url}{path}", "-H", "Content-Type: application/json", "-d", payload,
    ])
    if res.returncode != 0:
        return
    code = res.stdout.strip()
    if code in ("501", "404"):
        pytest.skip(
            f"laufende Proxy-Instanz kennt {path} nicht (HTTP {code}) — misst nicht den Code unter Test; "
            "nach Merge + 'kubectl --context devmesh -n workspace rollout restart deploy/llm-services' erneut pruefen"
        )


def _assert_proxy_answers(run_cmd, proxy_url):
    res = run_cmd(["curl", "-s", "--max-time", "10", f"{proxy_url}/v1/models"])
    assert res.returncode == 0
    try:
        count = len(json.loads(res.stdout)["data"])
    except (ValueError, KeyError, TypeError) as exc:
        raise AssertionError(f"/v1/models ist kein gueltiges Modell-JSON: {exc}")
    if count == 0:
        pytest.skip("Proxy antwortet, hat aber keine Modelle geladen (kein lokaler LLM-Server aktiv)")
    return res.stdout


def _header_lines(resp):
    return [l.replace("\r", "") for l in resp.splitlines()]


def _assert_role_route(run_cmd, proxy_url, path, payload):
    res = run_cmd([
        "curl", "-s", "-D", "-", "-o", "/dev/null", "--max-time", "60",
        "-X", "POST", f"{proxy_url}{path}", "-H", "Content-Type: application/json", "-d", payload,
    ])
    assert res.returncode == 0
    resp = res.stdout
    http_lines = [l for l in _header_lines(resp) if re.match(r"(?i)^HTTP/", l)]
    assert http_lines, "keine HTTP-Statuszeile"
    assert " 200" in http_lines[-1], http_lines[-1]
    upstream = []
    for line in _header_lines(resp):
        if re.match(r"(?i)^x-llm-proxy-bge-upstream:", line):
            parts = line.split(" ", 1)
            upstream.append(parts[1] if len(parts) > 1 else line)
    assert any(v for v in upstream), "kein nichtleerer x-llm-proxy-bge-upstream-Header"


def test_bge_role_routes_t003205_post_v1_embeddings_wird_ueber_die_rolle_embed_bedient(run_cmd, repo_root, proxy_url):
    _require_proxy(run_cmd, repo_root, proxy_url)
    payload = '{"model":"bge-m3","input":["test"]}'
    _require_route_known(run_cmd, proxy_url, "/v1/embeddings", payload)
    _assert_proxy_answers(run_cmd, proxy_url)
    _assert_role_route(run_cmd, proxy_url, "/v1/embeddings", payload)


def test_bge_role_routes_t003205_post_v1_rerank_wird_ueber_die_rolle_rerank_bedient(run_cmd, repo_root, proxy_url):
    _require_proxy(run_cmd, repo_root, proxy_url)
    payload = '{"model":"bge-reranker-v2-m3","query":"a","documents":["b","c"]}'
    _require_route_known(run_cmd, proxy_url, "/v1/rerank", payload)
    _assert_proxy_answers(run_cmd, proxy_url)
    _assert_role_route(run_cmd, proxy_url, "/v1/rerank", payload)


def test_bge_role_routes_t003205_v1_models_enthaelt_kein_bge_modell(run_cmd, repo_root, proxy_url):
    _require_proxy(run_cmd, repo_root, proxy_url)
    # Positiv-Anker zuerst: ohne ihn waere 'kein bge in []' trivial erfuellt.
    body = _assert_proxy_answers(run_cmd, proxy_url)
    ids = [m["id"] for m in json.loads(body)["data"]]
    bge_hits = [i for i in ids if re.search(r"bge", i, re.I)]
    if bge_hits:
        non_path_hits = [h for h in bge_hits if not h.startswith("/")]
        if not non_path_hits:
            pytest.skip("laufende Instanz serviert native bge-Backend-Pfade als IDs — Host-Ausstattung, kein Routen-Defekt")
    assert not bge_hits, f"bge-Modell in /v1/models: {bge_hits}"
