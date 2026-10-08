"""Native migration of tests/spec/scripts/wip-finish.bats."""

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

# wip-finish.sh — Sicherheitsmodell des abandoned-WIP-Finishers. [T900481]
#
# Diese Suite testet bewusst das FALSCHE Verhalten: dass wip-finish im
# Planlauf nichts anfasst, ohne --allow nichts ausfuehrt, fremde Arbeit nicht
# committed und eine Rail-Antwort mit nicht angebotener Aktion verwirft.

AGENT_LOCK_STUB = """case "${1:-}" in
  mine) exit 1 ;;
  list) exit 0 ;;
  *)   exit 0 ;;
esac
"""

# stub curl: Rail antwortet, Inhalt per $STUB_RAIL_REPLY
# Nur die 2. GPU (:1920) ist als Rail "erreichbar" -- alles andere (z.B. :1)
# bleibt bewusst unreachable, damit die fail-closed-Pfade testbar sind.
CURL_STUB = """case "$*" in
  *"127.0.0.1:1920/v1/models"*) printf '{"data":[{"id":"stub-4b"}]}' ;;
  *"127.0.0.1:1920/v1/chat/completions"*)
    body="${STUB_RAIL_REPLY:-ACT=none|REASON=keine}"
    jq -nc --arg c "$body" '{choices:[{message:{content:$c}}]}' ;;
  *) exit 7 ;;
esac
"""


def _jq(expr: str, text: str, raw: bool = True) -> str:
    """jq [-r] EXPR <<< TEXT, with $(...) trailing-newline stripping."""
    args = ["jq", "-r", expr] if raw else ["jq", expr]
    proc = subprocess.run(args, input=text + "\n", capture_output=True, text=True)
    return proc.stdout.rstrip("\n")


def _jq_e(expr: str, text: str) -> bool:
    """echo TEXT | jq -e EXPR > /dev/null  -> exit status 0?"""
    proc = subprocess.run(["jq", "-e", expr], input=text + "\n",
                          capture_output=True, text=True)
    return proc.returncode == 0


def _write_exec(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _wt(path, branch, state, modified, age_hours) -> str:
    """wt() helper: one worktree entry exactly as wip-glance.sh --json emits it."""
    return ('{"path":"%s","head":"deadbeef","branch":"%s","state":"%s","modified":%s,'
            '"deleted":0,"untracked":0,"age_hours":%s,"locked":false,"prunable":false}'
            % (path, branch, state, modified, age_hours))


class _WipFinish:
    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.finish = repo_root / "scripts/wip-finish.sh"
        self.tmp = tmp_path
        self.fix = tmp_path / "repo"
        bindir = tmp_path / "bin"
        (self.fix / "scripts").mkdir(parents=True)
        (tmp_path / "locks").mkdir()
        bindir.mkdir()
        self.env = {
            "AGENT_LOCK_DIR": str(tmp_path / "locks"),
            "PATH": f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}",
        }
        _write_exec(self.fix / "scripts" / "agent-lock.sh", AGENT_LOCK_STUB)
        _write_exec(bindir / "curl", CURL_STUB)
        self.status = None
        self.output = ""

    def glance_stub(self, *fragments: str):
        """glance_stub: a fake wip-glance.sh emitting the given worktree fragments."""
        body = (
            "#!/usr/bin/env bash\n"
            "cat <<'JSON'\n"
            f'{{"repo":"{self.fix}","stale_hours":24,\n'
            f' "worktrees":[{",".join(fragments)}],\n'
            ' "locks":[],"prs":[],"branches":[],"stashes":0,"stash_list":[]}\n'
            "JSON\n"
        )
        _write_exec(self.fix / "scripts" / "wip-glance.sh", body)

    def run(self, *args, extra_env=None):
        res = self.run_cmd(["bash", str(self.finish), *args],
                           env={**self.env, **(extra_env or {})})
        self.status = res.returncode
        self.output = res.output
        return res

    def run_finish(self, *args, extra_env=None):
        """run_finish: wip-finish against the fixture repo with the unreachable rail :1."""
        return self.run("--repo", str(self.fix), "--rails", "127.0.0.1:1", *args,
                        extra_env=extra_env)


@pytest.fixture
def wf(run_cmd, repo_root, tmp_path):
    return _WipFinish(run_cmd, repo_root, tmp_path)


def test_wip_finish_fail_closed_unbekanntes_argument_exit_2(wf):
    wf.run("--repo", str(wf.fix), "--unsinn")
    assert wf.status == 2
    assert "unbekanntes Argument" in wf.output


def test_wip_finish_fail_closed_stale_hours_ohne_zahl_exit_2(wf):
    wf.run("--repo", str(wf.fix), "--stale-hours", "abc")
    assert wf.status == 2
    assert "--stale-hours braucht eine Zahl" in wf.output


