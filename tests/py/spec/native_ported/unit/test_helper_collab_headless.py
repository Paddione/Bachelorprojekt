"""Native migration of tests/unit/helper-collab-headless.bats."""
import json
import shutil

import pytest


def _run_mock(run_cmd, repo_root, *args):
    """Run the vm-based helper-collab mock runner and parse its JSON output."""
    if not shutil.which("node"):
        pytest.skip("node not installed")
    runner = repo_root / "tests" / "scripts" / "helper-collab-mock-runner.mjs"
    result = run_cmd(["node", str(runner), *args], timeout=60)
    result.check()
    return json.loads(result.stdout)


def test_who_autobot_url_param_skips_prompt_and_sets_name_t000542(run_cmd, repo_root):
    data = _run_mock(run_cmd, repo_root, "?who=AutoBot")
    assert data.get("who") == "AutoBot"
    assert data.get("promptCalled") is False


def test_no_url_param_and_no_cached_name_prompt_is_called(run_cmd, repo_root):
    data = _run_mock(run_cmd, repo_root, "")
    assert data.get("promptCalled") is True


def test_pre_set_localstorage_still_skips_prompt_after_fix_regression_guard(run_cmd, repo_root):
    data = _run_mock(run_cmd, repo_root, "", "CachedUser")
    assert data.get("who") == "CachedUser"
    assert data.get("promptCalled") is False


def test_who_value_is_trimmed_to_max_24_chars(run_cmd, repo_root):
    data = _run_mock(run_cmd, repo_root, "?who=AAAAABBBBBCCCCCDDDDDEEEEE")
    who = str(data.get("who"))
    assert len(who) <= 24
