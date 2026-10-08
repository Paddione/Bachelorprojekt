"""Native migration of tests/spec/agent-skills/messung-mit-befehl.bats."""

import re

import pytest

HEADING = "### Mess-Konvention"


@pytest.fixture
def claude_md(repo_root):
    return repo_root / "CLAUDE.md"


def _anchor(claude_md):
    assert claude_md.is_file()
    assert claude_md.read_text(encoding="utf-8") != ""
    assert any(line.startswith(HEADING) for line in claude_md.read_text(encoding="utf-8").splitlines())


def _section(claude_md):
    """awk: /^### Mess-Konvention/{f=1} f&&/^#{2,3} /&&!/^### Mess-Konvention/{if(n++)exit} f"""
    out = []
    flag = False
    count = 0
    for line in claude_md.read_text(encoding="utf-8").splitlines():
        if line.startswith(HEADING):
            flag = True
        if flag and re.match(r"^#{2,3} ", line) and not line.startswith(HEADING):
            if count:
                break
            count += 1
        if flag:
            out.append(line)
    return "\n".join(out)


def test_t002717_claude_md_traegt_einen_abschnitt_zur_mess_konvention(claude_md):
    _anchor(claude_md)


def test_t002717_die_mess_konvention_verlangt_den_ausfuehrbaren_befehl(claude_md):
    _anchor(claude_md)
    section = _section(claude_md)
    assert section != ""
    assert "befehl" in section.lower()


def test_t002717_die_mess_konvention_benennt_das_suchmuster_als_die_entscheidende_auslassung(claude_md):
    _anchor(claude_md)
    section = _section(claude_md)
    assert section != ""
    assert "suchmuster" in section.lower()


def test_t002717_die_mess_konvention_deklariert_sich_als_redaktionell_nicht_als_guard(claude_md):
    _anchor(claude_md)
    section = _section(claude_md)
    assert section != ""
    assert "redaktioneller hinweis" in section.lower()


def test_t002717_die_mess_konvention_traegt_ihre_ticket_referenz(claude_md):
    _anchor(claude_md)
    section = _section(claude_md)
    assert section != ""
    assert "T002717" in section
