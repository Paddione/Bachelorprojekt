"""Tests for dev-flow-chore and ticket-ops mishaps (migrated from tests/spec/dev-flow-chore-ticket-ops-mishaps.bats)."""

from pathlib import Path
import re


def test_t001210_dev_flow_chore_git_crypt_and_staging(repo_root: Path):
    chore_skill = repo_root / ".claude" / "skills" / "dev-flow-chore" / "SKILL.md"
    git_skill = repo_root / ".claude" / "skills" / "git-workflow" / "SKILL.md"

    assert chore_skill.is_file()
    assert git_skill.is_file()

    # no bare git add -A
    assert not re.search(r"^\s*git add -A\s*$", chore_skill.read_text(), re.M)

    # secret-in-index guard reference
    assert "git-crypt-Staging-Guard [T001210]" in chore_skill.read_text()
    assert "environments/.secrets" in git_skill.read_text()

    # guard position between step 4 and step 5
    lines = chore_skill.read_text().splitlines()
    step4_idx = next(i for i, line in enumerate(lines) if line.startswith("## Schritt 4"))
    step5_idx = next(i for i, line in enumerate(lines) if line.startswith("## Schritt 5"))
    guard_idx = next(
        i
        for i, line in enumerate(lines)
        if i > step4_idx and i < step5_idx and "git-crypt-Staging-Guard [T001210]" in line
    )
    assert step4_idx < guard_idx < step5_idx


def test_t001210_ticket_ops_title_dedupe_guard(repo_root: Path):
    ticket_skill = repo_root / ".claude" / "skills" / "ticket-ops" / "SKILL.md"
    repo_hygiene = repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md"

    assert ticket_skill.is_file()
    assert repo_hygiene.is_file()

    assert re.search(r"dedupe-guard", ticket_skill.read_text(), re.I)

    lines = repo_hygiene.read_text().splitlines()
    step4_idx = next(i for i, line in enumerate(lines) if re.match(r"^##\s+4\.\s+", line))
    keyword_idx = next(
        i
        for i, line in enumerate(lines)
        if i > step4_idx
        and re.search(r"dedup|deduplicate|duplicate ticket|same title", line, re.I)
    )
    assert keyword_idx > step4_idx

    ref_idx = next(
        i for i, line in enumerate(lines) if i > step4_idx and re.search(r"T001147|T001148", line)
    )
    assert ref_idx > step4_idx
