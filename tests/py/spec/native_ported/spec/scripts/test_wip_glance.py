"""Native migration of tests/spec/scripts/wip-glance.bats."""

import os
import stat
import subprocess
import time
from pathlib import Path

import pytest

# wip-glance.sh — WIP-Uebersicht (read-only, fail-closed). [T900481]

AGENT_LOCK_STUB = r"""#!/usr/bin/env bash
# Stub: emuliert agent-lock.sh list mit einem deterministischen Zustand.
printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' SCOPE ID TOOL SID STATE LABEL FILE
for f in "$AGENT_LOCK_DIR"/*.json; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .json)"
  printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' \
    "$(jq -r '.scope // ""' "$f")" "$(jq -r '.id // ""' "$f")" "$(jq -r '.tool // ""' "$f")" \
    "$(jq -r '.owner_sid // ""' "$f")" "$(jq -r '.fake_state // "live"' "$f")" \
    "$(jq -r '.label // ""' "$f")" "$name"
done
"""

# Stub-git: beantwortet nur die Aufrufe, die wip-glance.sh tatsaechlich braucht.
GIT_STUB = r"""#!/usr/bin/env bash
args="$*"
case "$args" in
  "rev-parse --show-toplevel") echo "$FIX_REPO" ;;
  "rev-parse --git-common-dir") echo "$BATS_TEST_TMPDIR/cgd" ;;
  "rev-parse --verify origin/main") exit 0 ;;
  "worktree list --porcelain") cat "$FIX_WT" ;;
  "for-each-ref --format=%(refname:short) refs/heads/") cat "$FIX_BRANCHES" 2>/dev/null || true ;;
  "stash list --format=%gd|%ci") cat "$FIX_STASHES" 2>/dev/null || true ;;
  *"-C $WT_DIR status --porcelain"*) cat "$FIX_STATUS" ;;
  *"-C $WT_DIR log -1 --format=%ct"*) cat "$FIX_HEAD_TS" ;;
  *) exit 0 ;;
esac
"""


def _jq_r(expr: str, text: str) -> str:
    """jq -r EXPR <<< TEXT with $(...) trailing-newline stripping."""
    proc = subprocess.run(["jq", "-r", expr], input=text + "\n", capture_output=True, text=True)
    return proc.stdout.rstrip("\n")


def _jq_e(expr: str, text: str) -> bool:
    """echo TEXT | jq -e EXPR > /dev/null -> exit status 0?"""
    proc = subprocess.run(["jq", "-e", expr], input=text + "\n", capture_output=True, text=True)
    return proc.returncode == 0


