"""tests/py/evals/test_main_commit_guard.py — Migration of tests/evals/main-commit-guard.bats."""
import re
from pathlib import Path
import pytest


@pytest.fixture
def pre_commit_hook(repo_root: Path) -> Path:
    hook = repo_root / ".githooks" / "pre-commit"
    assert hook.is_file(), f"MISSING hook: {hook}"
    return hook


def get_guard_block(hook: Path) -> str:
    content = hook.read_text(encoding="utf-8")
    match = re.search(r"main-commit-guard.*?^\s*fi\b", content, re.MULTILINE | re.DOTALL)
    assert match, "Could not extract main-commit-guard block from .githooks/pre-commit"
    return match.group(0)


def test_t002631_pre_commit_hook_contains_main_commit_guard(pre_commit_hook: Path):
    """pre-commit hook contains a guard against commits on main branch."""
    content = pre_commit_hook.read_text(encoding="utf-8")
    assert re.search(r"main-commit-guard|SKIP_MAIN_COMMIT_GUARD|MAIN_COMMIT_GUARD", content)


def test_t002631_main_commit_guard_checks_for_main_and_master(pre_commit_hook: Path):
    """main-commit-guard checks for main and master branch names."""
    guard_block = get_guard_block(pre_commit_hook)
    assert re.search(r'"main"|"master"', guard_block)


def test_t002631_main_commit_guard_supports_skip_bypass(pre_commit_hook: Path):
    """main-commit-guard supports SKIP_MAIN_COMMIT_GUARD bypass."""
    content = pre_commit_hook.read_text(encoding="utf-8")
    assert "SKIP_MAIN_COMMIT_GUARD" in content


def test_t002631_main_commit_guard_allows_ci_automation(pre_commit_hook: Path):
    """main-commit-guard allows CI automation (CI or GITHUB_ACTIONS env)."""
    guard_block = get_guard_block(pre_commit_hook)
    assert re.search(r"CI|GITHUB_ACTIONS", guard_block)


def test_t002631_main_commit_guard_directs_agent_to_proper_workflow(pre_commit_hook: Path):
    """main-commit-guard error message directs agent to worktree+branch+ticket+PR workflow."""
    guard_block = get_guard_block(pre_commit_hook)
    assert re.search(r"worktree|branch|ticket|PR|pull\.request", guard_block, re.IGNORECASE)
