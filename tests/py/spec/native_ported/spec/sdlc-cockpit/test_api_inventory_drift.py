"""Native migration of tests/spec/sdlc-cockpit/api-inventory-drift.bats."""
# Port note: the BATS original regenerates the tracked file components/website/src/data/api-inventory.json
# in place. The port writes every regeneration to tmp_path (API_INVENTORY_OUT) and compares the
# result against the tracked file read-only, so no tracked repo file is mutated.

import filecmp
import json
import re
from pathlib import Path

import pytest

SCANNER = "scripts/sdlc/api-inventory.mjs"
INVENTORY = "components/website/src/data/api-inventory.json"


@pytest.fixture(autouse=True)
def _node_required():
    import shutil
    if not shutil.which("node"):
        pytest.skip("node not installed")


def _scan(repo_root, run_cmd, out, extra_env=None, timeout=120):
    env = {"API_INVENTORY_OUT": str(out)}
    if extra_env:
        env.update(extra_env)
    return run_cmd(["node", SCANNER], cwd=repo_root, env=env, timeout=timeout)


def _registry_count(repo_root):
    registry = (repo_root / "docs/agent-guide/registry/mcp.yaml").read_text(encoding="utf-8")
    in_clients = False
    count = 0
    for line in registry.splitlines():
        if re.match(r"^clients:", line):
            in_clients = True
            continue
        if in_clients and re.match(r"^[a-z]", line):
            break
        if in_clients and re.match(r"^  [a-zA-Z0-9_-]+:$", line):
            count += 1
    return count


def test_api_inventory_two_runs_are_byte_identical(repo_root, run_cmd, tmp_path):
    out1 = tmp_path / "a.json"
    out2 = tmp_path / "b.json"
    result = _scan(repo_root, run_cmd, out1)
    assert result.returncode == 0, result.output
    result = _scan(repo_root, run_cmd, out2)
    assert result.returncode == 0, result.output
    # Positiv-Anker: es wurde tatsaechlich etwas gescannt.
    assert len(json.loads(out1.read_text(encoding="utf-8"))["routes"]) > 0
    assert filecmp.cmp(out1, out2, shallow=False)


def test_api_inventory_core_fields_present_mcp_count_matches_registry_factory_tools_empty(repo_root, run_cmd, tmp_path):
    out = tmp_path / "inv.json"
    result = _scan(repo_root, run_cmd, out)
    assert result.returncode == 0, result.output
    data = json.loads(out.read_text(encoding="utf-8"))

    assert all(all(k in r for k in ("path", "methods", "backend")) for r in data["routes"])
    assert all(len(r["methods"]) > 0 for r in data["routes"])
    assert len(data["mcpServers"]) == _registry_count(repo_root)
    assert len(data["factoryTools"]) == 0


def test_api_inventory_routes_sorted_no_timestamp_keys(repo_root, run_cmd, tmp_path):
    out = tmp_path / "inv.json"
    result = _scan(repo_root, run_cmd, out)
    assert result.returncode == 0, result.output
    text = out.read_text(encoding="utf-8")
    data = json.loads(text)  # Positiv-Anker: gueltiges, nicht-leeres JSON
    paths = [r["path"] for r in data["routes"]]
    assert paths == sorted(paths)
    assert re.search(r'"(generatedAt|timestamp|date)"', text, re.IGNORECASE) is None


def test_api_inventory_drift_fails_the_gate_and_generator_is_wired_into_freshness(repo_root, run_cmd, tmp_path):
    committed = repo_root / INVENTORY

    # Positiv-Anker: frisch regeneriert == committeter Stand (kein falsches Drift-Signal).
    regen = tmp_path / "regen.json"
    result = _scan(repo_root, run_cmd, regen)
    assert result.returncode == 0, result.output
    assert filecmp.cmp(regen, committed, shallow=False)
    assert run_cmd(["git", "diff", "--quiet", "--", INVENTORY], cwd=repo_root).returncode == 0

    # Drift simulieren: eine neue Route, die der committete Stand nicht kennt.
    routes = tmp_path / "routes"
    (routes / "__drift__").mkdir(parents=True)
    (routes / "__drift__/extra.ts").write_text(
        "export const GET: APIRoute = () => new Response('drift fixture');\n", encoding="utf-8"
    )
    overlay = tmp_path / "routes-overlay.yaml"
    overlay.write_text(
        "entries:\n"
        "  - endpoint: /sdlc/api/__drift__/extra\n"
        '    description: "Drift fixture"\n'
        "    tier: internal\n",
        encoding="utf-8",
    )
    drift_out = tmp_path / "drift.json"
    result = _scan(repo_root, run_cmd, drift_out, extra_env={
        "API_INVENTORY_ROUTES_DIR": str(routes),
        "API_OVERLAY_PATH": str(overlay),
    })
    assert result.returncode == 0, result.output
    assert not filecmp.cmp(drift_out, committed, shallow=False)  # Abweichung erkannt

    # Verdrahtung: freshness:regenerate fuehrt den Generator aus.
    taskfile = (repo_root / "taskfiles/Taskfile.quality.yml").read_text(encoding="utf-8").splitlines()
    block = []
    in_block = False
    for line in taskfile:
        if line == "  freshness:regenerate:":
            in_block = True
            continue
        if in_block and re.match(r"^  [a-z][a-zA-Z0-9:_-]*:$", line):
            break
        if in_block:
            block.append(line)
    assert any("- task: api:inventory" in line for line in block)


def test_api_inventory_orphaned_overlay_entry_fails_and_names_the_endpoint(repo_root, run_cmd, tmp_path):
    valid = tmp_path / "valid-overlay.yaml"
    invalid = tmp_path / "invalid-overlay.yaml"
    valid.write_text(
        "entries:\n"
        "  - endpoint: /sdlc/api/qa-queue\n"
        '    description: "Testfixture"\n'
        "    tier: internal\n",
        encoding="utf-8",
    )
    invalid.write_text(
        "entries:\n"
        "  - endpoint: /sdlc/api/qa-queue\n"
        '    description: "Testfixture"\n'
        "    tier: internal\n"
        "  - endpoint: /sdlc/api/does-not-exist-xyz\n"
        '    description: "Verwaister Eintrag"\n'
        "    tier: internal\n",
        encoding="utf-8",
    )
    # Positiv-Anker: gueltiges Overlay laeuft durch.
    result = _scan(repo_root, run_cmd, tmp_path / "ok.json", extra_env={"API_OVERLAY_PATH": str(valid)})
    assert result.returncode == 0, result.output
    # Negativ: verwaister Eintrag laesst die Generierung fehlschlagen und wird benannt.
    result = _scan(repo_root, run_cmd, tmp_path / "bad.json", extra_env={"API_OVERLAY_PATH": str(invalid)})
    assert result.returncode != 0
    assert "does-not-exist-xyz" in result.output
