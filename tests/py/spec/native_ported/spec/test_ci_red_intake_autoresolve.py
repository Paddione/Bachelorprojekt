"""Native migration of tests/spec/ci-red-intake-autoresolve.bats.

Ticket-Pfad retiriert 2026-10-14: Intake/Resolve arbeiten auf GitHub-Issues
(Label-Prefix 'CI-Rot auf main:'). Fake-`gh` deckt api + issue-Verben ab.
"""

import os
import re
import stat
from pathlib import Path

# Ticket: T900759 (CI-Rot-Intake entprellen per Auto-Resolve)
#
# Das SUT ist scripts/ci-red-intake.sh (Subcommands `intake` + `resolve`,
# Wrapper um scripts/ci_red_intake.py).

STUB_GH = r'''#!/bin/sh
echo "gh $*" >> "$GH_LOG"
case "$*" in
  *"api "*)
    if [ "${GH_API_EXIT:-0}" != "0" ]; then
      echo "stub-gh: api failed" >&2
      exit "${GH_API_EXIT:-1}"
    fi
    if [ -n "${GH_CHECK_RUNS_JSON:-}" ]; then
      printf '%s\n' "$GH_CHECK_RUNS_JSON"
    else
      printf '%s\n' '{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/1","head_sha":"abc1234567890"}]}'
    fi
    exit 0
    ;;
  *"issue list"*)
    if [ -n "${GH_ISSUE_LIST_JSON:-}" ]; then
      printf '%s\n' "$GH_ISSUE_LIST_JSON"
    else
      printf '[]\n'
    fi
    exit 0
    ;;
  *"issue create"*)
    echo "https://github.com/Paddione/Bachelorprojekt/issues/7"
    exit 0
    ;;
  *"issue comment"*)
    echo "Comment added"
    exit 0
    ;;
  *"issue close"*)
    echo "Closed"
    exit 0
    ;;
esac
'''


class _Ctx:
    """Per-test state: stub-gh on PATH, gh.log, env seams."""

    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.repo_root = repo_root
        self.sut = repo_root / "scripts/ci-red-intake.sh"
        self.tmp = tmp_path
        self.bin = tmp_path / "bin"
        self.bin.mkdir(parents=True, exist_ok=True)
        self.gh_log = tmp_path / "gh.log"
        self.gh_log.write_text("")
        self.env = {"GH_LOG": str(self.gh_log)}
        self.status = None
        self.output = ""

    def _write_stub(self, name: str, body: str):
        path = self.bin / name
        path.write_text(body)
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def stub_gh(self):
        self._write_stub("gh", STUB_GH)
        self.env["PATH"] = f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}"

    def run_sut(self, *args):
        res = self.run_cmd(["bash", str(self.sut), *args], env=self.env)
        self.status = res.returncode
        self.output = res.output
        return res

    def gh_log_text(self) -> str:
        return self.gh_log.read_text()


def _grep_q(text: str, pattern: str) -> bool:
    """grep -q PATTERN (basic regex, literal enough for these patterns)."""
    return re.search(pattern, text, re.M) is not None


# --- intake ----------------------------------------------------------------

def test_t900759_intake_legt_bei_rot_genau_ein_issue_mit_titelmuster_an(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":2,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"},'
        '{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/8","head_sha":"abc1234567890"}]}'
    )
    ctx.run_sut("intake", "--sha", "abc1234567890", "--workflow", "ci")
    assert ctx.status == 0
    log = ctx.gh_log_text()
    assert _grep_q(log, "issue create")
    assert _grep_q(log, "CI-Rot auf main: ci @ abc1234")


def test_t900759_zweite_intake_gleicher_sha_kommentiert_statt_duplikat_t001147(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"}]}'
    )
    ctx.env["GH_ISSUE_LIST_JSON"] = (
        '[{"number":11,"title":"CI-Rot auf main: ci @ abc1234 (ci)"}]'
    )
    ctx.run_sut("intake", "--sha", "abc1234567890", "--workflow", "ci")
    assert ctx.status == 0
    log = ctx.gh_log_text()
    assert not _grep_q(log, r"issue create")
    assert _grep_q(log, "issue comment 11 ")
    assert _grep_q(log, "abc1234")


# --- resolve ---------------------------------------------------------------

def test_t900759_resolve_schliesst_bei_gruenem_beleg_run_mit_beleg_kommentar(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":2,"check_runs":[{"name":"ci","conclusion":"success","html_url":"https://example.invalid/run/9","head_sha":"def9876543210"},'
        '{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/10","head_sha":"def9876543210"}]}'
    )
    ctx.env["GH_ISSUE_LIST_JSON"] = (
        '[{"number":11,"title":"CI-Rot auf main: ci @ abc1234 (ci)"}]'
    )
    ctx.run_sut("resolve", "--sha", "def9876543210")
    assert ctx.status == 0
    log = ctx.gh_log_text()
    assert _grep_q(log, "issue comment 11 ")
    assert _grep_q(log, "https://example.invalid/run/9")
    assert _grep_q(log, "issue close 11")


def test_t900759_resolve_bei_unbestimmbarem_ci_status_schliesst_nichts_fail_closed(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.env["GH_API_EXIT"] = "1"
    ctx.env["GH_ISSUE_LIST_JSON"] = (
        '[{"number":11,"title":"CI-Rot auf main: ci @ abc1234 (ci)"}]'
    )
    ctx.run_sut("resolve", "--sha", "def9876543210")
    assert ctx.status != 0
    assert not _grep_q(ctx.gh_log_text(), "issue close")


# --- Konvention --------------------------------------------------------------

def test_t900759_agents_md_enthaelt_den_auto_resolve_abschnitt(repo_root):
    assert _grep_q((repo_root / "AGENTS.md").read_text(), "Auto-Resolve")
