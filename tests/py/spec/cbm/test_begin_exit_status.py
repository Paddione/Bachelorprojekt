"""Failed index preparation must never report a successful refresh."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("failure", ["invalid-json", "missing-repository"])
def test_wrapper_preserves_begin_failure_exit_status(tmp_path, failure):
    if shutil.which("flock") is None:
        pytest.skip("flock binary not installed")
    repo = Path(__file__).resolve().parents[4]
    wrapper = repo / "scripts/mcp/cbm-single-flight.sh"
    helper = repo / "scripts/mcp/cbm-freshness.py"
    payload = "{" if failure == "invalid-json" else json.dumps({
        "repo_path": str(tmp_path / "missing-repository"), "mode": "fast",
    })
    home = tmp_path / "home"
    home.mkdir()
    env = {**os.environ, "HOME": str(home)}

    preparation = subprocess.run(
        ["python3", str(helper), "begin", "--args-json", payload],
        env=env, capture_output=True, text=True, timeout=15,
    )
    result = subprocess.run(
        ["bash", str(wrapper), payload],
        env=env, capture_output=True, text=True, timeout=15,
    )

    assert preparation.returncode in (1, 2), preparation.stderr
    assert result.returncode == preparation.returncode, result.stderr
    assert result.stderr == preparation.stderr
    assert result.stdout == ""
    assert not list(home.rglob("cbm-attempt-*.json"))
    assert not list(home.rglob("cbm-receipt-*.json"))
