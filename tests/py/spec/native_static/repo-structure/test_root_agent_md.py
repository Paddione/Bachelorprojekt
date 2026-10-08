"""Native pytest migration of tests/spec/repo-structure/root-agent-md.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_qwen_md_zeiger_auf_claude_md_statt_kontext_duplikat_2(repo_root, run_cmd, tmp_path):
    'QWEN.md: Zeiger auf CLAUDE.md statt Kontext-Duplikat'
    assert Path('QWEN.md').is_file()
    result = run_cmd(['grep', '-qF', 'CLAUDE.md', 'QWEN.md'])
    assert result.returncode == 0, result.output