def _write_exec(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _ls_joined(directory: Path) -> str:
    """ls -1 DIR | sort | tr '\\n' ' '."""
    return "".join(f"{n} " for n in sorted(os.listdir(directory)))


class _Glance:
    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.glance = repo_root / "scripts/wip-glance.sh"
        self.tmp = tmp_path
        self.fix = tmp_path / "fixture"
        self.bindir = tmp_path / "bin"
        self.locks = tmp_path / "locks"
        self.wt_dir = tmp_path / "wt"
        for d in (self.fix / "scripts", self.bindir, self.locks, self.wt_dir):
            d.mkdir(parents=True, exist_ok=True)
        _write_exec(self.fix / "scripts" / "agent-lock.sh", AGENT_LOCK_STUB)
        _write_exec(self.bindir / "git", GIT_STUB)
        self.fix_wt = tmp_path / "porcelain"
        self.fix_status = tmp_path / "status"
        self.fix_head_ts = tmp_path / "headts"
        self.fix_branches = tmp_path / "branches"
        self.fix_stashes = tmp_path / "stashes"
        self.env = {
            "FIX_REPO": str(self.fix),
            "FIX_WT": str(self.fix_wt),
            "WT_DIR": str(self.wt_dir),
            "FIX_STATUS": str(self.fix_status),
            "FIX_HEAD_TS": str(self.fix_head_ts),
            "FIX_BRANCHES": str(self.fix_branches),
            "FIX_STASHES": str(self.fix_stashes),
            "AGENT_LOCK_DIR": str(self.locks),
            "PATH": f"{self.bindir}{os.pathsep}{os.environ.get('PATH', '')}",
            "BATS_TEST_TMPDIR": str(tmp_path),
        }
        self.fix_wt.write_text(
            f"worktree {self.wt_dir}\n"
            f"HEAD {0:040d}\n"
            "branch refs/heads/feature/x\n")
        self.fix_status.write_text("")
        self.fix_stashes.write_text("")
        self.fix_branches.write_text("")
        self.fix_head_ts.write_text(f"{int(time.time())}\n")
        self.status = None
        self.output = ""

    def run(self, *args):
        res = self.run_cmd(["bash", str(self.glance), *args], env=self.env)
        self.status = res.returncode
        self.output = res.output
        return res

    def lock_list(self) -> str:
        res = self.run_cmd(["bash", str(self.fix / "scripts" / "agent-lock.sh"), "list"],
                           env=self.env)
        return res.stdout.rstrip("\n")


@pytest.fixture
def gl(run_cmd, repo_root, tmp_path):
    return _Glance(run_cmd, repo_root, tmp_path)


def test_wip_glance_json_liefert_parsebares_json_mit_worktrees_array(gl):
    gl.run("--json", "--repo", str(gl.fix))
    assert gl.status == 0
    assert _jq_e(".worktrees | length == 1", gl.output)
    assert _jq_e('.worktrees[0] | has("path") and has("state") and has("age_hours")', gl.output)
    assert _jq_e('has("locks") and has("prs") and has("stashes")', gl.output)


def test_wip_glance_quiet_gibt_genau_eine_zusammenfassungszeile(gl):
    gl.run("--quiet", "--repo", str(gl.fix))
    assert gl.status == 0
    lines = gl.output.splitlines()
    assert len(lines) == 1
    assert gl.output.startswith("abandoned=")
    assert "stashes=" in gl.output


def test_wip_glance_read_only_legt_keine_lock_datei_an_und_veraendert_die_lock_liste_nicht(gl):
    (gl.locks / "branch__feature-x.json").write_text(
        '{"scope":"branch","id":"feature/x","label":"dev","fake_state":"live"}\n')
    before_list = gl.lock_list()
    before_files = _ls_joined(gl.locks)
    gl.run("--json", "--repo", str(gl.fix))
    assert gl.status == 0
    after_list = gl.lock_list()
    after_files = _ls_joined(gl.locks)
    assert before_list == after_list
    assert before_files == after_files


def test_wip_glance_worktree_mit_live_lock_ist_live_ohne_lock_idle(gl):
    gl.fix_status.write_text(" M scripts/foo.sh\n")
    gl.fix_head_ts.write_text(f"{int(time.time()) - 2 * 86400}\n")
    lock = gl.locks / "branch__feature-x.json"
    lock.write_text('{"scope":"branch","id":"feature/x","label":"dev","fake_state":"live"}\n')
    gl.run("--json", "--repo", str(gl.fix))
    assert gl.status == 0
    assert _jq_r(".worktrees[0].state", gl.output) == "live"

    lock.unlink()
    gl.run("--json", "--repo", str(gl.fix), "--stale-hours", "999999")
    assert gl.status == 0
    assert _jq_r(".worktrees[0].state", gl.output) == "unlocked-dirty"


def test_wip_glance_dirty_alter_commit_jenseits_stale_hours_ist_abandoned(gl):
    gl.fix_status.write_text("?? neu.txt\n M scripts/foo.sh\n")
    gl.fix_head_ts.write_text(f"{int(time.time()) - 3 * 86400}\n")
    gl.run("--json", "--repo", str(gl.fix), "--stale-hours", "24")
    assert gl.status == 0
    assert _jq_r(".worktrees[0].state", gl.output) == "abandoned"
    assert _jq_r(".worktrees[0].untracked", gl.output) == "1"
    assert _jq_r(".worktrees[0].modified", gl.output) == "1"


def test_wip_glance_fail_closed_bei_kaputten_argumenten_exit_2_keine_ausgabe(gl):
    gl.run("--unsinn", "--repo", str(gl.fix))
    assert gl.status == 2
    gl.run("--stale-hours", "abc", "--repo", str(gl.fix))
    assert gl.status == 2
    gl.run("--stale-hours", "--repo", str(gl.fix))
    assert gl.status == 2
