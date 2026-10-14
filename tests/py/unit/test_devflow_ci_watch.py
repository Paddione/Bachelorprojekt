import os
import sys
from pathlib import Path
import importlib.util
import pytest

_repo_root = Path(__file__).resolve().parents[3]
_script_path = _repo_root / "scripts" / "devflow_ci_watch.py"
_spec = importlib.util.spec_from_file_location("devflow_ci_watch", _script_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

extract_repo_from_url = _mod.extract_repo_from_url
slug_from_branch = _mod.slug_from_branch
assert_phase_log = _mod.assert_phase_log
get_sleep_interval = _mod.get_sleep_interval
run_ci_watch = _mod.run_ci_watch
main = _mod.main


def test_extract_repo_from_url():
    # Bachelorprojekt PR
    assert extract_repo_from_url("https://github.com/Paddione/Bachelorprojekt/pull/4533") == "Paddione/Bachelorprojekt"
    # dotfiles PR
    assert extract_repo_from_url("https://github.com/Paddione/dotfiles/pull/41") == "Paddione/dotfiles"
    # unsloth-boxes PR
    assert extract_repo_from_url("https://github.com/Paddione/unsloth-boxes/pull/13") == "Paddione/unsloth-boxes"
    # Fallback bei ungültiger oder leerer URL
    assert extract_repo_from_url("invalid-url") == "Paddione/Bachelorprojekt"
    assert extract_repo_from_url("") == "Paddione/Bachelorprojekt"


def test_slug_from_branch_strips_type_prefix():
    assert slug_from_branch("feature/plan-runner-live") == "plan-runner-live"
    assert slug_from_branch("fix/x-y") == "x-y"
    assert slug_from_branch("no-prefix") == "no-prefix"


def _phase_repo(monkeypatch, tmp_path, lines):
    log = tmp_path / ".agents" / "plans" / "demo" / "phase-events.log"
    if lines is not None:
        log.parent.mkdir(parents=True)
        log.write_text("".join(f"{line}\n" for line in lines))
    answers = {"gh": "feature/demo\n", "git": f"{tmp_path}\n"}
    monkeypatch.setattr(_mod, "run_cmd", lambda args, **_: _mod.subprocess.CompletedProcess(args, 0, answers[args[0]], ""))


def test_assert_phase_log_complete_chain_is_green(monkeypatch, tmp_path):
    _phase_repo(monkeypatch, tmp_path, ["plan done", "implement entered", "verify done"])
    assert assert_phase_log("https://github.com/x/y/pull/1") == (True, 0)


def test_assert_phase_log_missing_phase_or_log_is_exit_6(monkeypatch, tmp_path, capsys):
    _phase_repo(monkeypatch, tmp_path, ["plan done", "implement entered"])
    assert assert_phase_log("https://github.com/x/y/pull/1") == (False, 6)
    assert "verify done" in capsys.readouterr().err
    _phase_repo(monkeypatch, tmp_path / "other", None)
    assert assert_phase_log("https://github.com/x/y/pull/1") == (False, 6)


def test_get_sleep_interval(monkeypatch):
    # Standard-Verhalten
    monkeypatch.delenv("CI_WATCH_SLEEP", raising=False)
    monkeypatch.delenv("CI_POLL_SLEEP", raising=False)
    monkeypatch.delenv("MARKER_DIR", raising=False)
    assert get_sleep_interval(15) == 15.0

    # Override via CI_WATCH_SLEEP
    monkeypatch.setenv("CI_WATCH_SLEEP", "0.2")
    assert get_sleep_interval(15) == 0.2

    # Override via MARKER_DIR
    monkeypatch.delenv("CI_WATCH_SLEEP", raising=False)
    monkeypatch.setenv("MARKER_DIR", "/some/dir")
    assert get_sleep_interval(15) == 0.05


def test_main_missing_args(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["devflow_ci_watch.py"])
    exit_code = main()
    assert exit_code == 2
    captured = capsys.readouterr()
    assert "usage: devflow-ci-watch.sh" in captured.err
