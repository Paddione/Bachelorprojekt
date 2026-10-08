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

def test_admin_cockpit_spec(repo_root: Path):
    """Executes tests/spec/admin-cockpit.bats."""
    res = _run_bats(repo_root, "tests/spec/admin-cockpit.bats")
    assert res.returncode == 0, f"admin-cockpit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── projekttickets-cockpit.bats ─────────────────────────────────────────────

def test_projekttickets_cockpit_spec(repo_root: Path):
    """Executes tests/spec/projekttickets-cockpit.bats."""
    res = _run_bats(repo_root, "tests/spec/projekttickets-cockpit.bats")
    assert res.returncode == 0, f"projekttickets-cockpit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-interfaces.bats ─────────────────────────────────────────────────

def test_website_interfaces_spec(repo_root: Path):
    """Executes tests/spec/website-interfaces.bats."""
    res = _run_bats(repo_root, "tests/spec/website-interfaces.bats")
    assert res.returncode == 0, f"website-interfaces.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-svelte-check.bats ───────────────────────────────────────────────

def test_website_svelte_check_spec(repo_root: Path):
    """Executes tests/spec/website-svelte-check.bats."""
    res = _run_bats(repo_root, "tests/spec/website-svelte-check.bats")
    assert res.returncode == 0, f"website-svelte-check.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-core.bats ───────────────────────────────────────────────────────

def test_website_core_spec(repo_root: Path):
    """Executes tests/spec/website-core.bats."""
    res = _run_bats(repo_root, "tests/spec/website-core.bats")
    assert res.returncode == 0, f"website-core.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-core/*.bats ─────────────────────────────────────────────────────

def test_website_core_admin_nav_no_sdlc_routes_spec(repo_root: Path):
    """Executes tests/spec/website-core/admin-nav-no-sdlc-routes.bats."""
    res = _run_bats(repo_root, "tests/spec/website-core/admin-nav-no-sdlc-routes.bats")
    assert res.returncode == 0, f"admin-nav-no-sdlc-routes.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_website_core_email_notifications_spec(repo_root: Path):
    """Executes tests/spec/website-core/email-notifications.bats."""
    res = _run_bats(repo_root, "tests/spec/website-core/email-notifications.bats")
    assert res.returncode == 0, f"email-notifications.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_website_core_portrait_derivate_crop_spec(repo_root: Path):
    """Executes tests/spec/website-core/portrait-derivate-crop.bats."""
    res = _run_bats(repo_root, "tests/spec/website-core/portrait-derivate-crop.bats")
    assert res.returncode == 0, f"portrait-derivate-crop.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


def test_website_core_web_audit_spec(repo_root: Path):
    """Executes tests/spec/website-core/web-audit.bats."""
    res = _run_bats(repo_root, "tests/spec/website-core/web-audit.bats")
    assert res.returncode == 0, f"web-audit.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"


# ── website-schema/fk-targets-unique.bats ───────────────────────────────────

def test_website_schema_fk_targets_unique_spec(repo_root: Path):
    """Executes tests/spec/website-schema/fk-targets-unique.bats."""
    res = _run_bats(repo_root, "tests/spec/website-schema/fk-targets-unique.bats")
    assert res.returncode == 0, f"fk-targets-unique.bats failed:\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}"
