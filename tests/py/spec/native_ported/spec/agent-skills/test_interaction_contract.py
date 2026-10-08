"""Native migration of tests/spec/agent-skills/interaction-contract.bats."""

import re

import pytest

HEADING = "## Interaction Contract"


@pytest.fixture
def agents_md(repo_root):
    return repo_root / "AGENTS.md"


@pytest.fixture
def claude_md(repo_root):
    return repo_root / "CLAUDE.md"


def _anchor(agents_md):
    """Positiv-Anker: Datei existiert, ist nicht leer, traegt die Vertragsueberschrift."""
    assert agents_md.is_file()
    text = agents_md.read_text(encoding="utf-8")
    assert text != ""
    assert any(line.startswith(HEADING) for line in text.splitlines())
    return text


def _section(agents_md):
    """awk: /^## Interaction Contract/{f=1} f&&/^## /&&!/^## Interaction Contract/{exit} f"""
    out = []
    flag = False
    for line in agents_md.read_text(encoding="utf-8").splitlines():
        if line.startswith(HEADING):
            flag = True
        if flag and line.startswith("## ") and not line.startswith(HEADING):
            break
        if flag:
            out.append(line)
    return "\n".join(out)


def test_t900235_agents_md_traegt_den_abschnitt_interaction_contract(agents_md):
    _anchor(agents_md)


def test_t900235_das_abgeloeste_status_protocol_ist_aus_agents_md_verschwunden(agents_md):
    _anchor(agents_md)
    assert not any(re.match(r"^## Status Protocol", line) for line in agents_md.read_text(encoding="utf-8").splitlines())


def test_t900235_der_vertrag_traegt_kein_conf_footer_feld(agents_md):
    _anchor(agents_md)
    # Positiv-Anker: Abschnitt nicht leer, sonst vakuos.
    assert _section(agents_md) != ""
    hits = [
        f"{n}:{line}"
        for n, line in enumerate(agents_md.read_text(encoding="utf-8").splitlines(), start=1)
        if re.search(r"(^|[^A-Za-z`])CONF:", line)
    ]
    assert not hits, "Fehlerhafte CONF:-Felder:\n" + "\n".join(hits)


def test_t900235_der_vertrag_behaelt_die_vier_footer_felder(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert section != ""
    for field in ("STATUS:", "RUNNING:", "BLOCKED:", "NEXT:"):
        assert field in section


def test_t900235_nachfolge_footer_self_check_ist_zeitboxed_mit_auto_run(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert section != ""
    for phrase in (
        "PLUS 3 alternatives",
        "clickable multiple choice",
        "within 2 min",
        "execute the recommendation",
        "wait 10 s for objection",
        "auto-run it",
    ):
        assert phrase in section


def test_t900235_der_vertrag_benennt_die_autonomiegrenze_in_beiden_richtungen(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert section != ""
    assert "logical completion" in section
    assert "without being asked" in section


def test_t900235_der_vertrag_enumeriert_alle_vier_stop_trigger(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert section != ""
    for phrase in ("Destructive or irreversible", "Genuine fork", "Blocked", "Cost above threshold"):
        assert phrase in section


def test_t900235_der_vertrag_verweist_auf_die_eskalation_statt_sie_zu_duplizieren(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert ".claude/lib/behaviors/escalation-protocol.md" in section
    hits = [
        f"{n}:{line}"
        for n, line in enumerate(section.splitlines(), start=1)
        if "agent-escalate.sh" in line
    ]
    assert not hits, "Fehlerhafter Verweis auf Skript:\n" + "\n".join(hits)


def test_t900235_der_vertrag_verlangt_eine_tastaturwaehlbare_frageform(agents_md):
    _anchor(agents_md)
    section = _section(agents_md)
    assert section != ""
    assert "AskUserQuestion" in section
    assert "keystroke" in section
    assert "numbered" in section.lower()


def test_t900235_claude_md_verweist_auf_den_vertrag_in_agents_md(agents_md, claude_md):
    _anchor(agents_md)
    assert claude_md.is_file()
    assert claude_md.read_text(encoding="utf-8") != ""
    lines = [
        f"{n}:{line}"
        for n, line in enumerate(claude_md.read_text(encoding="utf-8").splitlines(), start=1)
        if "Interaction Contract" in line
    ]
    assert lines, "grep -n 'Interaction Contract' liefert keine Treffer"
    assert "AGENTS.md" in "\n".join(lines)
