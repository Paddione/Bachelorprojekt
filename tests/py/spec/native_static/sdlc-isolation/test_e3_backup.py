"""Native pytest migration of tests/spec/sdlc-isolation/e3-backup.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_e3_backup_timer_ist_taeglich_und_holt_ausfaelle_nach_7(repo_root, run_cmd, tmp_path):
    'E3-Backup: Timer ist taeglich und holt Ausfaelle nach'
    path_backup = str(repo_root) + '/scripts/sdlc/backup-tickets.sh'
    path_migrate = str(repo_root) + '/scripts/sdlc/migrate-tickets.sh'
    path_timer = str(repo_root) + '/scripts/sdlc/sdlc-backup.timer'
    assert Path(path_timer).is_file()
    result = run_cmd(['grep', '-q', 'OnCalendar=', path_timer])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'Persistent=true', path_timer])
    assert result.returncode == 0, result.output


def test_e3_backup_unit_ruft_den_run_unterbefehl_auf_8(repo_root, run_cmd, tmp_path):
    'E3-Backup: Unit ruft den run-Unterbefehl auf'
    path_backup = str(repo_root) + '/scripts/sdlc/backup-tickets.sh'
    path_migrate = str(repo_root) + '/scripts/sdlc/migrate-tickets.sh'
    path_unit = str(repo_root) + '/scripts/sdlc/sdlc-backup.service'
    assert Path(path_unit).is_file()
    result = run_cmd(['grep', '-q', 'backup-tickets.sh run', path_unit])
    assert result.returncode == 0, result.output
