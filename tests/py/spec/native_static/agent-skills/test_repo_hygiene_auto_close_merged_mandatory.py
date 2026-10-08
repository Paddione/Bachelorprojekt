"""Native pytest migration of tests/spec/agent-skills/repo-hygiene-auto-close-merged-mandatory.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_repo_hygiene_ops_md_ist_ein_symlink_auf_die_opencode_quelle_beide_spiegel_geteilt_1(repo_root, run_cmd, tmp_path):
    'repo-hygiene-ops.md ist ein Symlink auf die opencode-Quelle (beide Spiegel geteilt)'
    assert Path(str(repo_root) + '/.claude/skills/references').is_symlink()
