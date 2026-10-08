"""Native pytest migration of tests/spec/sdlc-isolation/sdlc-up-command.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_health_gate_sh_script_file_exists_9(repo_root, run_cmd, tmp_path):
    'health-gate.sh script file exists'
    path_task = 'task'
    path_health_gate = str(repo_root) + '/scripts/sdlc/health-gate.sh'
    assert Path(path_health_gate).is_file()
    assert os.access(Path(path_health_gate), os.X_OK)
