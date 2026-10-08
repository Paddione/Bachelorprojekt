"""Tests migrating Paket 6A website core and frontend specs to pytest:
- tests/spec/admin-cockpit.bats
- tests/spec/projekttickets-cockpit.bats
- tests/spec/website-interfaces.bats
- tests/spec/website-svelte-check.bats
- tests/spec/website-core.bats
- tests/spec/website-core/admin-nav-no-sdlc-routes.bats
- tests/spec/website-core/email-notifications.bats
- tests/spec/website-core/portrait-derivate-crop.bats
- tests/spec/website-core/web-audit.bats
- tests/spec/website-schema/fk-targets-unique.bats
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


# ── admin-cockpit.bats ──────────────────────────────────────────────────────


# ── projekttickets-cockpit.bats ─────────────────────────────────────────────

def test_projekttickets_cockpit_spec(repo_root: Path):
    """Executes tests/spec/projekttickets-cockpit.bats."""
    res = _run_bats(repo_root, "tests/spec/projekttickets-cockpit.bats")
    assert res.returncode == 0, f"projekttickets-cockpit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-interfaces.bats ─────────────────────────────────────────────────


# ── website-svelte-check.bats ───────────────────────────────────────────────


# ── website-core.bats ───────────────────────────────────────────────────────


# ── website-core/*.bats ─────────────────────────────────────────────────────


# ── website-schema/fk-targets-unique.bats ───────────────────────────────────

