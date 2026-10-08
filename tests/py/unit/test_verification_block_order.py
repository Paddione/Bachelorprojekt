"""Tests for verification block ordering documentation (migrated from tests/unit/verification-block-order.bats)."""

from pathlib import Path


def test_verification_block_md_exists(repo_root: Path):
    ref_file = repo_root / ".claude" / "skills" / "references" / "verification-block.md"
    assert ref_file.is_file()


def test_regenerate_comes_before_check_in_four_command_list(repo_root: Path):
    ref_file = repo_root / ".claude" / "skills" / "references" / "verification-block.md"
    lines = ref_file.read_text().splitlines()

    reg_indices = [i for i, line in enumerate(lines) if "task freshness:regenerate" in line]
    check_indices = [i for i, line in enumerate(lines) if "task freshness:check" in line]

    assert reg_indices, "task freshness:regenerate not found"
    assert check_indices, "task freshness:check not found"
    assert reg_indices[0] < check_indices[0]


def test_commit_step_documented_between_regenerate_and_check(repo_root: Path):
    ref_file = repo_root / ".claude" / "skills" / "references" / "verification-block.md"
    lines = ref_file.read_text().splitlines()

    reg_indices = [i for i, line in enumerate(lines) if "task freshness:regenerate" in line]
    assert reg_indices, "task freshness:regenerate not found"
    reg_line = reg_indices[0]

    # Search next 15 lines for commit / git add
    region = "\n".join(lines[reg_line + 1 : reg_line + 16])
    assert any(needle in region for needle in ["commit", "committ", "git add"]), (
        f"No commit step found between regenerate and check in lines {reg_line+1}–{reg_line+16}:\n{region}"
    )
