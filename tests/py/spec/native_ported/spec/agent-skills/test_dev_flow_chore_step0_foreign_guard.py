"""Native migration of tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats."""
import re
from pathlib import Path


def _section(text: str, start: str, end: str) -> str:
    """Emulate awk '/start/,/end/' (inclusive range)."""
    out, active = [], False
    for line in text.splitlines():
        if not active and re.search(start, line):
            active = True
        if active:
            out.append(line)
            if re.search(end, line):
                active = False
    return "\n".join(out)


def _skill(repo_root: Path) -> Path:
    return repo_root / ".claude/skills/dev-flow-chore/SKILL.md"


def test_dev_flow_chore_skill_md_schritt_0_unbedingtes_git_stash_ist_nicht_mehr_im_unqualifizierten_pfad(repo_root):
    skill = _skill(repo_root)
    assert skill.is_file()
    assert re.search(r"^## Schritt 0: Reaper", skill.read_text(encoding="utf-8"), re.MULTILINE)


def test_dev_flow_chore_skill_md_schritt_0_referenziert_die_geteilte_fremdaktivitaets_guard_funktion(repo_root):
    skill = _skill(repo_root)
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    assert "mc_foreign_activity_detected" in _section(text, r"^## Schritt 0: Reaper", r"^## Schritt 0\.5:")


def test_dev_flow_chore_skill_md_schritt_0_das_unqualifizierte_git_stash_aus_der_alten_fassung_ist_ersetzt(repo_root):
    skill = _skill(repo_root)
    assert skill.is_file()
    text = skill.read_text(encoding="utf-8")
    section = _section(text, r"^## Schritt 0: Reaper", r"^## Schritt 0\.5:")
    assert "git stash && git pull --rebase origin main && git stash pop" not in section
