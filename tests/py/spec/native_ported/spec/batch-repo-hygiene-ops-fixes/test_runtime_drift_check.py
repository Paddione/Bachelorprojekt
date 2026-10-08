"""Native migration of tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats."""

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


def _drift_probe(tmp_path: Path, name: str):
    """Start a probe, delete its file (deleted-inode state) and write a registry for it."""
    probe_bin = tmp_path / name
    proc = _start_probe(probe_bin)
    time.sleep(0.3)
    registry = tmp_path / "registry.yaml"
    registry.write_text(
        f"clients:\n  {name}:\n    transport: stdio\n    command: {probe_bin}\n",
        encoding="utf-8",
    )
    return proc, probe_bin, registry


def test_t003825_runtime_drift_check_sh_existiert_und_ist_ausfuehrbar(guard):
    """T003825: runtime-drift-check.sh existiert und ist ausfuehrbar"""
    assert os.access(guard, os.X_OK)


def test_t003825_guard_laeuft_ohne_argumente_durch_und_liefert_einen_exit_status(guard, run_cmd):
    """T003825: Guard laeuft ohne Argumente durch und liefert einen Exit-Status"""
    result = run_cmd([str(guard)], timeout=300)
    # 0 = kein Drift, 1 = Drift. Alles andere ist ein Guard-Defekt.
    assert result.returncode in (0, 1)
    assert result.output


def test_t003825_prozess_mit_ersetzter_binary_wird_mit_seiner_pid_gemeldet_exit_1(
    tmp_path, guard, run_cmd
):
    """T003825: Prozess mit ersetzter Binary wird mit seiner PID gemeldet, Exit 1"""
    proc = None
    try:
        proc, probe_bin, registry = _drift_probe(tmp_path, "drift-probe")
        os.remove(probe_bin)
        if not _exe_is_deleted(proc.pid):
            pytest.skip("(deleted)-Zustand auf diesem Kernel nicht herstellbar")

        result = run_cmd([str(guard)], env={"RUNTIME_DRIFT_REGISTRY": str(registry)}, timeout=300)
        assert result.returncode == 1
        assert str(proc.pid) in result.output
    finally:
        if proc is not None:
            _stop(proc)


def test_t003825_guard_beendet_den_driftenden_prozess_nicht(tmp_path, guard, run_cmd):
    """T003825: Guard beendet den driftenden Prozess NICHT"""
    proc = None
    try:
        proc, probe_bin, registry = _drift_probe(tmp_path, "drift-probe")
        os.remove(probe_bin)
        if not _exe_is_deleted(proc.pid):
            pytest.skip("(deleted)-Zustand auf diesem Kernel nicht herstellbar")

        result = run_cmd([str(guard)], env={"RUNTIME_DRIFT_REGISTRY": str(registry)}, timeout=300)

        # Positiv-Anker zuerst: der Guard hat den Drift gefunden.
        assert result.returncode == 1
        assert str(proc.pid) in result.output

        # Der Prozess muss den Guard ueberleben.
        assert proc.poll() is None, "Guard hat den driftenden Prozess beendet"
    finally:
        if proc is not None:
            _stop(proc)


def test_t003825_unveraenderte_binary_erzeugt_keinen_drift_befund(tmp_path, guard, run_cmd):
    """T003825: unveraenderte Binary erzeugt keinen Drift-Befund"""
    probe_bin = tmp_path / "clean-probe"
    proc = _start_probe(probe_bin)
    try:
        time.sleep(0.3)
        registry = tmp_path / "registry.yaml"
        registry.write_text(
            f"clients:\n  clean-probe:\n    transport: stdio\n    command: {probe_bin}\n",
            encoding="utf-8",
        )
        result = run_cmd([str(guard)], env={"RUNTIME_DRIFT_REGISTRY": str(registry)}, timeout=300)
        assert result.returncode == 0
        assert str(proc.pid) not in result.output
    finally:
        _stop(proc)


def test_t003825_nicht_angewendete_migration_wird_mit_funktionsnamen_gemeldet(
    tmp_path, guard, run_cmd
):
    """T003825: nicht angewendete Migration wird mit Funktionsnamen gemeldet"""
    if shutil.which("kubectl") is None or run_cmd(["kubectl", "version", "--client"]).returncode != 0:
        pytest.skip("kubectl nicht installiert")

    (tmp_path / "migration.sql").write_text(
        "-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=zzz_marker_das_nie_existiert\n"
        "SELECT 1;\n",
        encoding="utf-8",
    )
    empty_registry = tmp_path / "empty-registry.yaml"
    empty_registry.write_text("clients: {}\n", encoding="utf-8")

    result = run_cmd(
        [str(guard)],
        env={
            "RUNTIME_DRIFT_REGISTRY": str(empty_registry),
            "RUNTIME_DRIFT_MIGRATIONS": str(tmp_path),
        },
    )
    # Ohne DB-Zugriff: uebersprungen (0). Mit DB-Zugriff: Drift (1). Beides zulaessig.
    if result.returncode == 1:
        assert "fn_purge_test_data" in result.output
    else:
        assert result.returncode == 0
        assert "bersprungen" in result.output or "skip" in result.output


def test_t003825_unerreichbare_db_meldet_uebersprungen_statt_drift_exit_0(tmp_path, guard, run_cmd):
    """T003825: unerreichbare DB meldet uebersprungen statt Drift, Exit 0"""
    (tmp_path / "migration.sql").write_text(
        "-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=to_regclass\nSELECT 1;\n",
        encoding="utf-8",
    )
    empty_registry = tmp_path / "empty-registry.yaml"
    empty_registry.write_text("clients: {}\n", encoding="utf-8")

    result = run_cmd(
        [str(guard)],
        env={
            "RUNTIME_DRIFT_REGISTRY": str(empty_registry),
            "RUNTIME_DRIFT_MIGRATIONS": str(tmp_path),
            "RUNTIME_DRIFT_CTX": "kein-solcher-kontext-T003825",
        },
    )
    assert result.returncode == 0
    assert "bersprungen" in result.output or "skip" in result.output


def test_t003825_repo_hygiene_ruft_den_guard_auf(repo_root):
    """T003825: repo-hygiene ruft den Guard auf"""
    skill = repo_root / ".claude" / "skills" / "repo-hygiene" / "SKILL.md"
    count = sum(1 for line in skill.read_text(encoding="utf-8").splitlines() if "runtime-drift-check" in line)
    assert count >= 1
