"""Native migration of tests/spec/mcp-skill-integration.bats."""

import re
from pathlib import Path

import pytest

MISHAP_GO = "scripts/ticket-mcp/go/internal/tools/mishap.go"
SKILL = ".claude/skills/mishap-tracker/SKILL.md"
GUIDE = ".claude/skills/references/mcp-tool-guide.md"


def _read(repo_root: Path, rel: str) -> str:
    return (repo_root / rel).read_text(encoding="utf-8")


def _find_line(repo_root: Path, rel: str, pattern: str) -> str:
    """grep -A3 <pattern>: alle Treffer samt drei Folgezeilen, als Text."""
    lines = _read(repo_root, rel).splitlines()
    chunks = []
    for i, line in enumerate(lines):
        if pattern in line:
            chunks.append("\n".join(lines[i:i + 4]))
    return "\n".join(chunks)


# ── ticket-mcp tool coverage ──────────────────────────────────────────

def test_ticket_mcp_server_exists_in_mcp_json(repo_root):
    assert "ticket-mcp" in _read(repo_root, ".mcp.json")


def test_ticket_mcp_server_exists_in_opencode_opencode_jsonc(repo_root):
    assert "ticket-mcp" in _read(repo_root, ".opencode/opencode.jsonc")


# ── Go binary ─────────────────────────────────────────────────────────

def test_ticket_mcp_go_source_directory_exists(repo_root):
    assert (repo_root / "scripts" / "ticket-mcp").is_dir()


def test_ticket_mcp_go_tools_directory_exists(repo_root):
    if (repo_root / "scripts" / "ticket-mcp" / "go").is_dir() or \
            (repo_root / "scripts" / "ticket-mcp" / "go" / "internal" / "tools").is_dir():
        return
    pytest.skip("Go source not yet extracted")


# ── Mishap buffer tools ───────────────────────────────────────────────

def test_mishap_tracker_skill_references_report_mishap(repo_root):
    assert re.search(r"report_mishap|report-mishap", _read(repo_root, SKILL))


def test_mishap_tracker_skill_references_get_mishap_buffer(repo_root):
    assert re.search(r"get_mishap_buffer|get-mishap-buffer", _read(repo_root, SKILL))


def test_mishap_tracker_skill_references_flush_mishap_buffer(repo_root):
    assert re.search(r"flush_mishap_buffer|flush-mishap-buffer", _read(repo_root, SKILL))


# ── T002383: Mishap-Emissionsrate ─────────────────────────────────────

def test_t002383_mishap_trigger_is_raised_above_the_per_cycle_emission_rate(repo_root):
    assert re.search(r"^const MISHAP_TRIGGER = 10$", _read(repo_root, MISHAP_GO), re.MULTILINE)


def test_t002383_the_skill_no_longer_forces_a_session_end_flush_below_the_trigger(repo_root):
    assert "am Session-Ende nichts verloren geht" not in _read(repo_root, SKILL)


def test_t002383_the_mishap_buffer_path_resolves_the_shared_git_dir(repo_root):
    assert "git-common-dir" in _read(repo_root, MISHAP_GO)


def test_t002383_the_skill_documents_that_the_buffer_survives_a_session(repo_root):
    assert re.search(r"mishap-buffer\.json|ueberlebt|überlebt|persistent", _read(repo_root, SKILL))


def test_t900309_ticket_mcp_node_server_resolves_mishap_buffer_path_in_gitdir_without_stepping_up(repo_root):
    src = _read(repo_root, "scripts/ticket-mcp-node/server.mjs")
    assert re.search(r"join\(gitDir, 'mishap-buffer\.json'\)", src)
    assert not re.search(r"join\(gitDir, '\.\.', 'mishap-buffer\.json'\)", src)


def test_t900309_ticket_mcp_node_runner_resolves_mishap_buffer_path_via_git_common_dir_without_info(repo_root):
    src = _read(repo_root, "scripts/ticket-mcp-node/runner.mjs")
    assert "gitCommonDir" in src
    assert not re.search(r"join\(.*\.git.*info.*mishap-buffer\.json", src)


# ── Skill-critical verb coverage ──────────────────────────────────────

def test_ticket_mcp_guide_lists_skill_critical_verbs(repo_root):
    assert (repo_root / GUIDE).is_file()


def test_mcp_tool_guide_md_mentions_create_verb(repo_root):
    assert "create" in _read(repo_root, GUIDE)


def test_mcp_tool_guide_md_mentions_get_verb(repo_root):
    assert re.search(r"get\b", _read(repo_root, GUIDE))


def test_mcp_tool_guide_md_mentions_add_comment_verb(repo_root):
    assert re.search(r"add-comment|add_comment", _read(repo_root, GUIDE))


# ── [T002407-M4] Incident-Typen umgehen den Buffer ────────────────────

def test_t002407_m4a_is_incident_type_erkennt_incident(repo_root):
    assert 'return mtype == "incident" || mtype == "broken" || mtype == "security"' in _read(repo_root, MISHAP_GO)


def test_t002407_m4b_is_incident_type_erkennt_broken_alias(repo_root):
    assert '"broken"' in _find_line(repo_root, MISHAP_GO, "func isIncidentType")


def test_t002407_m4c_is_incident_type_erkennt_security_alias(repo_root):
    assert '"security"' in _find_line(repo_root, MISHAP_GO, "func isIncidentType")


def test_t002407_m4d_incident_erzeugt_create_incident_ticket_aufruf_sofort_ticket(repo_root):
    text = _read(repo_root, MISHAP_GO)
    assert "createIncidentTicket(entry, brand)" in text, "createIncidentTicket-Aufruf fehlt"
    assert "Incident-Ticket angelegt" in text


def test_t002407_m4e_nicht_kritische_typen_degraded_gehen_in_den_buffer(repo_root):
    text = _read(repo_root, MISHAP_GO)
    assert "buffer = append(buffer, entry)" in text
    assert "Mishap gespeichert" in text


# ── [T002407-M5] Erzeugte Tickets tragen nie type=task ────────────────

def test_t002407_m5a_build_incident_ticket_args_verwendet_type_incident(repo_root):
    assert '"create", "--type", "incident"' in _read(repo_root, MISHAP_GO)


def test_t002407_m5b_build_incident_ticket_args_verwendet_attention_mode_needs_human(repo_root):
    assert '"--attention-mode", "needs_human"' in _read(repo_root, MISHAP_GO)


def test_t002407_m5e_kein_pfad_in_mishap_go_erzeugt_type_task(repo_root):
    lines = [
        line for line in _read(repo_root, MISHAP_GO).splitlines()
        if '"task"' in line
        and not re.search(r'//.*"task"', line)
        and not re.search(r"legacy.*task|TODO|FIXME", line)
    ]
    assert len(lines) == 0, lines

