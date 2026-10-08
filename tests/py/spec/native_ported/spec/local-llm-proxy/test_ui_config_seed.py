"""Native migration of tests/spec/local-llm-proxy/ui-config-seed.bats."""

# [T002544]

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

PICK_SMALL_MODEL_SH = "tests/spec/local-llm-proxy/lib/pick-small-model.sh"


def _jq_r(value):
    """jq -r for a scalar prints the raw string; containers print pretty JSON."""
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value, indent=2)


def _size_bytes(path: Path) -> int:
    return path.stat().st_size


def test_ui_config_seed_task_8_llama_server_liefert_ui_settings_mcpservers_aus_seed(run_cmd, repo_root, tmp_path):
    seed_path = tmp_path / "ui-config.json"
    port = 8199

    seed = run_cmd(
        ["node", str(repo_root / "scripts/llm/ui-config-seed.mjs"), "--output", str(seed_path)],
        cwd=repo_root,
        env={"BGE_MCP_TOKEN": "test-token", "MCP_POSTGRES_TOKEN": "test-token", "MCP_KUBERNETES_TOKEN": "test-token"},
    )
    assert seed.returncode == 0, seed.output
    assert seed_path.is_file()

    seed_doc = json.loads(seed_path.read_text(encoding="utf-8"))
    expected_mcp_servers = _jq_r(seed_doc.get("mcpServers"))

    bin_path = Path.home() / "opt/llama-current/bin/llama-server"
    if not os.access(bin_path, os.X_OK):
        found = shutil.which("llama-server")
        bin_path = Path(found) if found else None
    if bin_path is None or not os.access(bin_path, os.X_OK):
        pytest.skip("llama-server binary not found at ~/opt/llama-current/bin/llama-server or PATH")

    helper = repo_root / PICK_SMALL_MODEL_SH
    pick = run_cmd(
        ["bash", "-c", f"source '{helper}' && pick_small_test_model '{os.path.expanduser('~/models/gguf')}' "
                       "'/mnt/c/Users/PatrickKorczewski/.lmstudio/models'"],
        cwd=repo_root,
    )
    model_file = pick.stdout.strip()
    if pick.returncode != 0 or not model_file:
        pytest.skip("No GGUF model file found to launch short-lived llama-server")

    server = subprocess.Popen(
        [str(bin_path), "-m", model_file, "--port", str(port), "--host", "127.0.0.1", "-ngl", "0", "-c", "512",
         "--ui-config-file", str(seed_path)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        size_mib = (_size_bytes(Path(model_file)) + 1048575) // 1048576
        loops = min(80 + size_mib // 100, 480)
        healthy = False
        for _ in range(loops):
            res = run_cmd(["curl", "-sf", f"http://127.0.0.1:{port}/health"], cwd=repo_root)
            if res.returncode == 0:
                healthy = True
                break
            time.sleep(0.25)
        if not healthy:
            pytest.fail("llama-server failed to start")

        props = run_cmd(["curl", "-sf", f"http://127.0.0.1:{port}/props"], cwd=repo_root)
        props_out = props.stdout
        props_status = props.returncode
    finally:
        server.kill()
        server.wait(timeout=10)

    assert props_status == 0
    props_doc = json.loads(props_out)
    mcp_val = _jq_r((props_doc.get("ui_settings") or {}).get("mcpServers")) if (props_doc.get("ui_settings") or {}).get("mcpServers") else ""
    if not mcp_val:
        pytest.skip("llama-server wendet --ui-config-file nicht in ui_settings an (Build ohne ui-config-Support; Umgebung, T900537)")

    check_js = (
        "const raw = process.argv[1];\n"
        "const parsed = JSON.parse(raw);\n"
        "if (!Array.isArray(parsed)) process.exit(1);\n"
        "const k8s = parsed.find(s => s.name === 'k8s');\n"
        "if (!k8s || k8s.url !== 'http://localhost:18082/mcp') process.exit(3);\n"
        "const bge = parsed.find(s => s.name === 'bge-mcp');\n"
        "if (!bge || bge.headers?.Authorization !== 'Bearer test-token') process.exit(4);\n"
        "const pg = parsed.find(s => s.name === 'mcp-postgres');\n"
        "if (!pg || pg.url !== 'http://localhost:13001/mcp') process.exit(6);\n"
    )
    check = run_cmd(["node", "-e", check_js, mcp_val], cwd=repo_root)
    assert check.returncode == 0, f"node check exit {check.returncode}"

    actual_res = run_cmd(
        ["node", "-e", "const p=JSON.parse(process.argv[1]);process.stdout.write(typeof p===\"string\"?p:JSON.stringify(p))",
         mcp_val],
        cwd=repo_root,
    )
    actual = actual_res.stdout
    if actual != expected_mcp_servers:
        print(f"seed : {expected_mcp_servers}")
        print(f"props: {actual}")
        pytest.fail("mcpServers seed/props mismatch")

    assert _jq_r(props_doc.get("cors_proxy_enabled")) == "false"
