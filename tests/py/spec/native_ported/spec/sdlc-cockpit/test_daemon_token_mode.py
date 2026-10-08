"""Native migration of tests/spec/sdlc-cockpit/daemon-token-mode.bats."""
# Token: 0600 Dateirechte, POST ohne Token -> 401. Daemon precondition from daemon-helper.bash
# (via the ported daemon-endpoints module): every test skips or fails without a running daemon.

import importlib.util
import os
from pathlib import Path

import pytest

TOKEN_FILE = Path("/tmp/cockpit-daemon.token")


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


def test_token_file_has_0600_permissions(base):
    if not TOKEN_FILE.is_file():
        pytest.skip("Daemon not running (no token file)")
    perms = oct(os.stat(TOKEN_FILE).st_mode & 0o777)[2:]
    assert perms == "600"


def test_token_file_is_non_empty(base):
    if not TOKEN_FILE.is_file():
        pytest.skip("Daemon not running (no token file)")
    assert os.stat(TOKEN_FILE).st_size > 0


def test_post_without_token_returns_401(base, run_cmd):
    result = run_cmd([
        "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
        f"{base}/api/cockpit/ticket-action",
        "-H", "Content-Type: application/json",
        "-d", '{"ticketId":"T002461","action":"test"}',
    ])
    assert result.output == "401"


def test_post_with_wrong_token_returns_401(base, run_cmd):
    result = run_cmd([
        "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
        f"{base}/api/cockpit/ticket-action",
        "-H", "Content-Type: application/json",
        "-H", "Authorization: Bearer wrong-token-12345",
        "-d", '{"ticketId":"T002461","action":"test"}',
    ])
    assert result.output == "401"


def test_get_without_token_succeeds_read_is_free_per_e17(base, run_cmd):
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{base}/health"])
    assert result.output == "200"
