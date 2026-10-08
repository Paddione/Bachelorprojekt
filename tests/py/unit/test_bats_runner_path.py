"""Tests for vendored BATS runner path documentation (migrated from tests/unit/bats-runner-path.bats)."""

import os
from pathlib import Path


CLAUDE_FILES = ["CLAUDE.md", "tests/CLAUDE.md"]
BATS_PATH = "tests/unit/lib/bats-core/bin/bats"


def test_bats_runner_path_documented(repo_root: Path):
    existing = [f for f in CLAUDE_FILES if (repo_root / f).is_file()]
    assert existing, f"None of the CLAUDE files exist: {CLAUDE_FILES}"

    found = False
    for f in existing:
        if BATS_PATH in (repo_root / f).read_text():
            found = True
            break
    assert found, f"No CLAUDE file documents BATS runner path {BATS_PATH} in {existing}"


def test_vendored_bats_runner_path_executable(repo_root: Path):
    bats_bin = repo_root / BATS_PATH
    assert bats_bin.is_file(), f"BATS runner not found: {bats_bin}"
    assert os.access(bats_bin, os.X_OK), f"BATS runner not executable: {bats_bin}"
