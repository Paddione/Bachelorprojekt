"""tests/py/evals/test_task_list_golden.py — Migration of tests/evals/task-list-golden.bats."""
import shutil
from pathlib import Path
import pytest


def test_task_list_golden_committed_snapshot_exists(repo_root: Path):
    """task-list-golden: committed snapshot exists and is non-empty."""
    golden = repo_root / "tests" / "evals" / "golden" / "task-list-all.txt"
    assert golden.is_file(), f"MISSING golden: {golden}"
    assert golden.stat().st_size > 0, f"EMPTY golden: {golden}"


def test_task_list_golden_matches_byte_for_byte(repo_root: Path, run_cmd):
    """task-list-golden: task --list-all matches the snapshot byte-for-byte."""
    golden = repo_root / "tests" / "evals" / "golden" / "task-list-all.txt"
    assert golden.is_file(), f"MISSING golden: {golden}"

    if not shutil.which("task"):
        pytest.fail("MISSING task binary (repo prerequisite)")

    res = run_cmd("task --list-all --color=false", cwd=repo_root)
    res.check(0)

    expected = golden.read_text(encoding="utf-8")
    actual = res.stdout
    assert actual == expected, (
        "CLI surface drifted from golden. If intentional, refresh via:\n"
        "  task test:evals:update   # state the reason in the PR body"
    )
