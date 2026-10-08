"""Native migration of tests/spec/ci-cd/devflow-ci-watch-rollup-headsha.bats."""

import os
import stat
import subprocess
from pathlib import Path

import pytest

TICKET_SH = """#!/usr/bin/env bash
case "$1" in
  assert-phase-chain) exit 0 ;;
  *) exit 0 ;;
esac
"""

GH_TEMPLATE = """#!/usr/bin/env bash
args="$*"
case "$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") cat "@MARKER@/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefName -q .headRefName")
    # [T014466] Der Run-Lookup fragt jetzt den PR-Branch ab statt den lokalen.
    echo "feature/stub-branch"
    ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "@MARKER@/mock-head-ref-oid" ]]; then
      cat "@MARKER@/mock-head-ref-oid"
    else
      git -C "@WORK@" rev-parse HEAD
    fi
    ;;
  *"pr checks"*"--watch"*) exit 0 ;;
  *"--json statusCheckRollup"*)
    if [[ "$args" == *'"FAILURE"'* || "$args" == *'"TIMED_OUT"'* ]]; then
      cat "@MARKER@/mock-rollup-failures" 2>/dev/null || true
    elif [[ "$args" == *'"COMPLETED"'* || "$args" == *'COMPLETED'* ]]; then
      cat "@MARKER@/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    cat "@MARKER@/mock-total-checks"
    ;;
  *"check-runs"*"failure"*)
    cat "@MARKER@/mock-check-runs-failures" 2>/dev/null || true
    ;;
  *"run list"*)
    cat "@MARKER@/mock-run-list" 2>/dev/null || echo "[]"
    ;;
  *"actions/runs"*"jobs"*)
    cat "@MARKER@/mock-jobs-failures" 2>/dev/null || echo "0"
    ;;
  *) echo "" ;;
esac
"""


@pytest.fixture
def ws(repo_root, tmp_path):
    work = tmp_path / "work"
    marker = work / "markers"
    marker.mkdir(parents=True)
    (work / "bin").mkdir()
    (work / "scripts").mkdir()
    (marker / "pr-state").write_text("OPEN\n")
    (marker / "mock-rollup-failures").write_text("\n")
    (marker / "mock-rollup-pending").write_text("0\n")
    (marker / "mock-check-runs-failures").write_text("")
    (marker / "mock-total-checks").write_text("2\n")

    subprocess.run(["git", "-C", str(work), "init", "-q", "-b", "main"], check=True)
    subprocess.run(["git", "-C", str(work), "-c", "user.email=t@example.invalid", "-c", "user.name=t",
                    "commit", "-q", "--allow-empty", "-m", "init"], check=True)

    ticket = work / "scripts/ticket.sh"
    ticket.write_text(TICKET_SH)
    ticket.chmod(ticket.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    gh = work / "bin/gh"
    gh.write_text(GH_TEMPLATE.replace("@MARKER@", str(marker)).replace("@WORK@", str(work)))
    gh.chmod(gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return {
        "work": work,
        "marker": marker,
        "script": repo_root / "scripts/devflow-ci-watch.sh",
        "env": {
            "MARKER_DIR": str(marker),
            "TICKET_SH": str(ticket),
            "PATH": f"{work / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
        },
    }


def _head(w) -> str:
    return subprocess.run(["git", "-C", str(w["work"]), "rev-parse", "HEAD"],
                          capture_output=True, text=True, check=True).stdout.strip()


def _run(run_cmd, w, *args, extra=None):
    env = dict(w["env"])
    if extra:
        env.update(extra)
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(w["script"]), *args],
                   cwd=w["work"], env=env, timeout=900)


def test_t012239_gruener_pr_head_keine_failure_runs_meldet_weiterhin_alle_gruen_mit_exit_0(run_cmd, ws):
    (ws["marker"] / "pr-state").write_text("OPEN\n")
    (ws["marker"] / "mock-check-runs-failures").write_text("")
    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1")
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode}: {res.output}"
    assert "alle grün" in res.output, \
        "Positiv-Anker verletzt: gruener HEAD meldet nicht 'alle grün' - Testaufbau kaputt, nicht der Fix"


def test_t012239_failure_run_auf_dem_pr_head_check_runs_fuehrt_zu_exit_ungleich_0_nicht_falsch_gruen(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-rollup-pending").write_text("0\n")
    (m / "mock-total-checks").write_text("2\n")
    (m / "mock-check-runs-failures").write_text('["Unit + Quality Gates: https://example.invalid/run"]\n')

    sha = _head(ws)
    (m / "mock-head-ref-oid").write_text(sha + "\n")
    (m / "mock-run-list").write_text(
        f'[{{"databaseId":42,"headSha":"{sha}","status":"completed","conclusion":"failure"}}]')
    (m / "mock-jobs-failures").write_text("1\n")

    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1", extra={"MAX_CI_ATTEMPTS": "1"})
    assert res.returncode != 0, \
        f"Bug reproduziert: Script meldete 'alle grün' (exit 0) obwohl ein failure-Run auf dem PR-HEAD vorliegt: {res.output}"
    assert "Unit + Quality Gates" in res.output, \
        "Der fehlgeschlagene Check erscheint nicht in der Eskalationsmeldung"


def test_t012242_leeres_failed_checks_array_darf_bei_stale_failure_run_nicht_als_rot_eskalieren(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-rollup-pending").write_text("0\n")
    (m / "mock-total-checks").write_text("2\n")
    (m / "mock-check-runs-failures").write_text("[]\n")

    sha = _head(ws)
    (m / "mock-head-ref-oid").write_text(sha + "\n")
    (m / "mock-run-list").write_text(
        f'[{{"databaseId":43,"headSha":"{sha}","status":"completed","conclusion":"failure"}}]')
    (m / "mock-jobs-failures").write_text("1\n")

    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1", extra={"MAX_CI_ATTEMPTS": "1"})
    assert res.returncode == 0, \
        f"Bug reproduziert: leeres [] eskalierte als rot (exit {res.returncode}): {res.output}"
    assert "alle grün" in res.output, f"Gruene Sachlage wurde nicht als grün gemeldet:\n{res.output}"
