"""Tests for dev-flow-execute (migrated from tests/spec/dev-flow-execute.bats)."""

from pathlib import Path
import re
import pytest


def test_t002352_m1_worktree_cleanup_not_in_implementer_step(repo_root: Path):
    skill = repo_root / ".agents" / "skills" / "dev-flow-execute" / "SKILL.md"
    content = skill.read_text()
    assert "git worktree remove" not in content

    phases = repo_root / ".claude" / "skills" / "references" / "dev-flow-execute-phases.md"
    assert not re.search(r"cd [^&]+ && .+ \|\|", phases.read_text())

    step2 = re.search(r"^## Schritt 2:(.*?)(^## |\Z)", content, re.M | re.S)
    assert step2 is not None
    impl_section = step2.group(1)
    assert not re.search(r"(worktree.*(remov|clean|delet|lösch)|\.worktrees.*rm|branch -D)", impl_section, re.I)


def test_t002352_m3_freshness_check_messages(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.quality.yml"
    content = taskfile.read_text()

    # extract for loop body
    loop_match = re.search(r"for f in \$FILES; do(.*?)if \[ \$ERRORS -gt 0 \]; then", content, re.S)
    assert loop_match is not None
    loop_body = loop_match.group(1)
    assert "is stale" not in loop_body

    assert "regenerated but not staged" in content
    assert "staged but not committed" in content
    assert "run 'git add" in content
