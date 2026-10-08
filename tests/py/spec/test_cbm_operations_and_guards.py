"""Tests migrating CBM health goals, reconcile, refresh cron, and stampede guard specs to pytest:
- tests/spec/cbm-health-goals.bats
- tests/spec/cbm-reconcile.bats
- tests/spec/cbm-refresh-cron-A4.bats
- tests/spec/cbm-stampede-guard.bats
"""

import subprocess
from pathlib import Path
import pytest


def _run_bats(repo_root: Path, bats_file: str) -> subprocess.CompletedProcess:
    res = subprocess.run(
        ["bats", bats_file],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    return res


# ── cbm-health-goals.bats ──────────────────────────────────────────────────

def test_cbm_health_goals_spec(repo_root: Path):
    """Executes tests/spec/cbm-health-goals.bats."""
    res = _run_bats(repo_root, "tests/spec/cbm-health-goals.bats")
    assert res.returncode == 0, f"cbm-health-goals.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── cbm-reconcile.bats ──────────────────────────────────────────────────────

def test_cbm_reconcile_spec(repo_root: Path):
    """Executes tests/spec/cbm-reconcile.bats."""
    res = _run_bats(repo_root, "tests/spec/cbm-reconcile.bats")
    assert res.returncode == 0, f"cbm-reconcile.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── cbm-refresh-cron-A4.bats ────────────────────────────────────────────────

def test_cbm_refresh_cron_a4_spec(repo_root: Path):
    """Executes tests/spec/cbm-refresh-cron-A4.bats."""
    res = _run_bats(repo_root, "tests/spec/cbm-refresh-cron-A4.bats")
    assert res.returncode == 0, f"cbm-refresh-cron-A4.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── cbm-stampede-guard.bats ────────────────────────────────────────────────

def test_cbm_stampede_guard_spec(repo_root: Path):
    """Executes tests/spec/cbm-stampede-guard.bats."""
    res = _run_bats(repo_root, "tests/spec/cbm-stampede-guard.bats")
    assert res.returncode == 0, f"cbm-stampede-guard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
