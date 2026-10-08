"""Native migration of tests/spec/repo-structure/root-agent-md.bats."""
from pathlib import Path


def test_persona_mds_konsolidiert_unter_docs_agent_context_nicht_mehr_in_der_root(repo_root):
    # Positiv-Anker: Zielzustand vorhanden
    assert (repo_root / "docs/agent-context/persona.md").is_file()
    assert (repo_root / "docs/agent-context/user.md").is_file()
    assert (repo_root / "docs/agent-context/heartbeat.md").is_file()
    # Negativ-Aussage: Root-Persona-Dateien sind entfernt
    for name in ("SOUL.md", "IDENTITY.md", "USER.md", "HEARTBEAT.md"):
        assert not (repo_root / name).exists(), f"Root-Persona-Datei vorhanden: {name}"


def test_qwen_md_zeiger_auf_claude_md_statt_kontext_duplikat(repo_root):
    qwen = repo_root / "QWEN.md"
    assert qwen.is_file()
    assert "CLAUDE.md" in qwen.read_text(encoding="utf-8", errors="replace")
