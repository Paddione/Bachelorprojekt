"""Native migration of tests/spec/sdlc-isolation/e3-backup.bats."""
import re
from pathlib import Path

BACKUP = "scripts/sdlc/backup-tickets.sh"
MIGRATE = "scripts/sdlc/migrate-tickets.sh"


def test_e3_backup_sichert_vom_lokalen_cluster_nach_fleet(run_cmd, repo_root):
    res = run_cmd(["bash", BACKUP, "run", "--dry-run"], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    assert "devmesh" in res.output
    assert "-> fleet:" in res.output


def test_e3_backup_verschluesselt_bevor_etwas_fleet_erreicht(run_cmd, repo_root):
    res = run_cmd(["bash", BACKUP, "run", "--dry-run"], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    assert "openssl enc -aes-256-cbc" in res.output


def test_e3_backup_aufbewahrungsfrist_ist_konfigurierbar_und_wird_genannt(run_cmd, repo_root):
    res = run_cmd(
        ["bash", BACKUP, "run", "--dry-run"],
        cwd=repo_root,
        env={"SDLC_BACKUP_RETENTION_DAYS": "7"},
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert "7 Tage" in res.output


def test_e3_backup_restore_check_ist_als_eigener_befehl_vorhanden(run_cmd, repo_root):
    res = run_cmd(["bash", BACKUP, "restore-check", "--dry-run"], cwd=repo_root, timeout=300)
    assert res.returncode == 0, res.output
    assert "Wegwerf-DB" in res.output


def test_e3_migration_restore_ohne_dump_bricht_ab_statt_stillzuhalten(run_cmd, repo_root, tmp_path):
    res = run_cmd(
        ["bash", MIGRATE, "restore"],
        cwd=repo_root,
        env={"SDLC_DUMP_DIR": str(tmp_path / "leer")},
        timeout=300,
    )
    assert res.returncode != 0, res.output
    assert "kein Dump gefunden" in res.output


def test_e3_migration_preflight_meldet_ein_nicht_erreichbares_ziel_als_fehler(run_cmd, repo_root):
    res = run_cmd(
        ["bash", MIGRATE, "preflight"],
        cwd=repo_root,
        env={"SDLC_DST_CTX": "gibt-es-nicht"},
        timeout=300,
    )
    assert res.returncode != 0, res.output
    assert "gibt-es-nicht" in res.output


def test_e3_backup_timer_ist_taeglich_und_holt_ausfaelle_nach(repo_root):
    timer = repo_root / "scripts/sdlc/sdlc-backup.timer"
    assert timer.is_file()
    text = timer.read_text(encoding="utf-8")
    assert "OnCalendar=" in text
    assert "Persistent=true" in text


def test_e3_backup_unit_ruft_den_run_unterbefehl_auf(repo_root):
    unit = repo_root / "scripts/sdlc/sdlc-backup.service"
    assert unit.is_file()
    assert "backup-tickets.sh run" in unit.read_text(encoding="utf-8")
