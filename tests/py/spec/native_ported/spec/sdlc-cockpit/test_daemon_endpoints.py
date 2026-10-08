"""Native migration of tests/spec/sdlc-cockpit/daemon-endpoints.bats."""
# Daemon precondition mirrors tests/spec/sdlc-cockpit/daemon-helper.bash (require_daemon):
# COCKPIT_DAEMON_REQUIRED set -> missing daemon fails; unset -> skip.

import os
import re
from pathlib import Path

import pytest


def _require_daemon(repo_root: Path, run_cmd):
    port = os.environ.get("COCKPIT_DAEMON_PORT", "39152")
    base = f"http://127.0.0.1:{port}"
    health = run_cmd(["curl", "-s", "-m", "2", f"{base}/health"]).stdout

    if not health:
        if os.environ.get("COCKPIT_DAEMON_REQUIRED"):
            pytest.fail(
                f"FATAL: COCKPIT_DAEMON_REQUIRED ist gesetzt, aber {base}/health antwortet nicht. "
                "Daemon starten mit: task cockpit:daemon"
            )
        pytest.skip(f"Daemon not running (no /health on {base})")

    match = re.search(r'"root":"([^"]*)"', health)
    daemon_root = match.group(1) if match else ""
    if daemon_root:
        daemon_root = os.path.realpath(daemon_root)
    expected_root = os.path.realpath(repo_root)
    if daemon_root != expected_root:
        detail = f"root={daemon_root or '<fehlt, Daemon aelter als T002464>'} erwartet={expected_root}"
        if os.environ.get("COCKPIT_DAEMON_REQUIRED"):
            pytest.fail(f"FATAL: Der Daemon auf {base} gehoert zu einem anderen Checkout. {detail}")
        pytest.skip(f"Daemon on {base} belongs to another checkout ({detail})")
    return base


@pytest.fixture
def base(repo_root, run_cmd):
    return _require_daemon(repo_root, run_cmd)


def test_daemon_health_endpoint_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{base}/health"])
    assert result.output == "200"


def test_get_api_admin_cockpit_portfolio_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", f"{base}/api/admin/cockpit/portfolio?brand=mentolder"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output


def test_get_api_admin_cluster_pods_list_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", f"{base}/api/admin/cluster/pods-list?namespace=workspace"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output


def test_get_api_cockpit_agents_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/agents"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output


def test_get_api_cockpit_ci_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/ci"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output


def test_get_api_cockpit_models_responds(base, run_cmd):
    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/models"])
    assert result.returncode == 0, result.output
    assert "fetchedAt" in result.output
