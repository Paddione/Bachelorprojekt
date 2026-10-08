"""Tests migrating Paket 6A brett and neovim dashboard specs to pytest:
- tests/spec/brett.bats
- tests/spec/neovim-dashboard.bats
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


# ── brett.bats ─────────────────────────────────────────────────────────────

def test_brett_spec(repo_root: Path):
    """Executes tests/spec/brett.bats."""
    res = _run_bats(repo_root, "tests/spec/brett.bats")
    assert res.returncode == 0, f"brett.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── neovim-dashboard.bats ──────────────────────────────────────────────────

def test_neovim_dashboard_spec(repo_root: Path):
    """Executes tests/spec/neovim-dashboard.bats."""
    res = _run_bats(repo_root, "tests/spec/neovim-dashboard.bats")
    assert res.returncode == 0, f"neovim-dashboard.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
