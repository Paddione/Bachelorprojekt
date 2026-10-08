"""Native pytest migration of tests/spec/health-goals/goal-integrity.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_anker_die_ziel_definitionen_und_das_messskript_existieren_1(repo_root, run_cmd, tmp_path):
    'Anker: die Ziel-Definitionen und das Messskript existieren'
    path_check = str(repo_root) + '/scripts/health-goals-check.sh'
    path_goals = str(repo_root) + '/.claude/lib/goals.md'
    assert Path(path_goals).is_file()
    assert Path(path_check).is_file()
