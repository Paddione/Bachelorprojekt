"""Native pytest migration of tests/spec/sdlc-isolation/e3-tickets-lokal.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_e3_cutover_runbook_existiert_und_benennt_die_reihenfolge_11(repo_root, run_cmd, tmp_path):
    'E3: Cutover-Runbook existiert und benennt die Reihenfolge'
    path_ticket_sh = str(repo_root) + '/scripts/ticket.sh'
    path_migrate = str(repo_root) + '/scripts/sdlc/migrate-tickets.sh'
    path_rb = str(repo_root) + '/docs/sdlc-stack/e3-cutover.md'
    assert Path(path_rb).is_file()
    result = run_cmd(['grep', '-q', 'Factory anhalten', path_rb])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'T002722', path_rb])
    assert result.returncode == 0, result.output
