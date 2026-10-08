"""Native migration of tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats."""

import os
import stat
import subprocess
from pathlib import Path

import pytest

TICKET_SH = """#!/usr/bin/env bash
echo "ticket.sh $*" >> "$MARKER_DIR/ticket-calls"
case "$1" in
  assert-phase-chain) exit 0 ;;
  *) exit 0 ;;
esac
"""

GH_TEMPLATE = """#!/usr/bin/env bash
echo "gh $*" >> "@MARKER@/gh-calls"
args="$*"
case "$args" in
  "pr view --json number -q .number") echo 1 ;;
  *"--json mergeStateStatus"*) echo "" ;;
  *"--json mergeable "*|*"--json mergeable") echo "MERGEABLE" ;;
  *"--json state -q .state") cat "@MARKER@/pr-state" 2>/dev/null || echo "OPEN" ;;
  *"--json headRefName -q .headRefName")
    echo "feature/stub-branch"
    ;;
  *"--json headRefOid -q .headRefOid")
    if [[ -f "@MARKER@/mock-head-ref-oid" ]]; then
      cat "@MARKER@/mock-head-ref-oid"
    else
      git -C "@WORK@" rev-parse HEAD
    fi
    ;;
  *"pr checks"*"--watch"*)
    touch "@MARKER@/watch-called"
    for a in $@; do
      case "$a" in
        https://*|http://*) echo "$a" >> "@MARKER@/pr-watch-urls" ;;
      esac
    done
    if [[ -f "@MARKER@/watch-fail" ]]; then exit 1; fi
    exit 0
    ;;
  *"--json statusCheckRollup"*)
    # Route to the correct mock based on the jq query content
    if [[ "$args" == *'"FAILURE"'* || "$args" == *'"TIMED_OUT"'* ]]; then
      cat "@MARKER@/mock-rollup-failures" 2>/dev/null || true
    elif [[ "$args" == *'"COMPLETED"'* || "$args" == *'COMPLETED'* ]]; then
      cat "@MARKER@/mock-rollup-pending" 2>/dev/null || echo "0"
    else
      # Generic statusCheckRollup query (no specific keyword) - assume empty
      echo ""
    fi
    ;;
  *"check-runs"*"total_count"*)
    if [[ -f "@MARKER@/mock-total-checks" ]]; then
      cat "@MARKER@/mock-total-checks"
    else
      echo "3"
    fi
    ;;
  *) echo "" ;;
esac
"""


def _git(work: Path, *args):
    return subprocess.run(["git", "-C", str(work), *args], capture_output=True, text=True)


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

    # Fake git repo: `git rev-parse HEAD` resolves on the NOT-merged path.
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
            "TICKET_SH": str(work / "scripts/ticket.sh"),
            "PATH": f"{work / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}",
        },
    }


def _run(run_cmd, w, *args):
    # `env -C WORK` setzt das Arbeitsverzeichnis; BATS `run` merged stderr.
    # Das Skript pollt bei IN_PROGRESS-Checks mit Wartezeiten: kein 60s-Limit.
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(w["script"]), *args],
                   cwd=w["work"], env=w["env"], timeout=900)


def test_t002671_an_open_not_yet_merged_pr_still_reaches_gh_pr_checks_watch_unchanged_happy_path(run_cmd, ws):
    (ws["marker"] / "pr-state").write_text("OPEN\n")
    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1")
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode}: {res.output}"
    assert (ws["marker"] / "watch-called").exists(), \
        "Positiv-Anker verletzt: gh pr checks --watch wurde fuer eine offene PR NICHT aufgerufen"


def test_t002671_a_merged_pr_must_exit_0_without_ever_reaching_the_blocking_gh_pr_checks_watch_call(run_cmd, ws):
    (ws["marker"] / "pr-state").write_text("MERGED\n")
    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1")
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode}: {res.output}"
    assert not (ws["marker"] / "watch-called").exists(), \
        "gh pr checks --watch WURDE fuer eine bereits gemergte PR aufgerufen"


def test_t003612_a_gh_pr_checks_watch_receives_the_pr_url_argument_not_cwd_bare_call(run_cmd, ws):
    (ws["marker"] / "pr-state").write_text("OPEN\n")
    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/42")
    assert res.returncode == 0, f"unerwarteter Exit {res.returncode}: {res.output}"
    urls = ws["marker"] / "pr-watch-urls"
    assert urls.exists() and "https://github.com/x/y/pull/42" in urls.read_text(), \
        "gh pr checks --watch wurde OHNE die PR-URL aufgerufen - cwd-Rueckfall, Bug 1"


def test_t003612_b_in_progress_checks_must_not_trigger_false_green_exit(run_cmd, ws):
    m = ws["marker"]
    (m / "pr-state").write_text("OPEN\n")
    (m / "watch-fail").write_text("")
    (m / "mock-rollup-failures").write_text("")
    (m / "mock-rollup-pending").write_text("1\n")
    (m / "mock-total-checks").write_text("1\n")
    (m / "mock-head-ref-oid").write_text(
        subprocess.run(["git", "-C", str(ws["work"]), "rev-parse", "HEAD"],
                       capture_output=True, text=True, check=True).stdout)
    res = _run(run_cmd, ws, "T999999", "https://github.com/x/y/pull/1")
    assert res.returncode != 0, "Bug 3 reproduziert: Script meldete 'alle gruen' (exit 0) obwohl ein Check noch IN_PROGRESS war"
