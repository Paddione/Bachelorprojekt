"""Native migration of tests/spec/ci-cd/devflow-ci-watch-run-lookup.bats."""

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
    # [T014466] Der Fix bindet den Run-Lookup an den PR-Branch statt an den lokalen.
    cat "@MARKER@/mock-head-ref-name" 2>/dev/null || echo "feature/stub-branch"
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
    (marker / "mock-head-ref-name").write_text("feature/stub-branch\n")

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


def _run(run_cmd, w):
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(w["script"]),
                    "T999999", "https://github.com/x/y/pull/1"],
                   cwd=w["work"], env=w["env"], timeout=900)


def test_anker_gruener_pr_head_meldet_alle_gruen_mit_exit_0(run_cmd, ws):
    (ws["marker"] / "pr-state").write_text("OPEN\n")
    (ws["marker"] / "mock-check-runs-failures").write_text("")
    res = _run(run_cmd, ws)
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode}: {res.output}"
    assert "alle grün" in res.output, "Positiv-Anker verletzt - Testaufbau kaputt, nicht der Fix"


def test_anker_ein_echt_roter_job_wird_als_rot_gemeldet(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-check-runs-failures").write_text("Factory spec shard 2: https://example.invalid/1\n")
    sha = _head(ws)
    (m / "mock-run-list").write_text(
        f'[{{"databaseId":42,"headSha":"{sha}","status":"completed","conclusion":"failure"}}]\n')
    (m / "mock-jobs-failures").write_text("1\n")
    res = _run(run_cmd, ws)
    assert res.returncode != 0


def test_t014466_unbestimmbarer_run_lookup_meldet_nicht_alle_gruen(run_cmd, ws):
    # check-runs meldet failure, aber gh run list liefert nichts.
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-check-runs-failures").write_text("Factory spec shard 2: https://example.invalid/1\n")
    (m / "mock-run-list").write_text("[]\n")
    res = _run(run_cmd, ws)
    assert "alle grün" not in res.output, f"FALSCH GRUEN: rote check-runs + leerer Run-Lookup als gruen gemeldet\n{res.output}"
    assert res.returncode != 0, "Exit 0 trotz roter check-runs"


def test_t014466_der_run_lookup_fragt_nicht_den_lokalen_branch_ab(run_cmd, ws):
    script_text = ws["script"].read_text()
    matches = [f"{n}:{ln}" for n, ln in enumerate(script_text.splitlines(), start=1) if "run list" in ln]
    # grep -n 'run list' muss Treffer liefern (status 0).
    assert matches, "grep -n 'run list' ohne Treffer"
    output = "\n".join(matches)
    assert "rev-parse --abbrev-ref HEAD" not in output, \
        f"Run-Lookup haengt weiterhin am lokalen Branch: {output}"


def test_t014466_ein_nachweislich_harmloses_aggregat_bleibt_gruen(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-check-runs-failures").write_text("Aggregat: https://example.invalid/1\n")
    sha = _head(ws)
    (m / "mock-run-list").write_text(
        f'[{{"databaseId":42,"headSha":"{sha}","status":"completed","conclusion":"failure"}}]\n')
    (m / "mock-jobs-failures").write_text("0\n")
    res = _run(run_cmd, ws)
    assert res.returncode == 0, f"harmloses Aggregat faelschlich als rot behandelt: {res.output}"


def test_t014466_nicht_bestimmbarer_pr_branch_entlastet_nicht(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "mock-check-runs-failures").write_text("Aggregat: https://example.invalid/1\n")
    (m / "mock-head-ref-name").write_text("")
    res = _run(run_cmd, ws)
    assert "alle grün" not in res.output, f"FALSCH GRUEN bei unbestimmbarem PR-Branch\n{res.output}"
    assert res.returncode != 0
