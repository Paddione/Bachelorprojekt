"""Native pytest migration of tests/spec/dev-flow-plan/skill-worktree-create-aufruf.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_skill_md_nennt_die_zwei_argument_form_von_worktree_create_sh_1(repo_root, run_cmd, tmp_path):
    'SKILL.md nennt die Zwei-Argument-Form von worktree-create.sh'
    path_skill_md = str(repo_root) + '/.claude/skills/dev-flow-plan/SKILL.md'
    result = run_cmd(['grep', '-n', 'worktree-create.sh <branch> <path>', path_skill_md])
    assert result.returncode == 0, result.output
    assert result.output


def test_skill_md_zeigt_worktree_create_sh_nicht_mit_branch_ohne_path_2(repo_root, run_cmd, tmp_path):
    'SKILL.md zeigt worktree-create.sh nicht mit <branch> ohne <path>'
    path_skill_md = str(repo_root) + '/.claude/skills/dev-flow-plan/SKILL.md'
    result = run_cmd(['grep', '-nE', 'worktree-create\\.sh[^<]*<branch>[^<]*$', path_skill_md])
    assert result.returncode == 1, result.output
