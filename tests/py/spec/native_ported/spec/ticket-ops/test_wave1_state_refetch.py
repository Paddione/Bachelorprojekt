"""Native migration of tests/spec/ticket-ops/wave1-state-refetch.bats."""

# [T006295]

import re
from pathlib import Path

import pytest


def _step36_section(proc: Path) -> str:
    """sed -n '/^### Step 3.6/,/^## /p'  (range: start line, then up to and including the next '## ' line)."""
    out = []
    active = False
    for line in proc.read_text(encoding="utf-8").splitlines():
        if not active:
            if re.match(r"^### Step 3\.6", line):
                active = True
                out.append(line)
            continue
        out.append(line)
        if re.match(r"^## ", line):
            active = False
    return "\n".join(out)


@pytest.fixture
def section(repo_root):
    proc = repo_root / ".claude/skills/references/ticket-ops-procedures.md"
    assert proc.is_file()
    return _step36_section(proc)


def test_wave1_state_refetch_positiv_anker_step_3_6_sektion_existiert_und_ist_nicht_leer(section):
    lines = [l for l in section.splitlines() if l.strip()]
    assert len(lines) > 5


def test_wave1_state_refetch_step_3_6_ticket_state_recheck_ist_vor_der_claim_schleife_dokumentiert(section):
    assert "tickets.tickets" in section, "keine tickets.tickets-Referenz in Step 3.6"
    assert "status" in section, "kein status-Feld im Recheck"
    assert "FACTORY-PLAN-REF" in section, "kein FACTORY-PLAN-REF-Marker im Recheck"


def test_wave1_state_refetch_step_3_6_stale_state_tickets_werden_vom_dispatch_ausgeschlossen(section):
    assert "STALE-STATE" in section, "keine STALE-STATE-Meldung in Step 3.6"
    rx = re.compile(r"unveraendert.*dispatch|dispatch.*unveraendert")
    assert any(rx.search(l) for l in section.splitlines()), "keine nur-unveraendert-dispatchen-Regel in Step 3.6"
