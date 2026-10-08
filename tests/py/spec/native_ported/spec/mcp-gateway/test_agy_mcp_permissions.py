"""Native migration of tests/spec/mcp-gateway/agy-mcp-permissions.bats."""

import shutil

import pytest


def test_t002719_agy_binary_supports_dangerously_skip_permissions_flag(run_cmd):
    """agy binary supports --dangerously-skip-permissions flag"""
    # agy ist ein lokal installiertes Drittanbieter-Binary; ohne Installation skip.
    if shutil.which("agy") is None:
        pytest.skip("agy binary not installed")
    result = run_cmd(["agy", "--help"])
    assert result.returncode == 0
    assert "--dangerously-skip-permissions" in result.output