def test_wip_finish_require_rail_ohne_erreichbare_rail_exit_1(wf):
    wf.glance_stub(_wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40))
    wf.run_finish("--require-rail")
    assert wf.status == 1
    assert "keine Rail erreichbar" in wf.output


def test_wip_finish_plan_only_laeuft_read_only_und_meldet_kandidaten(wf):
    wf.glance_stub(
        _wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40),
        _wt(str(wf.fix / "wt2"), "feature/live-T900481", "live", 1, 1),
    )
    marker = wf.tmp / "marker"
    marker.write_text("dirty\n")
    before = "".join(f"{n} " for n in sorted(os.listdir(wf.tmp)))
    wf.run_finish("--json")
    assert wf.status == 0
    assert _jq(".apply", wf.output) == "0"
    # abandoned+dirty -> commit-dirty, live -> none
    assert _jq('.plan[]|select(.state=="abandoned")|.id', wf.output) == str(wf.fix)
    assert _jq('.plan[]|select(.state=="abandoned")|.action', wf.output) == "commit-dirty"
    assert _jq('.plan[]|select(.state=="live")|.action', wf.output) == "none"
    after = "".join(f"{n} " for n in sorted(os.listdir(wf.tmp)))
    assert before == after
    assert marker.read_text().rstrip("\n") == "dirty"


def test_wip_finish_apply_ohne_allow_fuehrt_nichts_aus(wf):
    wf.glance_stub(_wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40))
    wf.run_finish("--apply", "--json")
    assert wf.status == 0
    assert _jq(".plan[0].applied", wf.output) == "skipped (nicht im --allow)"


def test_wip_finish_commit_dirty_ohne_eigenen_live_lock_wird_uebersprungen(wf):
    wf.glance_stub(_wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40))
    wf.run_finish("--apply", "--allow", "commit-dirty", "--json")
    assert wf.status == 0
    assert "kein eigener live Lock" in _jq(".plan[0].applied", wf.output)


def test_wip_finish_rail_antwort_mit_nicht_angebotener_aktion_wird_verworfen(wf):
    wf.glance_stub(_wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40))
    wf.run_finish("--rails", "127.0.0.1:1920", "--json",
                  extra_env={"STUB_RAIL_REPLY": "ACT=rm-rf-slash|REASON=zu riskant"})
    assert wf.status == 0
    assert _jq(".plan[0].rail_action", wf.output) == "none"
    assert "verworfen" in _jq(".plan[0].reason", wf.output)


def test_wip_finish_gueltige_rail_empfehlung_ueberschreibt_die_heuristik(wf):
    wf.glance_stub(
        _wt(str(wf.fix), "feature/x-T900481", "abandoned", 0, 40),
        _wt(str(wf.fix / "wt2"), "feature/y-T900481", "abandoned", 0, 40),
    )
    wf.run_finish("--rails", "127.0.0.1:1920", "--json",
                  extra_env={"STUB_RAIL_REPLY": "ACT=review-stash|REASON=erst Diff pruefen"})
    assert wf.status == 0
    # Heuristik waere review-stash, Rail sagt dasselbe -> rail_action bestaetigt
    assert _jq(".plan[0].rail_action", wf.output) == "review-stash"
    assert _jq(".plan[0].action", wf.output) == "review-stash"


def test_wip_finish_unbrauchbare_rail_antwort_faellt_auf_die_heuristik_zurueck(wf):
    wf.glance_stub(_wt(str(wf.fix), "feature/x-T900481", "abandoned", 2, 40))
    wf.run_finish("--rails", "127.0.0.1:1920", "--json",
                  extra_env={"STUB_RAIL_REPLY":
                             "Ich denke man sollte vielleicht committen, ohne ACT zu nennen."})
    assert wf.status == 0
    assert _jq(".plan[0].action", wf.output) == "commit-dirty"
    assert "unbrauchbar" in _jq(".plan[0].reason", wf.output)


def test_wip_finish_stashes_landen_in_review_stash_nie_in_commit_dirty(wf):
    body = (
        "#!/usr/bin/env bash\n"
        "cat <<'JSON'\n"
        f'{{"repo":"{wf.fix}","stale_hours":24,"worktrees":[{_wt(str(wf.fix), "feature/x-T900481", "abandoned", 0, 40)}],\n'
        ' "locks":[],"prs":[],"branches":[],"stashes":2,\n'
        ' "stash_list":[{"index":"stash@{0}","date":"2026-09-20 10:00:00 +0200"},\n'
        '               {"index":"stash@{1}","date":"2026-09-21 10:00:00 +0200"}]}\n'
        "JSON\n"
    )
    _write_exec(wf.fix / "scripts" / "wip-glance.sh", body)
    wf.run_finish("--json")
    assert wf.status == 0
    actions = _jq('.plan[]|select(.kind=="stash")|.action', wf.output)
    assert sorted(set(actions.splitlines())) == ["review-stash"]
