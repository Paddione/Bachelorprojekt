"""Native migration of tests/unit/backup-restore-filen-pull.bats."""
import os
from pathlib import Path

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
# Capture 'apply -f -' stdin; answer configmap lookups; succeed on wait/logs.
args="$*"
case "$args" in
  *"apply"*) cat > "{capture}" ; exit 0 ;;
  *"get configmap backup-config"*) echo "/Backup" ; exit 0 ;;
  *"wait"*) exit 0 ;;
  *"logs"*) exit 0 ;;
  *) exit 0 ;;
esac
"""


@pytest.fixture
def filen(repo_root: Path, tmp_path: Path) -> dict:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    capture = tmp_path / "applied.yaml"
    kubectl = fake_bin / "kubectl"
    kubectl.write_text(KUBECTL_STUB.replace("{capture}", str(capture)))
    kubectl.chmod(0o755)
    return {
        "script": repo_root / "scripts" / "backup-restore.sh",
        "env": {"PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '')}"},
        "capture": capture,
    }


def test_filen_pull_without_timestamp_fails_with_usage(run_cmd, filen):
    result = run_cmd(["bash", str(filen["script"]), "filen-pull"], env=filen["env"])
    assert result.returncode != 0
    assert "Usage" in result.output


def test_filen_pull_renders_a_job_mounting_backup_pvc_writable(run_cmd, filen):
    result = run_cmd(["bash", str(filen["script"]), "filen-pull", "20260530-020001"], env=filen["env"])
    assert result.returncode == 0
    applied = filen["capture"].read_text(encoding="utf-8")
    assert "kind: Job" in applied
    assert "claimName: backup-pvc" in applied
    assert "node:22-alpine" in applied
    assert "/backups/20260530-020001/" in applied
    # The backups volume must be writable: no readOnly mount anywhere in the Job.
    assert "readOnly: true" not in applied


def test_filen_pull_resolves_remote_base_path_from_backup_config_configmap(run_cmd, filen):
    result = run_cmd(["bash", str(filen["script"]), "filen-pull", "pvc-20260530-030001"], env=filen["env"])
    assert result.returncode == 0
    assert "/Backup/pvc-20260530-030001/" in filen["capture"].read_text(encoding="utf-8")


def test_filen_pull_honours_remote_path_override(run_cmd, filen):
    result = run_cmd(["bash", str(filen["script"]), "filen-pull", "20260530-020001",
                      "--remote-path", "/custom/path"], env=filen["env"])
    assert result.returncode == 0
    assert "/custom/path/20260530-020001/" in filen["capture"].read_text(encoding="utf-8")


def test_usage_lists_filen_pull(run_cmd, filen):
    result = run_cmd(["bash", str(filen["script"]), "--help"], env=filen["env"])
    assert result.returncode == 0
    assert "filen-pull" in result.output
