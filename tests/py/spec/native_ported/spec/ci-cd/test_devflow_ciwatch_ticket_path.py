"""Phase-Chain-Gate laeuft lokal gegen phase-events.log (retiriert 2026-10-14).

Portiert aus devflow-ciwatch-ticket-path (TICKET_SH-Mechanik entfiel mit dem
Ticket-System): Der Gate prueft `.agents/plans/<slug>/phase-events.log`
(Slug aus dem PR-Branch), Exit 6 = unvollstaendig, 7 = nicht auswertbar.
"""

import os
import stat
import subprocess
from pathlib import Path

import pytest

GH_STUB = """#!/usr/bin/env bash
args="$*"
case "$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "CLEAN" ;;
  *"--json mergeable"*) echo "MERGEABLE" ;;
  *"--json state -q .state") cat "$MARKER_DIR/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefName -q .headRefName") echo "feature/stub-branch" ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "$MARKER_DIR/mock-head-ref-oid" ]]; then cat "$MARKER_DIR/mock-head-ref-oid"
    else git -C "" rev-parse HEAD; fi
    ;;
  *"pr checks"*"--watch"*)
    touch "$MARKER_DIR/watch-called"
    exit 0
    ;;
  *"--json statusCheckRollup"*)
    if [[ "$args" == *'"FAILURE"'* || "$args" == *'"TIMED_OUT"'* ]]; then
      cat "$MARKER_DIR/mock-rollup-failures" 2>/dev/null || true
    elif [[ "$args" == *'COMPLETED'* ]]; then
      cat "$MARKER_DIR/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    cat "$MARKER_DIR/mock-total-checks" 2>/dev/null || echo "3"
    ;;
  *) echo "" ;;
esac
"""

PR_URL = "https://github.com/Paddione/Bachelorprojekt/pull/4533"

PHASE_LINES = (
    "plan done 2026-10-14T00:00:00Z plan-gestagt\n"
    "implement entered 2026-10-14T00:01:00Z subagent-gestartet\n"
    "verify done 2026-10-14T00:02:00Z tests-gruen\n"
)


@pytest.fixture
def ws(repo_root, tmp_path):
    work = tmp_path / "work"
    marker = work / "markers"
    marker.mkdir(parents=True)
    (work / "bin").mkdir()
    (marker / "pr-state").write_text("MERGED\n")
    (marker / "mock-rollup-failures").write_text("\n")
    (marker / "mock-rollup-pending").write_text("0\n")

    subprocess.run(["git", "-C", str(work), "init", "-q", "-b", "main"], check=True)
    subprocess.run(["git", "-C", str(work), "-c", "user.email=t@example.invalid", "-c", "user.name=t",
                    "commit", "-q", "--allow-empty", "-m", "init"], check=True)

    plan_dir = work / ".agents" / "plans" / "stub-branch"
    plan_dir.mkdir(parents=True)
    (plan_dir / "phase-events.log").write_text(PHASE_LINES)

    gh = work / "bin/gh"
    gh.write_text(GH_STUB)
    gh.chmod(gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return {
        "work": work,
        "marker": marker,
        "script": repo_root / "scripts/devflow-ci-watch.sh",
        "plan_log": plan_dir / "phase-events.log",
        "env": {
            "MARKER_DIR": str(marker),
            "PATH": f"{work / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
        },
    }


def _run(run_cmd, w):
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(w["script"]), PR_URL],
                   cwd=w["work"], env=w["env"], timeout=900)


def test_phase_gate_vollstaendiger_log_bei_merged_pr_exit_0(run_cmd, ws):
    res = _run(run_cmd, ws)
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode} (erwartet 0): {res.output}"


def test_phase_gate_unvollstaendiger_log_beendet_mit_exit_6(run_cmd, ws):
    ws["plan_log"].write_text(
        "plan done 2026-10-14T00:00:00Z plan-gestagt\n"
        "implement entered 2026-10-14T00:01:00Z subagent-gestartet\n"
    )
    res = _run(run_cmd, ws)
    assert res.returncode == 6, f"unerwarteter Exit {res.returncode} (erwartet 6): {res.output}"
    assert "Phase-Chain nicht vollständig" in res.output, \
        "Exit 6 ohne die zugehoerige Meldung - Gate-Ausgabe unvollstaendig"


def test_phase_gate_fehlender_log_beendet_mit_exit_6_und_klarer_meldung(run_cmd, ws):
    ws["plan_log"].unlink()
    res = _run(run_cmd, ws)
    assert res.returncode == 6, f"unerwarteter Exit {res.returncode} (erwartet 6): {res.output}"
    assert "phase-events.log fehlt" in res.output, "Exit 6 ohne klare 'fehlt'-Meldung"


def test_gruener_pfand_alle_checks_gruen_mit_vollstaendigem_log_exit_0(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-rollup-pending").write_text("0\n")
    (m / "mock-total-checks").write_text("3\n")
    head = subprocess.run(["git", "-C", str(ws["work"]), "rev-parse", "HEAD"],
                          capture_output=True, text=True, check=True).stdout
    (m / "mock-head-ref-oid").write_text(head)

    res = _run(run_cmd, ws)
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode} (erwartet 0): {res.output}"


def test_skript_enthaelt_keinen_ticket_phase_chain_aufruf_mehr(ws):
    assert "assert-phase-chain" not in ws["script"].read_text(), \
        "ticket-Phase-Chain-Aufruf noch vorhanden - Retirement unvollstaendig"
