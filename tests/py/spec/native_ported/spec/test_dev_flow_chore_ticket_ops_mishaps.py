"""Native migration of tests/spec/dev-flow-chore-ticket-ops-mishaps.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "dev_flow_chore": repo_root / ".claude" / "skills" / "dev-flow-chore" / "SKILL.md",
        "ticket_ops": repo_root / ".claude" / "skills" / "ticket-ops" / "SKILL.md",
        "git_workflow": repo_root / ".claude" / "skills" / "git-workflow" / "SKILL.md",
        "repo_hygiene_ops": repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md",
    }


def _lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def _first_line(lines: list[str], pattern: str, start: int = 0, end: int | None = None, flags: int = 0) -> int:
    """Return the 1-based number of the first matching line in (start, end), or 0 if none."""
    regex = re.compile(pattern, flags)
    stop = len(lines) if end is None else min(end, len(lines))
    for idx in range(max(start, 0), stop):
        if regex.search(lines[idx]):
            return idx + 1
    return 0


# -- Mishap 1: dev-flow-chore must not use `git add -A` and must guard the index --

def test_t001210_dev_flow_chore_step4_has_no_bare_git_add_a(paths):
    skill = paths["dev_flow_chore"]
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    # The fix replaces `git add -A` with explicit path staging of only the
    # files the chore actually changed. A bare `git add -A` would promote
    # git-crypt smudge artifacts from environments/.secrets/** into the index.
    assert not re.search(r"^[ \t]*git add -A[ \t]*$", text, re.MULTILINE), "bare 'git add -A' found"


def test_t001210_dev_flow_chore_step4_has_secret_in_index_guard_for_environments_secrets(paths):
    skill = paths["dev_flow_chore"]
    git_workflow = paths["git_workflow"]
    assert skill.is_file()
    assert git_workflow.is_file()
    assert re.search(r"git-crypt-Staging-Guard \[T001210\]", skill.read_text(encoding="utf-8"))
    assert re.search(r"environments/\.secrets", git_workflow.read_text(encoding="utf-8"))


def test_t001210_dev_flow_chore_secret_in_index_guard_positioned_in_step4(paths):
    skill = paths["dev_flow_chore"]
    assert skill.is_file()
    lines = _lines(skill)
    step4 = _first_line(lines, r"^## Schritt 4")
    schritt5 = _first_line(lines, r"^## Schritt 5")
    guard = _first_line(lines, r"git-crypt-Staging-Guard \[T001210\]", start=step4, end=schritt5 - 1 if schritt5 else 0)
    assert step4, "'## Schritt 4' header missing"
    assert schritt5, "'## Schritt 5' header missing"
    assert guard, "guard reference not found between Schritt 4 and Schritt 5"
    assert step4 < guard < schritt5


# -- Mishap 2: ticket-ops must dedupe intake by title (T001147/T001148 family) --

def test_t001210_ticket_ops_phase4_step44_has_title_dedupe_guard(paths):
    ticket_ops = paths["ticket_ops"]
    hygiene = paths["repo_hygiene_ops"]
    assert ticket_ops.is_file()
    assert hygiene.is_file()
    assert re.search(r"Dedupe-Guard", ticket_ops.read_text(encoding="utf-8"), re.IGNORECASE)

    lines = _lines(hygiene)
    step4 = _first_line(lines, r"^##[ \t]+4\.[ \t]")
    assert step4, "'## 4.' header missing in repo-hygiene-ops.md"
    keyword = _first_line(
        lines,
        r"dedup|duplicate ticket|same title",
        start=step4,
        flags=re.IGNORECASE,
    )
    assert keyword, "no dedupe keyword after '## 4.'"
    assert keyword > step4


def test_t001210_ticket_ops_step44_dedupe_guard_references_canonical_t001147(paths):
    hygiene = paths["repo_hygiene_ops"]
    assert hygiene.is_file()
    lines = _lines(hygiene)
    step4 = _first_line(lines, r"^##[ \t]+4\.[ \t]")
    assert step4, "'## 4.' header missing in repo-hygiene-ops.md"
    ref = _first_line(lines, r"T001147|T001148", start=step4)
    assert ref, "no T001147/T001148 reference after '## 4.'"
    assert ref > step4
