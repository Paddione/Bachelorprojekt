"""Native migration of tests/spec/ci-cd/devflow-ciwatch-ticket-path.bats."""

import os
import stat
import subprocess
from pathlib import Path

import pytest

FAKE_TICKET = """#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
if [[ "$1" == "assert-phase-chain" || "$2" == "assert-phase-chain" ]]; then
  exit "${FAKE_ASSERT_EXIT:-0}"
fi
exit 0
"""

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

    fake = work / "fake-ticket.sh"
    fake.write_text(FAKE_TICKET)
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    gh = work / "bin/gh"
    gh.write_text(GH_STUB)
    gh.chmod(gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    (marker / "ticket-calls").unlink(missing_ok=True)
    return {
        "work": work,
        "marker": marker,
        "script": repo_root / "scripts/devflow-ci-watch.sh",
        "fake": fake,
        "env": {
            "MARKER_DIR": str(marker),
            "PATH": f"{work / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
        },
    }


def _run(run_cmd, w, ticket_sh, assert_exit=None):
    env = dict(w["env"])
    env["TICKET_SH"] = str(ticket_sh)
    if assert_exit is not None:
        env["FAKE_ASSERT_EXIT"] = str(assert_exit)
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(w["script"]), "T006370", PR_URL],
                   cwd=w["work"], env=env, timeout=900)


def test_t006370_phase_chain_check_erreicht_ticket_sh_aus_cwd_ohne_scripts_merged_pfad(run_cmd, ws):
    res = _run(run_cmd, ws, ws["fake"], assert_exit=0)
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode} (erwartet 0): {res.output}"
    calls = ws["marker"] / "ticket-calls"
    assert calls.exists() and "assert-phase-chain" in calls.read_text(), \
        "assert-phase-chain wurde nie aufgerufen - Testaufbau kaputt, nicht der Fix"
    assert "Phase-Chain nicht vollständig" not in res.output, \
        "Skript behauptet 'Phase-Chain nicht vollständig', obwohl die Chain gar nicht geprueft werden konnte"


def test_t006370_nachgewiesene_chain_verletzung_beendet_weiterhin_mit_exit_6(run_cmd, ws):
    res = _run(run_cmd, ws, ws["fake"], assert_exit=1)
    assert res.returncode == 6, f"unerwarteter Exit {res.returncode} (erwartet 6): {res.output}"
    assert "Phase-Chain nicht vollständig" in res.output, \
        "Exit 6 ohne die zugehoerige Meldung - Gate-Ausgabe unvollstaendig"


def test_t006370_nicht_erreichbares_ticket_sh_endet_mit_exit_7_und_klarer_meldung(run_cmd, ws):
    res = _run(run_cmd, ws, ws["work"] / "does-not-exist/ticket.sh")
    assert res.returncode == 7, f"unerwarteter Exit {res.returncode} (erwartet 7): {res.output}"
    assert "nicht erreichbar" in res.output, "Exit 7 ohne klare 'nicht erreichbar'-Meldung"


def test_t006370_gruener_pfad_alle_checks_gruen_erreicht_assert_phase_chain_aus_cwd_ohne_scripts(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-rollup-pending").write_text("0\n")
    (m / "mock-total-checks").write_text("3\n")
    head = subprocess.run(["git", "-C", str(ws["work"]), "rev-parse", "HEAD"],
                          capture_output=True, text=True, check=True).stdout
    (m / "mock-head-ref-oid").write_text(head)

    res = _run(run_cmd, ws, ws["fake"], assert_exit=0)
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode} (erwartet 0): {res.output}"
    calls = m / "ticket-calls"
    assert calls.exists() and "assert-phase-chain" in calls.read_text(), \
        "gruener Pfad erreicht assert-phase-chain nicht - Testaufbau kaputt, nicht der Fix"


def test_t006370_skript_enthaelt_keinen_relativen_scripts_ticket_sh_aufruf_mehr(ws):
    assert "./scripts/ticket.sh" not in ws["script"].read_text(), \
        "relativer ./scripts/ticket.sh-Aufruf noch vorhanden - cwd-Abhaengigkeit besteht fort"
