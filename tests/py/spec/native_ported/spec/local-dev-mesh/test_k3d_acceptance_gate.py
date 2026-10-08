"""Native migration of tests/spec/local-dev-mesh/k3d-acceptance-gate.bats."""

import os
from pathlib import Path

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
case "$*" in *pg_dump*) printf "%s" "${DUMP_CONTENT:-}" ;; esac
exit 0
"""

SSH_STUB = """#!/usr/bin/env bash
echo "$*" >> "$SSH_LOG"
exit 0
"""


@pytest.fixture
def gate(repo_root, tmp_path, monkeypatch):
    stub = tmp_path / "bin"
    stub.mkdir()
    ssh_log = tmp_path / "ssh.log"
    ssh_log.write_text("")
    for name, body in (("kubectl", KUBECTL_STUB), ("ssh", SSH_STUB)):
        f = stub / name
        f.write_text(body)
        f.chmod(0o755)
    backups = tmp_path / "backups"
    monkeypatch.setenv("PATH", f"{stub}:{os.environ.get('PATH', '')}")
    monkeypatch.setenv("SSH_LOG", str(ssh_log))
    monkeypatch.setenv("DEVMESH_BACKUP_ROOT", str(backups))
    monkeypatch.setenv("DEVMESH_HEALTH_CMD", "true")
    monkeypatch.setenv("DEVMESH_COMPARE_CMD", "true")
    return {
        "accept": repo_root / "scripts" / "devmesh" / "acceptance.sh",
        "teardown": repo_root / "scripts" / "devmesh" / "k3d-teardown.sh",
        "backups": backups,
        "ssh_log": ssh_log,
    }


def _find_marker(root: Path):
    if not root.exists():
        return []
    return [p for p in root.rglob("ACCEPTANCE_OK")]


def test_acceptance_passes_with_health_comparison_and_a_non_empty_dump_positive_anchor(gate, run_cmd):
    res = run_cmd(["bash", str(gate["accept"])], env={"DUMP_CONTENT": "PGDMP"})
    assert res.returncode == 0, res.output
    assert _find_marker(gate["backups"])


def test_acceptance_fails_on_an_empty_dump_and_writes_no_marker(gate, run_cmd):
    res = run_cmd(["bash", str(gate["accept"])], env={"DUMP_CONTENT": ""})
    assert res.returncode != 0
    assert not _find_marker(gate["backups"])


def test_acceptance_fails_when_the_migration_comparison_fails(gate, run_cmd):
    res = run_cmd(["bash", str(gate["accept"])],
                  env={"DUMP_CONTENT": "PGDMP", "DEVMESH_COMPARE_CMD": "false"})
    assert res.returncode != 0


def test_teardown_after_a_passed_gate_deletes_the_cluster_positive_anchor(gate, run_cmd):
    res = run_cmd(["bash", str(gate["teardown"])], env={"DUMP_CONTENT": "PGDMP"})
    assert res.returncode == 0, res.output
    assert "k3d cluster delete mentolder-dev" in gate["ssh_log"].read_text()


def test_teardown_without_a_fresh_dump_is_refused_and_deletes_nothing(gate, run_cmd):
    res = run_cmd(["bash", str(gate["teardown"])], env={"DUMP_CONTENT": ""})
    assert res.returncode != 0
    assert "cluster delete" not in gate["ssh_log"].read_text()
