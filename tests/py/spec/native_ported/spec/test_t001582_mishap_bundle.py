"""Native migration of tests/spec/t001582-mishap-bundle.bats."""
# The ticket core (scripts/vda/ticket/_ticket-core.sh) keeps a fail-closed
# sentinel that is armed when BATS_TEST_NAME or BATS_VERSION is set. The tests
# that touch the ticket scripts therefore set BATS_TEST_NAME, so the production

# guard stays active under pytest and no test reaches the live cluster.

import os
import re
import time
from pathlib import Path

import pytest

GUARD_ENV = {"BATS_TEST_NAME": "pytest-native-port-t001582"}


@pytest.fixture
def paths(repo_root: Path):
    return {
        "lock": repo_root / "scripts" / "agent-lock.sh",
        "ticket_sh": repo_root / "scripts" / "ticket.sh",
        "create": repo_root / "scripts" / "vda" / "ticket" / "create.sh",
        "get": repo_root / "scripts" / "vda" / "ticket" / "get.sh",
        "core": repo_root / "scripts" / "vda" / "ticket" / "_ticket-core.sh",
    }


def _sed_field(text: str, key: str, value: str) -> str:
    return re.sub(rf'"{key}": "[0-9]*"', f'"{key}": "{value}"', text)


def _reap_scenario(run_cmd, lock: Path, tmp_path: Path, monkeypatch, sid: str, name: str,
                   heartbeat_is_now: bool):
    monkeypatch.setenv("AGENT_LOCK_DIR", str(tmp_path))
    run_cmd(["bash", str(lock), "claim", "ticket", name, "--label", "mishap1"],
            env={"AGENT_LOCK_SID": sid}).check(0)
    lf = tmp_path / f"ticket__{name}.json"
    now = int(time.time())
    old = now - 100000
    text = lf.read_text(encoding="utf-8")
    text = _sed_field(text, "created_at", str(old))
    text = _sed_field(text, "heartbeat_at", str(now if heartbeat_is_now else old))
    text = _sed_field(text, "owner_pid", "999999")
    lf.write_text(text, encoding="utf-8")
    run_cmd(["bash", str(lock), "reap"]).check(0)
    return run_cmd(["bash", str(lock), "list"])


def test_t001582_m1_agent_lock_does_not_pid_dead_reap_recently_refreshed_claim(run_cmd, paths, tmp_path, monkeypatch):
    res = _reap_scenario(run_cmd, paths["lock"], tmp_path, monkeypatch, "555555",
                         "t001582-m1-refreshed", heartbeat_is_now=True)
    assert "t001582-m1-refreshed" in res.output


def test_t001582_m1_regression_guard_agent_lock_still_reaps_claim_whose_heartbeat_is_also_stale(
        run_cmd, paths, tmp_path, monkeypatch):
    res = _reap_scenario(run_cmd, paths["lock"], tmp_path, monkeypatch, "555556",
                         "t001582-m1-stale", heartbeat_is_now=False)
    assert "t001582-m1-stale" not in res.output


def test_t001582_m3_get_sh_no_longer_errors_with_command_not_found_when_invoked(run_cmd, paths):
    res = run_cmd(["bash", str(paths["get"]), "--id", "T000001"], env=GUARD_ENV)
    assert "command not found" not in res.output
