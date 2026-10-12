"""T901881: assert-phase-chain meldet Order-Violation bei auto-vor-real Events.

Symptom (T901788 Verify-Evidenz, gleiche Signatur bei T901750):
implement:entered-auto (update-status in_progress) liegt VOR plan:done-real
(manueller Backfill, weil dev-flow-plan kein reales plan:done emittiert und
execute es nur im touched_files-Ergänzungszweig tut). Der Order-Check wertet
das als Violation — ein False Positive des Fail-Closed-Gates.

Erwartung: Der Order-Check unterscheidet auto- von realen Events. Das
auto plan:done aus stage-plan ist ein gültiger Ordnungs-Anker; die
Vollständigkeit (missing[]) verlangt weiterhin reale Events.

T901952: Incident-Direct-Flow ohne stage-plan hat keinen Anker — das auto
implement:entered (update-status in_progress) steht vor allem Realen und
vergiftet die Ordnung irreparabel (belegt an T901951). Erwartung: auto
implement:entered ist nie Ordnungsbasis (erste REALE implement-Zeile zählt);
für die Vollständigkeit zählt es weiter wie bisher.
"""

import os

import pytest

STUB_KUBECTL = """#!/usr/bin/env bash
# Mock-kubectl: emuliert die DB-Engine fuer assert-phase-chain.
if [[ " $* " == *" get pod "* ]]; then
  echo "pod/shared-db-0"
  exit 0
fi
# exec-Pfad: SQL von stdin lesen, WHERE-Filter der Engine emulieren.
sql="$(cat)"
rows="$(cat "$ASSERT_ROWS_FILE")"
if [[ "$sql" == *"AND NOT (e.phase"* ]]; then
  # Altes SQL: auto stage-plan-Zeilen (scout/design/plan) sind herausgefiltert.
  grep -vE '\\|(scout|design|plan)\\|done\\|auto: stage-plan$' <<<"$rows" || true
else
  printf '%s\\n' "$rows"
fi
"""

# T901881-Signatur: auto implement:entered VOR realem plan:done (Backfill).
ROWS_AUTO_VOR_REAL = """\
101|plan|done|auto: stage-plan
102|implement|entered|auto: update-status in_progress
103|plan|done|Plan geladen
104|verify|done|gate=ci result=pass
"""

# Echte Verletzung: reales verify:done VOR implement:entered.
ROWS_ECHTE_VERLETZUNG = """\
201|plan|done|Plan geladen
202|verify|done|gate=ci result=pass
203|implement|entered|manuell
"""

# Nur auto-Events, kein reales plan:done/verify:done -> Luecke, keine Ordnung.
ROWS_NUR_AUTO = """\
301|plan|done|auto: stage-plan
302|implement|entered|auto: update-status in_progress
"""

# Saubere reale Kette.
ROWS_SAUBER = """\
401|plan|done|Plan geladen
402|implement|entered|manuell
403|verify|done|gate=ci result=pass
"""

# T901952-Signatur: Incident-Direct-Flow ohne stage-plan-Anker — auto
# implement:entered steht vor der gesamten realen Kette.
ROWS_INCIDENT_DIRECT_OHNE_ANKER = """\
501|implement|entered|auto: update-status in_progress
502|plan|done|Incident-Plan
503|implement|entered|Fix umgesetzt
504|verify|done|gate=ci result=pass
"""

# Fail-closed mit auto-Beteiligung: reales implement VOR realem plan.
ROWS_ECHTE_VERLETZUNG_MIT_AUTO = """\
701|implement|entered|auto: update-status in_progress
702|implement|entered|Fix umgesetzt
703|plan|done|Plan geladen
704|verify|done|gate=ci result=pass
"""

# T901952-Nicht-Ziel-Pin: auto-implement erfuellt die Vollstaendigkeit.
ROWS_AUTO_IMPL_VOLLSTAENDIG = """\
801|plan|done|Plan geladen
802|implement|entered|auto: update-status in_progress
803|verify|done|gate=ci result=pass
"""


@pytest.fixture
def gate(repo_root, tmp_path, monkeypatch):
    """kubectl-Stub auf PATH + Runner fuer das echte Gate-Skript."""
    bindir = tmp_path / "bin"
    bindir.mkdir()
    stub = bindir / "kubectl"
    stub.write_text(STUB_KUBECTL)
    stub.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bindir}{os.pathsep}{os.environ['PATH']}")

    def run(rows, run_cmd, *extra):
        rows_file = tmp_path / "rows.txt"
        rows_file.write_text(rows)
        env = {"ASSERT_ROWS_FILE": str(rows_file)}
        return run_cmd(
            ["bash", str(repo_root / "scripts/ticket.sh"),
             "assert-phase-chain", "--id", "T901881", *extra],
            cwd=repo_root,
            env=env,
        )

    return {"run": run}


def test_auto_vor_real_ist_keine_order_violation(gate, run_cmd):
    """Kern-Regression T901881: auto-Anker + spaeteres reales plan:done ist OK."""
    res = gate["run"](ROWS_AUTO_VOR_REAL, run_cmd)
    assert res.returncode == 0, res.output
    assert "OK: phase chain complete and ordered" in res.output


def test_echte_verletzung_bleibt_violation(gate, run_cmd):
    """Fail-closed: reales verify:done vor implement:entered bleibt Fehler."""
    res = gate["run"](ROWS_ECHTE_VERLETZUNG, run_cmd)
    assert res.returncode == 1, res.output
    assert "order violation" in res.output


def test_fehlendes_reales_plan_done_bleibt_luecke(gate, run_cmd):
    """Fail-closed: auto-Events allein erfuellen die Kette nicht (missing)."""
    res = gate["run"](ROWS_NUR_AUTO, run_cmd)
    assert res.returncode == 1, res.output
    assert "missing real evidence" in res.output
    assert "plan:done" in res.output
    assert "order violation" not in res.output


def test_saubere_reale_kette_bleibt_gruen(gate, run_cmd):
    """Positiv-Anker: geordnete reale Kette bleibt gruen."""
    res = gate["run"](ROWS_SAUBER, run_cmd)
    assert res.returncode == 0, res.output


def test_incident_direct_flow_ohne_stage_plan_ist_gruen(gate, run_cmd):
    """Kern-Regression T901952: auto-implement ohne Anker + reale Kette ist OK."""
    res = gate["run"](ROWS_INCIDENT_DIRECT_OHNE_ANKER, run_cmd)
    assert res.returncode == 0, res.output
    assert "OK: phase chain complete and ordered" in res.output


def test_echte_reale_verletzung_mit_auto_bleibt_violation(gate, run_cmd):
    """Fail-closed: reales implement vor realem plan bleibt Fehler trotz auto."""
    res = gate["run"](ROWS_ECHTE_VERLETZUNG_MIT_AUTO, run_cmd)
    assert res.returncode == 1, res.output
    assert "order violation" in res.output


def test_auto_implement_zaehlt_fuer_vollstaendigkeit(gate, run_cmd):
    """T901952-Nicht-Ziel-Pin: auto-implement erfuellt weiterhin die Kette."""
    res = gate["run"](ROWS_AUTO_IMPL_VOLLSTAENDIG, run_cmd)
    assert res.returncode == 0, res.output
    assert "OK: phase chain complete and ordered" in res.output
