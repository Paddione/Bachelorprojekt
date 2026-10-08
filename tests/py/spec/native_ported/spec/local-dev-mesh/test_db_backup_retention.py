"""Native migration of tests/spec/local-dev-mesh/db-backup-retention.bats."""

import gzip
import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def backup(repo_root, tmp_path):
    fix = tmp_path
    d = fix / "backup"
    (fix / "bin").mkdir(parents=True)
    d.mkdir()
    script = repo_root / "scripts" / "devmesh" / "db-backup.sh"
    return {"fix": fix, "d": d, "bin": fix / "bin", "script": script}


def _seed(d: Path, n: int):
    for i in range(1, n + 1):
        (d / f"shared-db-202001{i:02d}T033000Z.sql.gz").write_bytes(b"")


def _count(d: Path) -> int:
    return sum(1 for p in d.iterdir() if p.name.startswith("shared-db-") and p.name.endswith(".sql.gz"))


def _stub(path: Path, body: str):
    path.write_text(f"#!/usr/bin/env bash\n{body}\n")
    path.chmod(0o755)


def _newest(d: Path) -> str:
    return sorted(p.name for p in d.iterdir() if p.name.startswith("shared-db-") and p.name.endswith(".sql.gz"))[-1]


def _gz_contains(path: Path, needle: bytes) -> bool:
    with gzip.open(path, "rb") as fh:
        return needle in fh.read()


def _partials(d: Path):
    return [p.name for p in d.rglob("*.part")]


def test_15_dumps_pruning_behaelt_14_der_aelteste_faellt_weg(backup, run_cmd):
    d = backup["d"]
    _seed(d, 15)
    res = run_cmd(["bash", str(backup["script"]), "--prune-only"],
                  env={"BACKUP_DIR": str(d), "RETAIN": "14"})
    assert res.returncode == 0, res.output
    assert (d / "shared-db-20200115T033000Z.sql.gz").exists()
    assert _count(d) == 14
    assert not (d / "shared-db-20200101T033000Z.sql.gz").exists()


def test_voller_lauf_schreibt_einen_neuen_dump_und_haelt_14(backup, run_cmd):
    d = backup["d"]
    _seed(d, 14)
    _stub(backup["bin"] / "pg_isready", "exit 0")
    _stub(backup["bin"] / "pg_dumpall", 'echo "-- dump"')
    path = f"{backup['bin']}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(backup["script"])],
                  env={"PATH": path, "BACKUP_DIR": str(d), "RETAIN": "14"})
    assert res.returncode == 0, res.output
    assert _gz_contains(d / _newest(d), b"-- dump")
    assert _count(d) == 14


def test_scheitert_pg_dumpall_bleibt_kein_teil_dump_liegen_und_nichts_wird_geloescht(backup, run_cmd):
    d = backup["d"]
    _seed(d, 15)
    _stub(backup["bin"] / "pg_isready", "exit 0")
    _stub(backup["bin"] / "pg_dumpall", "exit 1")
    path = f"{backup['bin']}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(backup["script"])],
                  env={"PATH": path, "BACKUP_DIR": str(d), "RETAIN": "14"})
    assert res.returncode != 0
    assert _count(d) == 15
    assert _partials(d) == []


def test_t900240_wartet_auf_pg_isready_statt_beim_container_netzwerk_startup_race_sofort_zu_scheitern(backup, run_cmd):
    # Stub: pg_isready schlaegt zweimal fehl (rc=2), erst der dritte Aufruf meldet Bereitschaft (rc=0).
    d = backup["d"]
    _seed(d, 14)
    attempts = backup["fix"] / "pg_isready_attempts"
    attempts.write_text("")
    _stub(
        backup["bin"] / "pg_isready",
        f'n=$(wc -l < "{attempts}")\necho "attempt" >> "{attempts}"\nif [ "$n" -lt 2 ]; then\n  exit 2\nfi\nexit 0',
    )
    _stub(backup["bin"] / "pg_dumpall", 'echo "-- dump"')
    path = f"{backup['bin']}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(backup["script"])],
                  env={"PATH": path, "BACKUP_DIR": str(d), "RETAIN": "14", "DB_WAIT_SLEEP": "0"})
    assert res.returncode == 0, res.output
    # pg_isready wurde mindestens 3x aufgerufen (2 Fehlschlaege + 1 Erfolg)
    assert len(attempts.read_text().splitlines()) >= 3
    assert _gz_contains(d / _newest(d), b"-- dump")


def test_t900240_gibt_sauber_auf_wenn_pg_isready_dauerhaft_nicht_bereit_meldet(backup, run_cmd):
    d = backup["d"]
    _seed(d, 14)
    _stub(backup["bin"] / "pg_isready", "exit 2")
    _stub(backup["bin"] / "pg_dumpall", 'echo "-- dump"')
    path = f"{backup['bin']}:{os.environ.get('PATH', '')}"
    res = run_cmd(["bash", str(backup["script"])],
                  env={"PATH": path, "BACKUP_DIR": str(d), "RETAIN": "14",
                       "DB_WAIT_SLEEP": "0", "DB_WAIT_ATTEMPTS": "3"})
    assert res.returncode != 0
    assert _count(d) == 14
    assert _partials(d) == []
