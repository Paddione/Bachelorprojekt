"""SDLC throughput dashboard + hold timestamps (T901790).

Static guards (no live cluster): the dashboard script exists, is executable,
answers --help offline, and all four execution-hold write paths persist
timestamps so hold duration becomes measurable.
"""

import os
import stat
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def bats_regime_env(monkeypatch, request):
    monkeypatch.setenv("BATS_TEST_NAME", request.node.name)


@pytest.fixture
def root(repo_root: Path) -> Path:
    return repo_root


def _text(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def test_dashboard_script_executable(root):
    p = root / "scripts/sdlc-throughput.sh"
    assert p.is_file()
    assert p.stat().st_mode & stat.S_IXUSR


def test_dashboard_help_offline(run_cmd, root):
    r = run_cmd(["bash", "scripts/sdlc-throughput.sh", "--help"], cwd=root)
    assert r.returncode == 0
    assert "sdlc-throughput" in (r.stdout + r.stderr).lower()


def test_dashboard_is_read_only(root):
    body = _text(root, "scripts/sdlc-throughput.sh").upper()
    for write in ("INSERT ", "UPDATE ", "DELETE ", "CREATE ", "ALTER "):
        assert write not in body


def test_stage_plan_hold_writes_held_at(root):
    body = _text(root, "scripts/vda/ticket/stage-plan.sh")
    assert "execution_held_at" in body


def test_release_hold_writes_released_at(root):
    body = _text(root, "scripts/ticket.sh")
    assert "execution_released_at" in body


def test_cockpit_hold_paths_write_timestamps(root):
    body = _text(root, "components/website/src/lib/sdlc/tickets/cockpit-db.ts")
    assert "execution_held_at" in body
    assert "execution_released_at" in body


def test_dispatch_log_wired(root):
    ticket_sh = _text(root, "scripts/ticket.sh")
    assert "dispatch-log" in ticket_sh
    assert "vda/ticket/dispatch-log.sh" in ticket_sh
    help_sh = _text(root, "scripts/lib/ticket-help.sh")
    assert "dispatch-log" in help_sh
    assert "request|approved|stale-skip" in help_sh


def test_dispatch_log_marker_format(root):
    body = _text(root, "scripts/vda/ticket/dispatch-log.sh")
    assert "DISPATCH-" in body
    assert "kind" in body and "'system'" in body
    assert "ticket-dispatch" in body
    assert "case \"$event\" in request|approved|stale-skip" in body


def test_dispatch_log_rejects_bad_event_offline(run_cmd, root):
    r = run_cmd(
        ["bash", "scripts/ticket.sh", "dispatch-log", "--id", "T000000",
         "--event", "bogus"],
        cwd=root,
    )
    assert r.returncode == 2
    assert "request|approved|stale-skip" in (r.stdout + r.stderr)


def test_dashboard_covers_dispatch(root):
    body = _text(root, "scripts/sdlc-throughput.sh")
    assert "DISPATCH-REQUEST" in body
    assert "DISPATCH-APPROVED" in body
    assert "DISPATCH-STALE-SKIP" in body
    assert "stale_skip_n=" in body
