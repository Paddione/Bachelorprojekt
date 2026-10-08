"""Native pytest migration of tests/spec/agent-skills/executor-post-merge-death.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t006284_skill_referenziert_scripts_devflow_post_merge_finalize_sh_3(repo_root, run_cmd, tmp_path):
    'T006284: Skill referenziert scripts/devflow-post-merge-finalize.sh'
    path_skill = str(repo_root) + '/.claude/skills/dev-flow-execute/SKILL.md'
    path_finalize = str(repo_root) + '/scripts/devflow-post-merge-finalize.sh'
    result = run_cmd(['grep', '-qF', 'devflow-post-merge-finalize.sh', path_skill])
    assert result.returncode == 0, result.output


def test_t006284_finalize_skript_existiert_und_help_endet_mit_exit_0_4(repo_root, run_cmd, tmp_path):
    'T006284: Finalize-Skript existiert und --help endet mit Exit 0'
    path_skill = str(repo_root) + '/.claude/skills/dev-flow-execute/SKILL.md'
    path_finalize = str(repo_root) + '/scripts/devflow-post-merge-finalize.sh'
    assert Path(path_finalize).is_file()
    result = run_cmd(['bash', path_finalize, '--help'])
    assert result.returncode == 0, result.output
    assert result.output


def test_t006284_finalize_skript_ohne_ticket_id_endet_mit_exit_ungleich_0_5(repo_root, run_cmd, tmp_path):
    'T006284: Finalize-Skript ohne Ticket-ID endet mit Exit ungleich 0'
    path_skill = str(repo_root) + '/.claude/skills/dev-flow-execute/SKILL.md'
    path_finalize = str(repo_root) + '/scripts/devflow-post-merge-finalize.sh'
    assert Path(path_finalize).is_file()
    result = run_cmd(['bash', path_finalize])
    assert result.returncode != 0, result.output
