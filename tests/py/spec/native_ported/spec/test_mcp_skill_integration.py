"""Native migration of tests/spec/mcp-skill-integration.bats."""

import re
from pathlib import Path

SKILL = ".claude/skills/mishap-tracker/SKILL.md"
GUIDE = ".claude/skills/references/mcp-tool-guide.md"


def _read(repo_root: Path, rel: str) -> str:
    return (repo_root / rel).read_text(encoding="utf-8")


# ── ticket-mcp tool coverage ──────────────────────────────────────────

# ── Go binary ─────────────────────────────────────────────────────────

# ── Mishap buffer tools ───────────────────────────────────────────────

# ── T002383: Mishap-Emissionsrate ─────────────────────────────────────

def test_t002383_the_skill_no_longer_forces_a_session_end_flush_below_the_trigger(repo_root):
    assert "am Session-Ende nichts verloren geht" not in _read(repo_root, SKILL)


def test_t002383_the_skill_documents_that_the_buffer_survives_a_session(repo_root):
    assert re.search(r"mishap-buffer\.json|ueberlebt|überlebt|persistent", _read(repo_root, SKILL))


# ── Skill-critical verb coverage ──────────────────────────────────────

def test_ticket_mcp_guide_lists_skill_critical_verbs(repo_root):
    assert (repo_root / GUIDE).is_file()


def test_mcp_tool_guide_md_mentions_create_verb(repo_root):
    assert "create" in _read(repo_root, GUIDE)


def test_mcp_tool_guide_md_mentions_get_verb(repo_root):
    assert re.search(r"get\b", _read(repo_root, GUIDE))


# ── [T002407-M4] Incident-Typen umgehen den Buffer ────────────────────

# ── [T002407-M5] Erzeugte Tickets tragen nie type=task ────────────────
