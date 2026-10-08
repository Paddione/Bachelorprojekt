"""Native migration of tests/spec/fleet-operations/membership-drift.bats."""
import os
import shlex
import stat
from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "fleet-membership-check.sh"


REGISTRY_ONE = "fleet:\n  nodes:\n    - name: pk-hetzner-4\n      k8s_node: true\n  workers: []\n"
REGISTRY_DRIFT = (
    "fleet:\n  nodes:\n    - name: pk-hetzner-4\n      k8s_node: true\n"
    "    - name: pk-hetzner-99\n      k8s_node: true\n  workers: []\n"
)
KUBECTL_STUB = """#!/usr/bin/env bash
if [[ "$*" == *"get nodes"* ]]; then
  echo "node/pk-hetzner-4"
  exit 0
fi
exit 1
"""


def _write_kubectl(tmp_path: Path) -> Path:
    kubectl = tmp_path / "kubectl"
    kubectl.write_text(KUBECTL_STUB, encoding="utf-8")
    kubectl.chmod(kubectl.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return kubectl


def test_t002630_p3_fleet_membership_check_sh_existiert_und_ist_ausfuehrbar(script):
    assert script.is_file(), f"MISSING: {script}"
    assert os.access(script, os.X_OK), f"NOT executable: {script}"


def test_t002630_p3_skript_skipped_ohne_cluster_zugang_kubectl_unerreichbar(script, tmp_path, run_cmd):
    registry = tmp_path / "test-registry.yaml"
    registry.write_text(REGISTRY_ONE, encoding="utf-8")
    res = run_cmd(
        f"KUBECTL=nonexistent-kubectl WG_REGISTRY_FILE={shlex.quote(str(registry))} "
        f"{shlex.quote(str(script))} 2>&1",
        timeout=300,
    )
    assert res.returncode == 0, f"FAIL: exit={res.returncode}, expected 0 (Skip). output={res.output}"
    import re

    assert re.search(r"uebersprungen|skip|nicht erreichbar", res.output, re.IGNORECASE), \
        f"FAIL: Skript meldet keinen Skip bei fehlendem Cluster. output={res.output}"


def test_t002630_p3_skript_meldet_deklariert_aber_abwesend_exit_ungleich_0(script, tmp_path, run_cmd):
    registry = tmp_path / "test-registry.yaml"
    registry.write_text(REGISTRY_DRIFT, encoding="utf-8")
    kubectl = _write_kubectl(tmp_path)
    res = run_cmd(
        ["bash", str(script)],
        env={
            "PATH": f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}",
            "KUBECTL": str(kubectl),
            "WG_REGISTRY_FILE": str(registry),
        },
        timeout=300,
    )
    assert res.returncode != 0, f"FAIL: exit={res.returncode}, expected != 0 bei Drift. output={res.output}"
    assert "pk-hetzner-99" in res.output, \
        f"FAIL: Ausgabe nennt nicht den fehlenden Node pk-hetzner-99. output={res.output}"


def test_t002630_p3_skript_exit_0_bei_deckungsgleichheit(script, tmp_path, run_cmd):
    registry = tmp_path / "test-registry.yaml"
    registry.write_text(REGISTRY_ONE, encoding="utf-8")
    kubectl = _write_kubectl(tmp_path)
    res = run_cmd(
        ["bash", str(script)],
        env={
            "PATH": f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}",
            "KUBECTL": str(kubectl),
            "WG_REGISTRY_FILE": str(registry),
        },
        timeout=300,
    )
    assert res.returncode == 0, \
        f"FAIL: exit={res.returncode}, expected 0 bei Deckungsgleichheit. output={res.output}"


def test_t002630_p3_taskfile_yml_enthaelt_task_fleet_membership_s4_erreichbarkeit(repo_root):
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    assert taskfile.is_file(), f"MISSING: {taskfile}"
    assert "fleet:membership" in taskfile.read_text(encoding="utf-8"), \
        "FAIL: Taskfile.yml enthaelt keinen fleet:membership Task"
