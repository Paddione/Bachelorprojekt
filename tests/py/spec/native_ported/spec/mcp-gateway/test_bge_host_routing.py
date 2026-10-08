"""Native migration of tests/spec/mcp-gateway/bge-host-routing.bats."""

import re

import pytest


def test_t900191_llm_services_deployment_pinnt_beide_bge_endpoint_urls_auf_den_pod_lokalen_llm_proxy(
    repo_root, run_cmd
):
    """llm-services-Deployment pinnt beide bge-Endpoint-URLs auf den Pod-lokalen llm-proxy (T900191, Nachfolger von T003205)"""
    result = run_cmd(["bash", str(repo_root / "scripts" / "devmesh" / "render-stack.sh"), "core"])
    if result.returncode != 0:
        pytest.skip("render-stack.sh Vorbedingung fehlt")
    lines = result.stdout.splitlines()

    for var in ("LLM_EMBED_URL", "LLM_RERANKER_URL"):
        # grep -A1 "- name: VAR" | grep 'value:'
        urls = []
        for i, line in enumerate(lines):
            if f"- name: {var}" in line:
                urls.extend(l for l in lines[i : i + 2] if "value:" in l)
        # Positiv-Anker: die Variable existiert im Deployment-Stil.
        assert urls, f"{var} nicht gefunden"
        # Jede Deklaration pinnt 127.0.0.1:18235.
        offenders = [u for u in urls if "127.0.0.1:18235" not in u]
        assert not offenders, offenders


def test_unit_variable_names_match_the_env_keys_the_router_actually_reads(repo_root):
    """unit variable names match the env keys the router actually reads"""
    router = (repo_root / "components" / "website" / "src" / "lib" / "bge-router.ts").read_text(
        encoding="utf-8"
    )
    for var in ("LLM_EMBED_URL", "LLM_RERANKER_URL"):
        count = sum(1 for line in router.splitlines() if re.search(rf"process\.env\.{var}", line))
        assert count >= 1, f"router liest {var} nicht"
