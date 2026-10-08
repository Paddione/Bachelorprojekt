"""Native pytest migration of tests/spec/application-pipeline/render-cli.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t900230_render_sh_exists_and_is_executable_3(repo_root, run_cmd, tmp_path):
    'T900230: render.sh exists and is executable'
    path__render_sh = str(repo_root) + '/scripts/vda/apply/render.sh'
    assert Path(path__render_sh).is_file()
    assert os.access(Path(path__render_sh), os.X_OK)


def test_t900230_render_sh_references_output_dossiers_as_default_output_dir_5(repo_root, run_cmd, tmp_path):
    'T900230: render.sh references .output/dossiers/ as default output dir'
    path__render_sh = str(repo_root) + '/scripts/vda/apply/render.sh'
    result = run_cmd(['grep', '-q', '\\.output/dossiers', path__render_sh])
    assert result.returncode == 0, result.output
