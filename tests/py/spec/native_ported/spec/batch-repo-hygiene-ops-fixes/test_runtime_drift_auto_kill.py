"""Native migration of tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats."""

import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest


@pytest.fixture
def guard(repo_root: Path) -> Path:
    return repo_root / "scripts" / "runtime-drift-check.sh"


def _start_probe(path: Path) -> subprocess.Popen:
    shutil.copy(shutil.which("sleep"), path)
    os.chmod(path, 0o755)
    return subprocess.Popen([str(path), "60"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _exe_is_deleted(pid: int) -> bool:
    try:
        return os.readlink(f"/proc/{pid}/exe").endswith(" (deleted)")
    except OSError:
        return False


def _stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def test_t004897_auto_kill_beendet_registrierte_drift_prozesse_fremdprozesse_ueberleben_exit_0(
    tmp_path, guard, run_cmd
):
    """T004897: --auto-kill beendet registrierte Drift-Prozesse, Fremdprozesse ueberleben, Exit 0"""
    own = foreign = None
    try:
        own_bin = tmp_path / "auto-probe"
        foreign_bin = tmp_path / "foreign-probe"
        own = _start_probe(own_bin)
        foreign = _start_probe(foreign_bin)
        time.sleep(0.3)

        os.remove(own_bin)
        os.remove(foreign_bin)
        if not _exe_is_deleted(own.pid):
            pytest.skip("(deleted)-Zustand auf diesem Kernel nicht herstellbar")
        if not _exe_is_deleted(foreign.pid):
            pytest.skip("(deleted)-Zustand auf diesem Kernel nicht herstellbar")

        registry = tmp_path / "registry.yaml"
        registry.write_text(
            "clients:\n"
            "  auto-probe:\n"
            "    transport: stdio\n"
            f"    command: {own_bin}\n",
            encoding="utf-8",
        )

        result = run_cmd(
            [str(guard), "--auto-kill"],
            env={
                "RUNTIME_DRIFT_REGISTRY": str(registry),
                "RUNTIME_DRIFT_CTX": "kein-solcher-kontext-T004897",
            },
        )

        # Positiv-Anker zuerst: Guard muss den eigenen Drift gefunden und beendet haben.
        assert str(own.pid) in result.output
        assert own.poll() is not None, "registrierter Drift-Prozess lebt noch"

        # Negativ: Fremdprozess (nicht registriert) ueberlebt.
        assert foreign.poll() is None, "Fremdprozess wurde faelschlich beendet"

        assert result.returncode == 0
    finally:
        if own is not None:
            _stop(own)
        if foreign is not None:
            _stop(foreign)


def test_t004897_unbekanntes_argument_fuehrt_zu_usage_und_exit_2(guard, run_cmd):
    """T004897: unbekanntes Argument fuehrt zu Usage und Exit 2"""
    result = run_cmd([str(guard), "--does-not-exist"])
    assert result.returncode == 2
    assert "Usage" in result.output or "usage" in result.output
