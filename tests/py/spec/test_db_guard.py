"""Tests for DB identity and kubeconfig drift guards (migrated from tests/spec/db-guard/)."""

from pathlib import Path
import re
import subprocess
import pytest


def test_t015168_db_identity_guard(repo_root: Path, tmp_path: Path):
    core = repo_root / "scripts" / "vda" / "ticket" / "_ticket-core.sh"
    migration = repo_root / "migrations" / "20260824-db-identity-marker.sql"
    expected_uuid = "9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00"

    stubdir = tmp_path / "bin"
    stubdir.mkdir()
    kubectl = stubdir / "kubectl"
    kubectl.write_text("""#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then printf '%s\\n' "${POD_LINES:-pod/shared-db-0}"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  if [[ "$input" == *"db_identity"* ]]; then printf '%s' "${IDENTITY_ANSWER-}"; fi
  exit 0
fi
exit 0
""")
    kubectl.chmod(0o755)

    def _run_pgpod(pod_lines: str, identity_answer: str, ticket_test_db_ok: str, extra_env=None):
        env = {
            "PATH": f"{stubdir}:{subprocess.os.environ.get('PATH', '')}",
            "POD_LINES": pod_lines,
            "IDENTITY_ANSWER": identity_answer,
            "TICKET_TEST_DB_OK": ticket_test_db_ok,
            "BATS_VERSION": "1.0.0",
        }
        if extra_env:
            env.update(extra_env)
        cmd = f"source '{core}'; NS='workspace'; CTX='fleet'; _pgpod"
        return subprocess.run(["bash", "-c", cmd], env=env, text=True, capture_output=True)

    # 1: multiple pods
    res = _run_pgpod("pod/shared-db-0\npod/shared-db-ghost", "", "1")
    assert res.returncode != 0
    assert "shared-db-0" in res.stdout or "shared-db-0" in res.stderr
    assert "shared-db-ghost" in res.stdout or "shared-db-ghost" in res.stderr

    # 2: missing marker
    res = _run_pgpod("pod/shared-db-0", "", "1")
    assert res.returncode != 0
    assert "db:migrate" in res.stdout or "db:migrate" in res.stderr

    # 3: marker mismatch
    res = _run_pgpod("pod/shared-db-0", "00000000-0000-0000-0000-000000000000", "1")
    assert res.returncode != 0
    out = res.stdout + res.stderr
    assert expected_uuid in out
    assert "00000000" in out

    # 4: escape hatch
    res = _run_pgpod("pod/shared-db-0", "", "1", {"TICKET_ALLOW_UNVERIFIED_DB": "1"})
    assert res.returncode == 0
    assert "WARN" in res.stdout or "WARN" in res.stderr

    # 5: BATS-sentinel regime
    res = _run_pgpod("pod/shared-db-0", "", "")
    assert res.returncode == 0

    # 6: parity
    assert migration.is_file()
    mig_text = migration.read_text()
    core_text = core.read_text()
    mig_uuid = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", mig_text)
    core_uuid = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", core_text)
    assert mig_uuid and core_uuid
    assert mig_uuid.group(0) == core_uuid.group(0)


def test_t015008_kubeconfig_drift_guard(repo_root: Path, tmp_path: Path):
    guard = repo_root / "scripts" / "vda" / "ticket" / "_ctx-guard.sh"
    loopback_cfg = tmp_path / "loopback.yaml"
    lan_cfg = tmp_path / "lan.yaml"

    loopback_cfg.write_text("""apiVersion: v1
kind: Config
contexts:
  - name: lab-cluster
    context:
      cluster: lab-cluster
      user: lab-cluster
clusters:
  - name: lab-cluster
    cluster:
      server: https://127.0.0.1:6446
users:
  - name: lab-cluster
    user: {}
""")
    lan_cfg.write_text(loopback_cfg.read_text().replace("https://127.0.0.1:6446", "https://10.0.33.1:6446"))

    # reject loopback
    res = subprocess.run(
        ["bash", str(guard), "lab-cluster"],
        env={"KUBECONFIG": str(loopback_cfg), "PATH": subprocess.os.environ.get("PATH", "")},
        text=True,
        capture_output=True,
    )
    assert res.returncode != 0
    assert "loopback" in res.stdout or "loopback" in res.stderr

    # accept lan
    res = subprocess.run(
        ["bash", str(guard), "lab-cluster"],
        env={"KUBECONFIG": str(lan_cfg), "PATH": subprocess.os.environ.get("PATH", "")},
        text=True,
        capture_output=True,
    )
    assert res.returncode == 0

    # escape hatch
    res = subprocess.run(
        ["bash", str(guard), "lab-cluster"],
        env={"KUBECONFIG": str(loopback_cfg), "TICKET_ALLOW_LOCAL_CTX": "1", "PATH": subprocess.os.environ.get("PATH", "")},
        text=True,
        capture_output=True,
    )
    assert res.returncode == 0
    assert "WARN" in res.stdout or "WARN" in res.stderr

    # wiring
    ticket_sh = (repo_root / "scripts" / "ticket.sh").read_text()
    assert "_ctx-guard" in ticket_sh

    # syntax
    res = subprocess.run(["bash", "-n", str(guard)], text=True, capture_output=True)
    assert res.returncode == 0
