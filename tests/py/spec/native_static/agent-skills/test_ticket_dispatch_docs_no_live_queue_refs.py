"""Dispatch-Doku darf keine toten Skripte als Live-Pfad zeigen.

Regressionsschutz: ticket-ops-procedures.md stellte queue.sh /
dispatcher-bridge.sh als aktiven Dispatch-Pfad dar, obwohl beide seit dem
Factory-Teardown (T900399) nicht mehr existieren. Dispatch-Agenten wurden so
auf einen toten Pfad eingewiesen — stille Wave-1-Stillstaende durch
Fehldiagnose. Der Lock-Satz muss auf die lebendigen Gates
(scripts/vda/ticket/enqueue.sh, T003575) zeigen.
"""

from pathlib import Path


DOC_REL = ".opencode/skills/references/ticket-ops-procedures.md"
MIRRORS_REL = [
    ".agents/skills/references/ticket-ops-procedures.md",
    ".claude/skills/references/ticket-ops-procedures.md",
]
DEAD_SENTENCE = "is invisible to `queue.sh`/`dispatcher-bridge.sh`"


def _doc(repo_root: Path) -> str:
    doc = repo_root / DOC_REL
    assert doc.is_file(), f"Dispatch-Prozedur fehlt: {DOC_REL}"
    return doc.read_text()


def test_dead_dispatch_sentence_removed(repo_root):
    """Der Satz mit dem toten queue.sh/dispatcher-bridge-Pfad ist weg."""
    assert DEAD_SENTENCE not in _doc(repo_root)


def test_remaining_script_mentions_name_teardown(repo_root):
    """Jede Rest-Erwähnung der entfernten Skripte trägt den T900399-Marker."""
    offenders = [
        line
        for line in _doc(repo_root).splitlines()
        if ("queue.sh" in line or "dispatcher-bridge.sh" in line)
        and "T900399" not in line
    ]
    assert offenders == [], f"Live-Pfad-Verweise ohne Teardown-Marker: {offenders}"


def test_dispatch_gate_points_at_living_helper(repo_root):
    """Der korrigierte Satz verweist auf das lebendige Gate (enqueue.sh)."""
    text = _doc(repo_root)
    assert "scripts/vda/ticket/enqueue.sh" in text
    assert "T003575" in text


def test_mirrors_share_fixed_content(repo_root):
    """Alle Skill-Spiegel (.agents/.claude/.opencode) tragen denselben Stand."""
    fixed = _doc(repo_root)
    for rel in MIRRORS_REL:
        mirror = repo_root / rel
        assert mirror.is_file(), f"Spiegel fehlt: {rel}"
        assert mirror.read_text() == fixed, f"Spiegel divergiert: {rel}"
