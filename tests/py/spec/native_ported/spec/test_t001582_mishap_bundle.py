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


def test_t001582_m2_create_sh_rejects_invalid_severity_before_any_db_access(run_cmd, paths):
    assert paths["create"].is_file()
    res = run_cmd(
        ["bash", str(paths["create"]), "create", "--type", "bug", "--title", "x",
         "--description", "y", "--severity", "hoch"],
        env={"TICKET_OFFLINE": "1", **GUARD_ENV},
    )
    assert res.returncode == 2, res.output
    for word in ("critical", "major", "minor", "trivial"):
        assert word in res.output
    assert "OFFLINE: skipped" not in res.output


def test_t001582_m2_create_sh_still_allows_empty_severity_optional_field(run_cmd, paths):
    assert paths["create"].is_file()
    res = run_cmd(
        ["bash", str(paths["create"]), "create", "--type", "bug", "--title", "x", "--description", "y"],
        env={"TICKET_OFFLINE": "1", **GUARD_ENV},
    )
    assert res.returncode == 0, res.output
    assert "Invalid --severity" not in res.output
    assert "OFFLINE: skipped create" in res.output


def test_t002224_create_sh_honours_ticket_offline_and_performs_no_cluster_write(run_cmd, paths, tmp_path):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = mockdir / "invoked"
    kubectl = mockdir / "kubectl"
    kubectl.write_text(
        '#!/usr/bin/env bash\necho "kubectl $*" >> "$CAP"\necho "pod/shared-db-0"\nexit 0\n',
        encoding="utf-8",
    )
    kubectl.chmod(0o755)
    res = run_cmd(
        ["bash", str(paths["create"]), "create", "--type", "bug", "--title", "x", "--description", "y"],
        env={"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAP": str(cap),
             "TICKET_OFFLINE": "1", **GUARD_ENV},
    )
    assert res.returncode == 0, res.output
    assert "OFFLINE: skipped create" in res.output
    assert not cap.exists() or cap.stat().st_size == 0


def test_t002224_ticket_core_repoints_ctx_away_from_live_cluster_under_bats(run_cmd, paths):
    res = run_cmd(
        ["bash", "-c", f"source '{paths['core']}'; echo \"$CTX\""],
        env=GUARD_ENV,
    )
    assert res.returncode == 0, res.output
    assert res.output == "bats-no-cluster-t002224"
    assert res.output != "fleet"


def test_t002224_test_ticket_test_db_ok_1_opts_test_back_into_configured_context(run_cmd, paths):
    res = run_cmd(
        ["bash", "-c", f"source '{paths['core']}'; echo \"$CTX\""],
        env={"TICKET_TEST_DB_OK": "1", "TICKET_CTX": "fleet", **GUARD_ENV},
    )
    assert res.returncode == 0, res.output
    assert res.output == "fleet"


def test_t001582_m2_ticket_sh_usage_text_lists_valid_severity_enum_values(paths):
    text = paths["ticket_sh"].read_text(encoding="utf-8")
    assert re.search(r"severity.*critical.*major.*minor.*trivial|critical\|major\|minor\|trivial", text)


def test_t001582_m3_ticket_offline_refuse_read_is_defined_in_shared_ticket_core(paths):
    assert "_ticket_offline_refuse_read()" in paths["core"].read_text(encoding="utf-8")


def test_t001582_m3_get_sh_no_longer_errors_with_command_not_found_when_invoked(run_cmd, paths):
    res = run_cmd(["bash", str(paths["get"]), "--id", "T000001"], env=GUARD_ENV)
    assert "command not found" not in res.output
