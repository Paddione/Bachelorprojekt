"""Native migration of tests/spec/mcp-gateway/token-drift-auto-sync.bats."""

import hashlib
import os
from pathlib import Path

import pytest

STUB_SYSTEMCTL = """#!/usr/bin/env bash
echo "$*" >> "{calls}/systemctl-args"
if [ "$1 $2" = "--user restart" ]; then
  touch "{calls}/restart-$3"
fi
exit 0
"""

STUB_SYNC = """#!/usr/bin/env bash
echo "$*" >> "{calls}/sync-args"
if [ "$1" = "render" ]; then
  touch "{calls}/render"
fi
exit 0
"""

STUB_AGENT_MSG = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "{calls}/agent-msg"
exit 0
"""

STUB_DOCTOR = """#!/usr/bin/env bash
touch "{calls}/doctor"
exit 0
"""


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def env_setup(repo_root: Path, tmp_path: Path, monkeypatch):
    heal = repo_root / "scripts" / "mcp-gateway" / "token-drift-heal.sh"
    fakehome = tmp_path / "fakehome"
    calls = tmp_path / "calls"
    bin_dir = tmp_path / "bin"
    (fakehome / ".config" / "bge-mcp").mkdir(parents=True)
    (fakehome / ".config" / "mcp-postgres").mkdir(parents=True)
    calls.mkdir()
    bin_dir.mkdir()

    for name, body in (("systemctl", STUB_SYSTEMCTL), ("mcp-sync-stub.sh", STUB_SYNC),
                       ("agent-msg-stub.sh", STUB_AGENT_MSG), ("doctor-stub.sh", STUB_DOCTOR)):
        stub = bin_dir / name
        stub.write_text(body.replace("{calls}", str(calls)), encoding="utf-8")
        os.chmod(stub, 0o755)

    class E:
        pass

    e = E()
    e.heal = heal
    e.fakehome = fakehome
    e.calls = calls
    e.bin = bin_dir
    e.live = tmp_path / "live.env"
    e.server_env = fakehome / ".config" / "bge-mcp" / "server.env"
    return e


@pytest.fixture
def heal_run(run_cmd, env_setup):
    def _run(*args: str):
        env = {
            "HOME": str(env_setup.fakehome),
            "MCP_LIVE_SECRET_FILE": str(env_setup.live),
            "MCP_SYNC_SCRIPT": str(env_setup.bin / "mcp-sync-stub.sh"),
            "AGENT_MSG_SCRIPT": str(env_setup.bin / "agent-msg-stub.sh"),
            "MCP_DOCTOR_SCRIPT": str(env_setup.bin / "doctor-stub.sh"),
            "PATH": f"{env_setup.bin}{os.pathsep}{os.environ.get('PATH', '')}",
        }
        return run_cmd(["bash", str(env_setup.heal), *args], env=env)

    return _run


def test_t1a_match_identical_fingerprints_exit_0_report_match_touch_nothing(env_setup, heal_run):
    """T1a Match: identical fingerprints exit 0, report match, touch nothing"""
    token = "live-token-aaa-111"
    env_setup.live.write_text(f"BGE_MCP_TOKEN={token}\n", encoding="utf-8")
    env_setup.server_env.write_text(f"BGE_MCP_TOKEN={token}\n", encoding="utf-8")
    mtime_before = int(env_setup.server_env.stat().st_mtime)

    result = heal_run("check")

    assert result.returncode == 0, result.output
    # Positiv-Anker zuerst.
    assert "match" in result.output
    assert "BGE_MCP_TOKEN" in result.output
    # Kein Hook lief, Datei unveraendert.
    assert not (env_setup.calls / "render").exists()
    assert not (env_setup.calls / "restart-bge-mcp").exists()
    assert int(env_setup.server_env.stat().st_mtime) == mtime_before
    # Negativ: Token-Wert nie im Output.
    assert token not in result.output


def test_t1b_drift_differing_fingerprints_exit_non_zero_report_drift_with_key_name_only(env_setup, heal_run):
    """T1b Drift: differing fingerprints exit non-zero, report drift with key name only"""
    live = "live-token-bbb-222"
    stale = "stale-token-ccc-333"
    env_setup.live.write_text(f"BGE_MCP_TOKEN={live}\n", encoding="utf-8")
    env_setup.server_env.write_text(f"BGE_MCP_TOKEN={stale}\n", encoding="utf-8")

    result = heal_run("check")

    assert result.returncode != 0
    assert "drift" in result.output
    assert "BGE_MCP_TOKEN" in result.output
    assert live not in result.output
    assert stale not in result.output


def test_t1c_cluster_unreachable_unreadable_live_secret_reports_skip_exits_0_heals_nothing(env_setup, heal_run):
    """T1c Cluster-unreachable: unreadable live secret reports skip, exits 0, heals nothing"""
    stale = "stale-token-ddd-444"
    env_setup.server_env.write_text(f"BGE_MCP_TOKEN={stale}\n", encoding="utf-8")
    # Kein live.env angelegt: Live-Secret nicht lesbar.
    sum_before = _sha(env_setup.server_env)

    result = heal_run("check")

    assert result.returncode == 0, result.output
    assert "skip" in result.output
    assert not (env_setup.calls / "render").exists()
    assert not (env_setup.calls / "restart-bge-mcp").exists()
    assert _sha(env_setup.server_env) == sum_before
    assert stale not in result.output


def test_t2a_drift_triggers_full_heal_server_env_rewritten_mode_600_render_unit_hooks_ran_others_did_not(
    env_setup, heal_run
):
    """T2a Drift triggers full heal: server.env rewritten mode 600, render+unit hooks ran, others did not"""
    newval = "live-token-eee-555"
    oldval = "stale-token-fff-666"
    env_setup.live.write_text(f"BGE_MCP_TOKEN={newval}\n", encoding="utf-8")
    env_setup.server_env.write_text(f"# keep-me=yes\nBGE_MCP_TOKEN={oldval}\nOTHER=untouched\n", encoding="utf-8")

    result = heal_run("heal")

    assert result.returncode == 0, result.output
    assert "BGE_MCP_TOKEN" in result.output
    content = env_setup.server_env.read_text(encoding="utf-8")
    assert newval in content
    assert "OTHER=untouched" in content
    assert oct(env_setup.server_env.stat().st_mode & 0o777)[2:] == "600"
    assert (env_setup.calls / "render").exists()
    assert (env_setup.calls / "restart-bge-mcp").exists()
    assert not (env_setup.calls / "restart-mcp-postgres-local").exists()
    assert newval not in result.output
    assert oldval not in result.output


def test_t2b_no_drift_heal_is_a_total_no_op(env_setup, heal_run):
    """T2b No drift: heal is a total no-op"""
    token = "live-token-ggg-777"
    env_setup.live.write_text(f"BGE_MCP_TOKEN={token}\n", encoding="utf-8")
    env_setup.server_env.write_text(f"BGE_MCP_TOKEN={token}\n", encoding="utf-8")
    sum_before = _sha(env_setup.server_env)

    result = heal_run("heal")

    assert result.returncode == 0, result.output
    assert "match" in result.output
    assert not (env_setup.calls / "render").exists()
    assert not (env_setup.calls / "restart-bge-mcp").exists()
    assert _sha(env_setup.server_env) == sum_before
    assert token not in result.output


def test_t2c_heal_notifies_about_the_required_harness_restart(env_setup, heal_run):
    """T2c Heal notifies about the required harness restart"""
    newval = "live-token-hhh-888"
    env_setup.live.write_text(f"BGE_MCP_TOKEN={newval}\n", encoding="utf-8")
    env_setup.server_env.write_text("BGE_MCP_TOKEN=stale-token-iii-999\n", encoding="utf-8")

    result = heal_run("heal")

    assert result.returncode == 0, result.output
    msg_file = env_setup.calls / "agent-msg"
    assert msg_file.is_file()
    note = msg_file.read_text(encoding="utf-8")
    assert "BGE_MCP_TOKEN" in note
    assert "harness" in note.lower()
    assert "start" in note.lower()
    assert newval not in note
    assert newval not in result.output
