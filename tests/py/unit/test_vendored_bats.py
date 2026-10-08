"""Regression guard for T002135 (migrated from tests/unit/vendored-bats.bats)."""

import os
from pathlib import Path
import subprocess


def test_no_gitmodules(repo_root: Path):
    assert not (repo_root / ".gitmodules").exists()


def test_no_gitlink_entries_in_index(repo_root: Path):
    res = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--stage"],
        capture_output=True,
        text=True,
        check=True,
    )
    gitlinks = [line for line in res.stdout.splitlines() if line.startswith("160000")]
    assert len(gitlinks) == 0, f"Found gitlinks in index: {gitlinks}"


def test_bats_libs_are_tracked_regular_files(repo_root: Path):
    res = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--", "tests/unit/lib/bats-core"],
        capture_output=True,
        text=True,
        check=True,
    )
    tracked_count = len(res.stdout.splitlines())
    assert tracked_count > 0, "No tracked files found under tests/unit/lib/bats-core"

    assert (repo_root / "tests/unit/lib/bats-core/bin/bats").is_file()
    assert os.access(repo_root / "tests/unit/lib/bats-core/bin/bats", os.X_OK)
    assert (repo_root / "tests/unit/lib/bats-support/load.bash").is_file()
    assert (repo_root / "tests/unit/lib/bats-assert/load.bash").is_file()
    assert (repo_root / "tests/unit/lib/bats-file/load.bash").is_file()
