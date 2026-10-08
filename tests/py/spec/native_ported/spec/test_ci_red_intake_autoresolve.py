"""Native migration of tests/spec/ci-red-intake-autoresolve.bats."""

import os
import re
import stat
from pathlib import Path

# Ticket: T900759 (CI-Rot-Intake entprellen per Auto-Resolve)
#
# Stub-Vorbild: tests/spec/cbm-refresh-cron-A4.bats (PATH-Override mit
# fake-`gh` und fake-`ticket.sh`, Aufruf-Logs in $BATS_TEST_TMPDIR).
# Das SUT ist scripts/ci-red-intake.sh (Subcommands `intake` + `resolve`).

STUB_GH = r'''#!/bin/sh
echo "gh $*" >> "$GH_LOG"
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
'''

STUB_TICKET = r'''#!/bin/sh
echo "ticket.sh $*" >> "$TICKET_LOG"
case "$1" in
  list)
    if [ -n "${TICKET_LIST_JSON:-}" ]; then
      printf '%s\n' "$TICKET_LIST_JSON"
    else
      printf '[]\n'
    fi
    exit 0
    ;;
  create)
    echo "T999001"
    exit 0
    ;;
  add-comment|comment)
    echo "Comment added"
    exit 0
    ;;
  update-status)
    echo "Status updated"
    exit 0
    ;;
  *)
    echo "stub-ticket.sh: unknown subcommand $1" >&2
    exit 2
    ;;
esac
'''


class _Ctx:
    """Per-test state mirroring the BATS setup(): stubs on PATH, logs, env seams."""

    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.repo_root = repo_root
        self.sut = repo_root / "scripts/ci-red-intake.sh"
        self.tmp = tmp_path
        self.bin = tmp_path / "bin"
        self.bin.mkdir(parents=True, exist_ok=True)
        self.gh_log = tmp_path / "gh.log"
        self.ticket_log = tmp_path / "ticket.log"
        self.gh_log.write_text("")
        self.ticket_log.write_text("")
        self.env = {"GH_LOG": str(self.gh_log), "TICKET_LOG": str(self.ticket_log)}
        self.status = None
        self.output = ""

    def _write_stub(self, name: str, body: str):
        path = self.bin / name
        path.write_text(body)
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def stub_gh(self):
        self._write_stub("gh", STUB_GH)
        self.env["PATH"] = f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}"

    def stub_ticket(self):
        self._write_stub("ticket.sh", STUB_TICKET)
        self.env["PATH"] = f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}"
        # TICKET_SH-Seam: per PATH-Lookup greift der Fake, nicht die echte Ticket-DB.
        self.env["TICKET_SH"] = "ticket.sh"

    def empty_mishap_buffer(self):
        buf = self.tmp / "mishap-buffer.json"
        buf.write_text("[]\n")
        self.env["MISHAP_BUFFER"] = str(buf)

    def run_sut(self, *args):
        res = self.run_cmd(["bash", str(self.sut), *args], env=self.env)
        self.status = res.returncode
        self.output = res.output
        return res

    def ticket_log_text(self) -> str:
        return self.ticket_log.read_text()


def _grep_q(text: str, pattern: str) -> bool:
    """grep -q PATTERN (basic regex, literal enough for these patterns)."""
    return re.search(pattern, text, re.M) is not None


# --- intake ----------------------------------------------------------------

def test_t900759_intake_legt_bei_rot_genau_ein_ticket_mit_titelmuster_an(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.stub_ticket()
    ctx.empty_mishap_buffer()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":2,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"},'
        '{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/8","head_sha":"abc1234567890"}]}'
    )
    ctx.run_sut("intake", "--sha", "abc1234567890", "--workflow", "ci")
    assert ctx.status == 0
    log = ctx.ticket_log_text()
    assert _grep_q(log, "create")
    assert _grep_q(log, r"type=bug|--type bug")
    assert _grep_q(log, "CI-Rot auf main: ci @ abc1234")


def test_t900759_zweite_intake_gleicher_sha_kommentiert_statt_duplikat_t001147(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.stub_ticket()
    ctx.empty_mishap_buffer()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"}]}'
    )
    ctx.env["TICKET_LIST_JSON"] = (
        '[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
    )
    ctx.run_sut("intake", "--sha", "abc1234567890", "--workflow", "ci")
    assert ctx.status == 0
    log = ctx.ticket_log_text()
    assert not _grep_q(log, r"^ticket.sh create")
    assert _grep_q(log, "add-comment")
    assert _grep_q(log, "T123456")


def test_t900759_mishap_buffer_eintrag_gleichen_titels_blockt_neuanlage_t002844(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.stub_ticket()
    buf = tmp_path / "mishap-buffer.json"
    buf.write_text('[{"title":"CI-Rot auf main: ci @ abc1234 (ci)"}]\n')
    ctx.env["MISHAP_BUFFER"] = str(buf)
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":1,"check_runs":[{"name":"ci","conclusion":"failure","html_url":"https://example.invalid/run/7","head_sha":"abc1234567890"}]}'
    )
    ctx.env["TICKET_LIST_JSON"] = "[]"
    ctx.run_sut("intake", "--sha", "abc1234567890", "--workflow", "ci")
    assert ctx.status == 0
    assert not _grep_q(ctx.ticket_log_text(), r"^ticket.sh create")


# --- resolve ---------------------------------------------------------------

def test_t900759_resolve_schliesst_bei_gruenem_beleg_run_als_done_mit_beleg_kommentar(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.stub_ticket()
    ctx.empty_mishap_buffer()
    ctx.env["GH_CHECK_RUNS_JSON"] = (
        '{"total_count":2,"check_runs":[{"name":"ci","conclusion":"success","html_url":"https://example.invalid/run/9","head_sha":"def9876543210"},'
        '{"name":"lint","conclusion":"success","html_url":"https://example.invalid/run/10","head_sha":"def9876543210"}]}'
    )
    ctx.env["TICKET_LIST_JSON"] = (
        '[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
    )
    ctx.run_sut("resolve", "--sha", "def9876543210")
    assert ctx.status == 0
    log = ctx.ticket_log_text()
    assert _grep_q(log, "add-comment")
    assert _grep_q(log, "https://example.invalid/run/9")
    assert _grep_q(log, "update-status")
    assert _grep_q(log, "done")


def test_t900759_resolve_bei_unbestimmbarem_ci_status_schliesst_nichts_fail_closed(run_cmd, repo_root, tmp_path):
    ctx = _Ctx(run_cmd, repo_root, tmp_path)
    ctx.stub_gh()
    ctx.stub_ticket()
    ctx.empty_mishap_buffer()
    ctx.env["GH_API_EXIT"] = "1"
    ctx.env["TICKET_LIST_JSON"] = (
        '[{"external_id":"T123456","title":"CI-Rot auf main: ci @ abc1234 (ci)","status":"triage"}]'
    )
    ctx.run_sut("resolve", "--sha", "def9876543210")
    assert ctx.status != 0
    assert not _grep_q(ctx.ticket_log_text(), "update-status")


# --- Konvention --------------------------------------------------------------

def test_t900759_agents_md_enthaelt_den_auto_resolve_abschnitt(repo_root):
    assert _grep_q((repo_root / "AGENTS.md").read_text(), "Auto-Resolve")
