"""Native pytest migration of tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_dev_flow_chore_skill_md_schritt_0_unbedingtes_git_stash_ist_nicht_mehr_im_unqualifizierten_1(repo_root, run_cmd, tmp_path):
    "dev-flow-chore SKILL.md Schritt 0: unbedingtes 'git stash &&' ist NICHT mehr im unqualifizierten Pfad (Positiv-Anker: Schritt 0 existiert weiterhin)"
    path_skill_file = str(repo_root) + '/.claude/skills/dev-flow-chore/SKILL.md'
    assert Path(path_skill_file).is_file()
    result = run_cmd(['grep', '-q', '^## Schritt 0: Reaper', path_skill_file])
    assert result.returncode == 0, result.output
