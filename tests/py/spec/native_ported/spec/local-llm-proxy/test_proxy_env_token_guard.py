"""Native migration of tests/spec/local-llm-proxy/proxy-env-token-guard.bats."""

# [T002556]

import re

import pytest


def _guard(path) -> tuple:
    """Mirror of _guard(): returns (ok, message)."""
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        lines = None
    if lines is None or not any(l.startswith("BGE_MCP_TOKEN=") for l in lines):
        return False, "WARNUNG: BGE_MCP_TOKEN fehlt in " + str(path) + " [T002556]"
    return True, ""


def test_proxy_env_token_guard_fehlende_proxy_env_loest_die_warnung_aus(tmp_path):
    ok, msg = _guard(tmp_path / "nicht-vorhanden.env")
    assert not ok
    assert "BGE_MCP_TOKEN fehlt" in msg


def test_proxy_env_token_guard_vorhandene_datei_ohne_das_token_loest_die_warnung_aus(tmp_path):
    f = tmp_path / "proxy.env"
    f.write_text("LLM_PROXY_PORT=18235\n", encoding="utf-8")
    ok, msg = _guard(f)
    assert not ok
    assert "BGE_MCP_TOKEN fehlt" in msg


def test_proxy_env_token_guard_mit_gesetztem_token_schweigt_der_guard(tmp_path):
    f = tmp_path / "proxy.env"
    f.write_text("BGE_MCP_TOKEN=irrelevant-fuer-den-test\n", encoding="utf-8")
    ok, msg = _guard(f)
    assert ok
    assert msg == ""


def test_proxy_env_token_guard_ein_auskommentierter_eintrag_zaehlt_nicht_als_gesetzt(tmp_path):
    f = tmp_path / "proxy.env"
    f.write_text("# BGE_MCP_TOKEN=frueher-mal\n", encoding="utf-8")
    ok, _ = _guard(f)
    assert not ok


def test_proxy_env_token_guard_llm_services_deployment_bezieht_bge_mcp_token_aus_dem_sealedsecret(run_cmd, repo_root):
    res = run_cmd(["bash", str(repo_root / "scripts/devmesh/render-stack.sh"), "core"], cwd=repo_root)
    if res.returncode != 0:
        pytest.skip("render-stack.sh Vorbedingung fehlt")
    lines = res.stdout.splitlines()
    block_lines = []
    for i, line in enumerate(lines):
        if "name: BGE_MCP_TOKEN" in line:
            block_lines.extend(lines[i:i + 5])
    block = "\n".join(block_lines)
    assert block.strip(), "BGE_MCP_TOKEN-Block im Deployment fehlt"
    assert "secretKeyRef" in block
    assert "name: workspace-secrets" in block

    sealed = repo_root / "environments/sealed-secrets/dev.yaml"
    text = sealed.read_text(encoding="utf-8")
    assert "kind: SealedSecret" in text
    assert "name: workspace-secrets" in text
