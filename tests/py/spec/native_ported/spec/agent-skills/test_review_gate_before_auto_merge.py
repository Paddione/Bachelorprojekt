"""Native migration of tests/spec/agent-skills/review-gate-before-auto-merge.bats."""

import pytest


def _awk_section(text, heading_prefix):
    """awk '/^<heading>/{flag=1; next} /^## /&&flag{exit} flag' (Ueberschrift nicht enthalten)."""
    out = []
    flag = False
    for line in text.splitlines():
        if not flag:
            if line.startswith(heading_prefix):
                flag = True
            continue
        if line.startswith("## "):
            break
        out.append(line)
    return "\n".join(out)


@pytest.fixture
def skill_text(repo_root):
    skill = repo_root / ".claude/skills/dev-flow-execute/SKILL.md"
    assert skill.is_file()
    return skill.read_text(encoding="utf-8")


def test_t005565_implementer_mandat_nennt_weiterhin_die_pr_erstellung(skill_text):
    mandate = _awk_section(skill_text, "## Schritt 2:")
    assert "PR-Erstellung" in mandate


def test_t005565_auto_merge_ist_aus_dem_implementer_mandat_entfernt(skill_text):
    mandate = _awk_section(skill_text, "## Schritt 2:")
    assert "merge --auto" not in mandate


def test_t900687_merge_gate_schritt_3_8_fordert_auto_merge_an_review_nur_auf_zuruf(skill_text):
    gate = _awk_section(skill_text, "## Schritt 3.8: Merge-Gate")
    assert "gh pr merge --auto" in gate
    assert "requesting-code-review" in gate
    assert "Orchestrator" in gate
    assert "Zuruf" in gate


def test_t900687_merge_gate_deaktiviert_aktives_auto_merge_nicht(skill_text):
    gate = _awk_section(skill_text, "## Schritt 3.8: Merge-Gate")
    assert "--disable-auto" not in gate
    assert "rc=1" in gate


def test_t900687_kein_pflicht_review_gate_mehr_in_skill_md(skill_text):
    count = sum(1 for line in skill_text.splitlines() if "PFLICHT vor Auto-Merge" in line)
    assert count == 0
