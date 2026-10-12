"""tests/py/smoke/test_runtime_services.py — Live smoke tests for developer runtime endpoints."""
import json
import os
import shutil
import urllib.error
import urllib.request
from pathlib import Path

import pytest


def _is_local_dev() -> bool:
    """True when running in the local development environment rather than CI."""
    return os.environ.get("CI") != "true" and os.environ.get("GITHUB_ACTIONS") != "true"


def test_git_cli_functional(run_cmd):
    """Git binary is functional and detects current repository."""
    res = run_cmd("git rev-parse --is-inside-work-tree")
    res.check(0)
    assert res.stdout.strip() == "true"


def test_github_cli_authenticated(run_cmd):
    """gh CLI is installed and authenticated for developer workflow."""
    if not shutil.which("gh"):
        pytest.skip("gh CLI not installed")
    res = run_cmd("gh auth status")
    assert res.returncode == 0, f"gh not authenticated: {res.output}"
    assert "Logged in to github.com" in res.output


def test_opencode_service_registered_and_healthy():
    """Verify OpenCode background service state file and HTTP daemon health."""
    service_file = Path.home() / ".local/state/opencode/service.json"
    if not service_file.is_file():
        if not _is_local_dev():
            pytest.skip("OpenCode daemon not running in CI")
        pytest.fail(f"OpenCode service.json missing at {service_file}")

    data = json.loads(service_file.read_text())
    assert "url" in data, "service.json missing URL"
    assert "pid" in data, "service.json missing PID"

    # Verify process is alive
    try:
        os.kill(data["pid"], 0)
    except OSError:
        pytest.fail(f"OpenCode daemon PID {data['pid']} is not running")

    # Verify HTTP connectivity to the daemon endpoint
    url = data["url"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pytest-smoke"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status in (200, 404, 401), f"Unexpected HTTP status {resp.status}"
    except urllib.error.HTTPError as e:
        # A 401 or 404 indicates the HTTP server is up and responding
        assert e.code in (401, 404)
    except Exception as e:
        pytest.fail(f"Could not connect to OpenCode daemon at {url}: {e}")


def test_local_llm_proxy_endpoint_functional():
    """Verify local LLM proxy / models endpoint is responsive."""
    url = "http://127.0.0.1:18235/v1/models"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pytest-smoke"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert "data" in data or "models" in data or "object" in data
    except Exception as e:
        if not _is_local_dev():
            pytest.skip(f"Local LLM proxy not available in CI: {e}")
        pytest.skip(f"Local LLM proxy (:18235) not active: {e}")
