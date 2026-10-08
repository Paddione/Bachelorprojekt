"""Native migration of tests/unit/api-auth-gate.bats."""
import json
from pathlib import Path

import pytest

GATE_SCRIPT = "scripts/api-auth-check.mjs"


@pytest.fixture
def gate_files(tmp_path):
    return {"map": tmp_path / "api-map.json", "allowlist": tmp_path / "allowlist.json", "tmp": tmp_path}


@pytest.fixture
def run_gate(run_cmd, repo_root, gate_files):
    """Emulate run_gate: node scripts/api-auth-check.mjs "$@" with the fixture paths."""

    def _run(*args):
        env = {
            "API_MAP_PATH": str(gate_files["map"]),
            "ALLOWLIST_PATH": str(gate_files["allowlist"]),
        }
        return run_cmd(["node", str(repo_root / GATE_SCRIPT), *args], cwd=repo_root, env=env, timeout=300)

    return _run


def _write(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _ep(path, methods, auth, file):
    return {"path": path, "methods": methods, "auth": auth, "file": file}


def test_clean_map_complete_allowlist_exit_0(run_gate, gate_files):
    _write(gate_files["map"], {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [
            _ep("/api/health", ["GET"], "unclassified", "health.ts"),
            _ep("/api/admin/foo", ["POST"], "admin", "admin/foo.ts"),
        ],
    })
    _write(gate_files["allowlist"], [{"path": "/api/health", "methods": ["GET"], "reason": "health check"}])
    res = run_gate()
    assert res.returncode == 0, res.output


def test_unclassified_endpoint_without_allowlist_exit_1(run_gate, gate_files):
    _write(gate_files["map"], {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [_ep("/api/mystery", ["GET"], "unclassified", "mystery.ts")],
    })
    _write(gate_files["allowlist"], [])
    res = run_gate()
    assert res.returncode != 0, res.output
    assert "unclassified" in res.output


def test_unclassified_endpoint_without_allowlist_entry_exit_1(run_gate, gate_files):
    _write(gate_files["map"], {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [_ep("/api/public-form", ["POST"], "unclassified", "public-form.ts")],
    })
    _write(gate_files["allowlist"], [])
    res = run_gate()
    assert res.returncode != 0, res.output


def test_admin_session_internal_cron_pass_without_allowlist(run_gate, gate_files):
    _write(gate_files["map"], {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [
            _ep("/api/a", ["GET"], "admin", "a.ts"),
            _ep("/api/b", ["GET"], "session", "b.ts"),
            _ep("/api/c", ["GET"], "internal", "c.ts"),
            _ep("/api/d", ["GET"], "cron", "d.ts"),
        ],
    })
    _write(gate_files["allowlist"], [])
    res = run_gate()
    assert res.returncode == 0, res.output


def test_regression_session_to_unclassified_without_allowlist_exit_1(run_gate, gate_files):
    _write(gate_files["map"], {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [_ep("/api/protected", ["GET"], "unclassified", "protected.ts")],
    })
    _write(gate_files["allowlist"], [])
    main_map = gate_files["tmp"] / "main-map.json"
    _write(main_map, {
        "generatedAt": "2026-06-12T00:00:00.000Z",
        "endpoints": [_ep("/api/protected", ["GET"], "session", "protected.ts")],
    })
    res = run_gate("--regression", "--main-map", str(main_map))
    assert res.returncode != 0, res.output
    assert "regression" in res.output
