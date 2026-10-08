"""Native pytest migration of tests/spec/llm-local-dev/opencode-compaction.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_compaction_block_auto_true_1(repo_root, run_cmd, tmp_path):
    'compaction block: auto true'
    result = run_cmd(['grep', '-qF', '"auto": true', str(repo_root) + '/.opencode/opencode.jsonc'])
    assert result.returncode == 0, result.output


def test_compaction_block_keep_tokens_16000_2(repo_root, run_cmd, tmp_path):
    'compaction block: keep.tokens 16000'
    result = run_cmd(['grep', '-qF', '"keep": { "tokens": 16000 }', str(repo_root) + '/.opencode/opencode.jsonc'])
    assert result.returncode == 0, result.output


def test_compaction_block_buffer_33600_3(repo_root, run_cmd, tmp_path):
    'compaction block: buffer 33600'
    result = run_cmd(['grep', '-qF', '"buffer": 33600', str(repo_root) + '/.opencode/opencode.jsonc'])
    assert result.returncode == 0, result.output


def test_compaction_block_threshold_math_comment_6(repo_root, run_cmd, tmp_path):
    'compaction block: threshold math comment'
    result = run_cmd(['grep', '-qF', '153600 − max(8192, 33600) = 120000', str(repo_root) + '/.opencode/opencode.jsonc'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '153600 − 33600 = 120000', str(repo_root) + '/.opencode/opencode.jsonc'])
    assert result.returncode == 0, result.output
