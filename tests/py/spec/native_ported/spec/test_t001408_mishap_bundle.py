"""Native migration of tests/spec/t001408-mishap-bundle.bats."""

import re
import time
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {"lock": repo_root / "scripts" / "agent-lock.sh",
            "ci_watch": repo_root / "scripts" / "devflow-ci-watch.sh"}


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def test_t001408_m1_agent_lock_defines_an_agent_lock_grace_window(paths):
    assert "AGENT_LOCK_GRACE" in _text(paths["lock"])


def test_t001408_m1_agent_lock_does_not_reap_claim_younger_than_grace_on_dead_numeric_sid_alone(run_cmd, paths, tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_LOCK_DIR", str(tmp_path))
    monkeypatch.delenv("CLAUDE_SESSION_ID", raising=False)
    run_cmd(["bash", str(paths["lock"]), "claim", "ticket", "t001408-m1-grace", "--label", "mishap1"],
            env={"AGENT_LOCK_SID": "999999"}).check(0)
    run_cmd(["bash", str(paths["lock"]), "reap"]).check(0)
    res = run_cmd(["bash", str(paths["lock"]), "list"])
    assert "t001408-m1-grace" in res.output


def test_t001408_m1_agent_lock_logs_reap_reason_when_claim_is_actually_reaped(run_cmd, paths, tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_LOCK_DIR", str(tmp_path))
    run_cmd(["bash", str(paths["lock"]), "claim", "ticket", "t001408-m1-log", "--label", "mishap1"],
            env={"AGENT_LOCK_TTL": "1", "AGENT_LOCK_SID": "888888"}).check(0)
    time.sleep(2)
    run_cmd(["bash", str(paths["lock"]), "reap"], env={"AGENT_LOCK_TTL": "1"}).check(0)
    reap_log = tmp_path / ".reap.log"
    assert reap_log.is_file()
    assert "t001408-m1-log" in reap_log.read_text(encoding="utf-8")


def test_t001408_m2_ci_watch_checks_merge_state_status_before_ci_poll_loop(paths):
    assert "mergeStateStatus" in _text(paths["ci_watch"])


def test_t001408_m2_ci_watch_attempts_rebase_against_main_on_dirty_merge_state_status(paths):
    assert re.search(r"rebase[ \t]+origin/main|rebase[ \t]+origin main", _text(paths["ci_watch"]))


def test_t001408_m3_ci_watch_does_not_call_invalid_gh_pr_checks_json_flag(paths):
    assert not re.search(r"gh pr checks[ \t]+.*--json", _text(paths["ci_watch"]))


def test_t001408_m3_ci_watch_derives_failed_checks_from_gh_pr_view_json_status_check_rollup(paths):
    assert re.search(r"gh pr view.*--json[ \t]+.*statusCheckRollup", _text(paths["ci_watch"]))
