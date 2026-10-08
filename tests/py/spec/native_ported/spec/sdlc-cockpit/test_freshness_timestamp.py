"""Native migration of tests/spec/sdlc-cockpit/freshness-timestamp.bats."""
# (D12)
# Daemon precondition from daemon-helper.bash (via the ported daemon-endpoints module), autouse.

import importlib.util
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest


def _load_sibling(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def base(repo_root, run_cmd):
    endpoints = _load_sibling("test_daemon_endpoints.py")
    return endpoints._require_daemon(repo_root, run_cmd)


def _fetched_at(output):
    match = re.search(r'"fetchedAt":"([^"]+)"', output)
    return match.group(1) if match else ""


def test_d12_health_has_fetched_at(base, run_cmd):
    assert "fetchedAt" in run_cmd(["curl", "-s", f"{base}/health"]).output


def test_d12_api_admin_cockpit_portfolio_has_fetched_at(base, run_cmd):
    output = run_cmd(["curl", "-s", f"{base}/api/admin/cockpit/portfolio?brand=mentolder"]).output
    assert '"fetchedAt"' in output


def test_d12_api_admin_cluster_pods_list_has_fetched_at(base, run_cmd):
    output = run_cmd(["curl", "-s", f"{base}/api/admin/cluster/pods-list?namespace=workspace"]).output
    assert '"fetchedAt"' in output


def test_d12_api_cockpit_agents_has_fetched_at(base, run_cmd):
    output = run_cmd(["curl", "-s", f"{base}/api/cockpit/agents"]).output
    assert '"fetchedAt"' in output


def test_d12_fetched_at_is_valid_iso_8601(base, run_cmd):
    ts = _fetched_at(run_cmd(["curl", "-s", f"{base}/health"]).output)
    # ISO 8601: 2026-07-28T20:30:00Z oder 2026-07-28T20:30:00.000Z
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", ts)


def test_d12_fetched_at_is_recent_within_last_60_seconds(base, run_cmd):
    ts = _fetched_at(run_cmd(["curl", "-s", f"{base}/health"]).output)
    try:
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        epoch = int(parsed.timestamp())
    except ValueError:
        epoch = 0
    diff = int(time.time()) - epoch
    assert diff < 60
