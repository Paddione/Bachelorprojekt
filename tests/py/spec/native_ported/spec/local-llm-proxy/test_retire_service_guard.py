"""Native migration of tests/spec/local-llm-proxy/retire-service-guard.bats."""

# [T900213]

import os
import stat
from pathlib import Path

import pytest

STUB_HAPPY = """#!/usr/bin/env bash
echo "$@" >> "$SYSTEMCTL_LOG"
case "$*" in
  *"is-active"*) exit 0 ;;
  *"is-enabled"*) exit 0 ;;
  *"stop"*) exit 0 ;;
  *"disable"*) exit 0 ;;
esac
"""

STUB_IDEMPOTENT = """#!/usr/bin/env bash
echo "$@" >> "$SYSTEMCTL_LOG"
case "$*" in
  *"is-active"*) exit 1 ;;
  *"is-enabled"*) exit 1 ;;
  *"stop"*) echo "FEHLER: stop gerufen" >&2; exit 2 ;;
  *"disable"*) echo "FEHLER: disable gerufen" >&2; exit 2 ;;
esac
"""


@pytest.fixture
def retire(repo_root, tmp_path):
    script = repo_root / "scripts/llm-proxy/retire-service.sh"
    tmp_bin = tmp_path / "bin"
    tmp_bin.mkdir()
    log = tmp_path / "systemctl.log"
    return {"script": script, "bin": tmp_bin, "log": log}


def _install_stub(ctx, body):
    stub = ctx["bin"] / "systemctl"
    stub.write_text(body, encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def test_retire_service_guard_retire_service_sh_existiert_und_ist_ausfuehrbar(retire):
    assert retire["script"].is_file()
    assert os.access(retire["script"], os.X_OK)


def test_retire_service_guard_retire_service_sh_verweigert_ohne_confirm_exit_2(run_cmd, repo_root, retire):
    res = run_cmd(["bash", str(retire["script"])], cwd=repo_root)
    assert res.returncode == 2
    assert "Usage: " in res.output


def test_retire_service_guard_retire_service_sh_verweigert_unter_ci_true_exit_1(run_cmd, repo_root, retire):
    res = run_cmd(["bash", str(retire["script"]), "--confirm"], cwd=repo_root, env={"CI": "true"})
    assert res.returncode == 1
    assert "Verweigerung unter CI" in res.output


def test_retire_service_guard_retire_service_sh_happy_path_fuehrt_stop_und_disable_in_reihenfolge_aus(run_cmd, repo_root, retire):
    _install_stub(retire, STUB_HAPPY)
    retire["log"].write_text("", encoding="utf-8")
    res = run_cmd(
        ["bash", str(retire["script"]), "--confirm"], cwd=repo_root,
        env={"PATH": f"{retire['bin']}:{os.environ['PATH']}", "SYSTEMCTL_LOG": str(retire["log"]),
             "CI": "", "GITHUB_ACTIONS": ""},
    )
    assert res.returncode == 0, res.output
    lines = retire["log"].read_text(encoding="utf-8").splitlines()
    stop_line = next((i for i, l in enumerate(lines, 1) if "stop" in l), None)
    disable_line = next((i for i, l in enumerate(lines, 1) if "disable" in l), None)
    assert stop_line is not None
    assert disable_line is not None
    assert stop_line < disable_line


def test_retire_service_guard_retire_service_sh_ist_idempotent_bei_bereits_gestopptem_service(run_cmd, repo_root, retire):
    _install_stub(retire, STUB_IDEMPOTENT)
    retire["log"].write_text("", encoding="utf-8")
    res = run_cmd(
        ["bash", str(retire["script"]), "--confirm"], cwd=repo_root,
        env={"PATH": f"{retire['bin']}:{os.environ['PATH']}", "SYSTEMCTL_LOG": str(retire["log"]),
             "CI": "", "GITHUB_ACTIONS": ""},
    )
    assert res.returncode == 0, res.output
    assert "bereits inaktiv und deaktiviert" in res.output
    log_text = retire["log"].read_text(encoding="utf-8")
    assert not any(("stop" in l or "disable" in l) for l in log_text.splitlines())
