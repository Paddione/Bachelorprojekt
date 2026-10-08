"""Native migration of tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats."""

# [T002558/T900208]

import json
import re

import pytest

LLAMA_PORT = 8091
PROXY_PORT = 18235


def test_opencode_routes_via_proxy_t002558_die_llamacpp_provider_zeigen_auf_den_proxy_nicht_auf_den_server(repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    assert agents.is_file()
    text = agents.read_text(encoding="utf-8")
    assert sum(1 for l in text.splitlines() if '"baseURL"' in l) > 0
    rx = re.compile(
        r'"(llamacpp[^"]*)"\s*:\s*\{.*?"baseURL"\s*:\s*"[^"]*:' + str(LLAMA_PORT) + r'[^"]*"', re.S
    )
    assert len(rx.findall(text)) == 0


def test_opencode_routes_via_proxy_t900208_der_lokale_provider_zeigt_auf_freetoken_keiner_auf_den_stillgelegten_proxy_port(repo_root):
    text = (repo_root / ".opencode/agent-models.jsonc").read_text(encoding="utf-8")
    assert sum(1 for l in text.splitlines() if ":1919/v1" in l) > 0
    assert sum(1 for l in text.splitlines() if f":{PROXY_PORT}/v1" in l) == 0


def test_opencode_routes_via_proxy_t002558_die_deklarierte_kontextzahl_stimmt_mit_dem_laufenden_server_ueberein(run_cmd, repo_root):
    probe = run_cmd(["curl", "-s", "-m", "3", f"http://127.0.0.1:{LLAMA_PORT}/props"], cwd=repo_root)
    if probe.returncode != 0:
        pytest.skip(f"kein llama-server auf :{LLAMA_PORT}")

    live_res = run_cmd(["curl", "-s", "-m", "5", f"http://127.0.0.1:{LLAMA_PORT}/props"], cwd=repo_root)
    try:
        live = str(json.loads(live_res.stdout)["default_generation_settings"]["n_ctx"])
    except (ValueError, KeyError, TypeError):
        live = "null"
    assert live, "live n_ctx leer"
    assert live != "null"

    text = (repo_root / ".opencode/agent-models.jsonc").read_text(encoding="utf-8")
    m = re.search(r'"gemma26-factory"\s*:\s*\{.*?"context"\s*:\s*(\d+)', text, re.S)
    declared = m.group(1) if m else "NONE"
    assert declared != "NONE"
    lo = int(int(live) * 0.8)
    hi = int(int(live) * 1.2)
    assert lo <= int(declared) <= hi
