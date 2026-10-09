import os
import sys
from pathlib import Path
import pytest

_repo_root = Path(__file__).resolve().parents[3]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from scripts.devflow_ci_watch import (
    extract_repo_from_url,
    resolve_ticket_sh,
    is_executable,
    get_sleep_interval,
    run_ci_watch,
    main,
)


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


def test_resolve_ticket_sh_env_var(monkeypatch, tmp_path):
    custom_ticket = tmp_path / "custom-ticket.sh"
    custom_ticket.write_text("#!/bin/sh\nexit 0\n")
    monkeypatch.setenv("TICKET_SH", str(custom_ticket))
    resolved = resolve_ticket_sh(tmp_path)
    assert resolved == custom_ticket


def test_is_executable(tmp_path):
    f = tmp_path / "test.sh"
    f.write_text("#!/bin/sh\n")
    assert not is_executable(f)
    f.chmod(0o755)
    assert is_executable(f)
    assert not is_executable(tmp_path / "nonexistent.sh")


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
