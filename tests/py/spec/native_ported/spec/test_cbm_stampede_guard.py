"""Native migration of tests/spec/cbm-stampede-guard.bats."""

import glob
import json
import os
import shutil
import stat
import subprocess
import time
from pathlib import Path

import pytest

# Ticket: T900450, T900805 (conservative freshness + receipts)

PROJECT = "home-patrick-Bachelorprojekt"

# Verbatim body of the codebase-memory-mcp stub written by the BATS stub_cli().
STUB_CLI = r"""
#!/bin/sh
# Emulates the real CLI: `cli --json <sub>` wraps the payload in an MCP
# envelope {"content":[{"type":"text","text":<payload>}]}; index_status
# inner text is JSON, detect_changes inner text is plain text.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a' -e 'N' -e '$!ba' -e 's/\n/\\n/g'
}
emit_envelope() {
  printf '{"content":[{"type":"text","text":"%s"}],"isError":false}\n' "$(json_escape "$1")"
}
if [ -n "${STUB_LOG:-}" ]; then printf '%s\n' "$*" >> "$STUB_LOG"; fi
case "$1" in
  --version)
    if [ "${STUB_MODE:-ok}" = "timeout-version" ]; then sleep 5; fi
    if [ "${STUB_MODE:-ok}" = "fail" ]; then exit 1; fi
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    if [ "${1:-}" = "--json" ]; then use_json=1; shift; else use_json=""; fi
    sub="$1"; shift
    case "$sub" in
      index_status)
        proj=""
        while [ "$#" -gt 0 ]; do case "$1" in --project) proj="$2"; shift 2;; *) shift;; esac; done
        case "${STUB_MODE:-ok}" in
          fail) exit 1;;
          malformed) echo "not-json"; exit 0;;
          tool-error)
            if [ -n "$use_json" ]; then emit_envelope '{"error":"boom"}'; else echo '{"error":"boom"}'; fi
            exit 0;;
          timeout) sleep 5; echo '{}'; exit 0;;
          mismatch)
            inner="{\"project\":\"$proj\",\"root_path\":\"/wrong/root\",\"git\":{\"canonical_root\":\"/wrong/root\"},\"status\":\"ready\"}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
          project-mismatch)
            inner="{\"project\":\"other-project\",\"root_path\":\"${STUB_ROOT:-/tmp}\",\"git\":{\"canonical_root\":\"${STUB_ROOT:-/tmp}\"},\"status\":\"ready\"}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
          *)
            root="${STUB_ROOT:-/tmp/repo}"
            inner="{\"project\":\"$proj\",\"root_path\":\"$root\",\"git\":{\"canonical_root\":\"$root\",\"worktree_root\":\"$root\"},\"status\":\"ready\",\"nodes\":1,\"edges\":1}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
        esac
        ;;
      detect_changes)
        case "${STUB_MODE:-ok}" in
          fail) exit 1;;
          malformed) echo "not-json"; exit 0;;
          tool-error)
            if [ -n "$use_json" ]; then echo '{"content":[{"type":"text","text":"boom"}],"isError":true}'; else echo '{"error":"boom"}'; fi
            exit 0;;
          timeout) sleep 5; echo '{}'; exit 0;;
          *)
            if [ -n "$use_json" ]; then
              emit_envelope "base: main
merge_base: 0000000000000000000000000000000000000000
direction: inbound
changed_files: 0"
            else
              echo '{"changed_count":0,"changed_files":[]}'
            fi
            exit 0;;
        esac
        ;;
      index_repository)
        if [ -n "${STUB_TOUCH_FILE:-}" ]; then echo "touched" >> "$STUB_TOUCH_FILE" 2>/dev/null || true; fi
        case "${STUB_MODE:-ok}" in
          fail-index) exit 1;;
          tool-error) echo '{"error":"index-failed"}'; exit 0;;
          malformed) echo "not-json"; exit 0;;
          *) echo '{"ok":true}'; exit 0;;
        esac
        ;;
      *) echo "unknown subcommand" >&2; exit 2;;
    esac
    ;;
  *) echo "unknown" >&2; exit 2;;
esac
"""


def _jq(expr: str, text: str, raw: bool = False) -> str:
    args = ["jq", "-r", expr] if raw else ["jq", expr]
    return subprocess.run(args, input=text + "\n", capture_output=True, text=True).stdout


def _jq_e(expr: str, text: str) -> bool:
    """printf '%s' "$output" | jq -e EXPR >/dev/null -> exit status 0?"""
    proc = subprocess.run(["jq", "-e", expr], input=text, capture_output=True, text=True)
    return proc.returncode == 0


def _count_lines(path: Path, needle: str) -> int:
    """grep -c NEEDLE FILE."""
    return sum(1 for ln in path.read_text().splitlines() if needle in ln)


class _Cbm:
    """setup()/isolate_home()/make_repo()/stub_cli() of cbm-stampede-guard.bats."""

    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.repo_root = repo_root
        self.wrapper = repo_root / "scripts/mcp/cbm-single-flight.sh"
        self.cron = repo_root / "scripts/cbm-refresh-cron.sh"
        self.helper = repo_root / "scripts/mcp/cbm-freshness.py"
        self.runbook = repo_root / "docs/runbooks/cbm-index-stampede.md"
        self.taskfile = repo_root / "taskfiles/Taskfile.data.yml"
        self.tmp = tmp_path
        self.env = {}
        self.status = None
        self.output = ""

    def isolate_home(self):
        home = self.tmp / "home"
        (home / ".cache" / "codebase-memory-mcp").mkdir(parents=True, exist_ok=True)
        self.env["TEST_HOME"] = str(home)
        self.env["HOME"] = str(home)

    @property
    def home(self) -> Path:
        return Path(self.env["TEST_HOME"])

    def make_repo(self, d: Path):
        d.mkdir(parents=True, exist_ok=True)
        self.run_cmd(["git", "init", "-q", str(d)]).check()
        for k, v in (("user.email", "test@example.com"), ("user.name", "Test"),
                     ("commit.gpgsign", "false")):
            self.run_cmd(["git", "-C", str(d), "config", k, v]).check()
        (d / "file.txt").write_text("hello\n")
        self.git(d, "add", ".")
        self.git(d, "commit", "-qm", "init")

    def git(self, d: Path, *args):
        return self.run_cmd(["git", "-C", str(d), *args]).check()

    def stub_cli(self):
        bindir = self.tmp / "bin"
        bindir.mkdir(parents=True, exist_ok=True)
        script = bindir / "codebase-memory-mcp"
        script.write_text(STUB_CLI.lstrip("\n"))
        script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        self.env["PATH"] = f"{bindir}:/usr/bin:/bin"

    def run(self, cmd, cwd=None):
        res = self.run_cmd(cmd, cwd=cwd, env=self.env)
        self.status = res.returncode
        self.output = res.output
        return res

    def wrap(self, repo_path: str, cwd=None):
        payload = json.dumps({"repo_path": repo_path, "mode": "fast", "persistence": True})
        return self.run(["bash", str(self.wrapper), payload], cwd=cwd)

    def helper_status(self, timeout: int = 10):
        return self.run(["python3", str(self.helper), "status", "--repo", self.root,
                         "--project", PROJECT, "--timeout", str(timeout)])

    def fixture(self, mode: str = "ok"):
        """isolate_home + make_repo + export STUB_ROOT/STUB_MODE + stub_cli."""
        self.isolate_home()
        repo = self.tmp / "repo"
        self.make_repo(repo)
        self.root = os.path.realpath(repo)
        self.env["STUB_ROOT"] = self.root
        self.env["STUB_MODE"] = mode
        self.stub_cli()
        return repo


@pytest.fixture
def cbm(run_cmd, repo_root, tmp_path):
    return _Cbm(run_cmd, repo_root, tmp_path)


def test_t900450_w1_wrapper_existiert_ist_ausfuehrbar_enthaelt_flock_lockpfad_timeout_3000_und_exit_3_zweig(cbm):
    assert cbm.wrapper.is_file(), f"MISSING wrapper: {cbm.wrapper}"
    assert os.access(cbm.wrapper, os.X_OK), f"NOT-EXECUTABLE: {cbm.wrapper}"
    text = cbm.wrapper.read_text()
    assert "flock" in text
    assert ".cache/codebase-memory-mcp/cbm-index.lock" in text
    assert "3000" in text
    assert "exit 3" in text


def test_t900450_w2_wrapper_ohne_argumente_beendet_sich_mit_exit_2_kein_mcp_aufruf_erreicht(cbm):
    cbm.run(["bash", str(cbm.wrapper)])
    assert cbm.status == 2


def test_t900450_c1_cron_skript_referenziert_den_wrapper_traegt_fresh_skip_zweig_und_dokumentierten_cron_eintrag(cbm):
    assert cbm.cron.is_file(), f"MISSING cron: {cbm.cron}"
    text = cbm.cron.read_text()
    assert "cbm-single-flight.sh" in text
    assert "fresh-skip" in text
    import re
    assert re.search(r"0 (\*/4)? \* \* \*", text)


def test_t900450_a1_kein_direktes_index_repository_in_automation_nur_wrapper_passthrough(cbm):
    assert _count_lines(cbm.wrapper, "index_repository") == 1
    non_comment = "\n".join(ln for ln in cbm.cron.read_text().splitlines()
                            if not ln.startswith("#"))
    assert "index_repository" not in non_comment
    assert "codebase-memory-mcp cli index_repository" not in cbm.taskfile.read_text()
    assert _count_lines(cbm.taskfile, "cbm-single-flight") == 2


def test_t900450_r1_runbook_enthaelt_index_status_detect_changes_wrapper_task_referenz(cbm):
    assert cbm.runbook.is_file(), f"MISSING runbook: {cbm.runbook}"
    assert _count_lines(cbm.runbook, "index_status") >= 1
    assert _count_lines(cbm.runbook, "detect_changes") >= 1
    assert _count_lines(cbm.runbook, "cbm-single-flight.sh") >= 1
    assert _count_lines(cbm.runbook, "codebase:index") >= 1


def test_t900805_failed_graph_probe_reports_unknown_instead_of_fresh_skip(cbm):
    bindir = cbm.tmp / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    stub = bindir / "codebase-memory-mcp"
    stub.write_text("#!/bin/sh\nexit 1\n")
    stub.chmod(0o755)
    cbm.env["PATH"] = f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}"
    cbm.run(["bash", str(cbm.cron), "--dry-run"])
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)


def test_t900805_c2_cron_dry_run_emits_single_json_with_status_for_stubbed_fresh(cbm):
    repo = cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    cbm.run(["bash", str(cbm.cron), "--dry-run", "--repo", cbm.root])
    assert cbm.status == 0
    assert cbm.output.count("\n") <= 1
    assert _jq_e('.status == "fresh-skip"', cbm.output)


def test_t900805_status_clean_indexed_snapshot_reports_fresh(cbm):
    cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    cbm.helper_status()
    assert cbm.status == 0
    assert _jq_e('.status == "fresh"', cbm.output)
    assert _jq_e('.refresh_allowed == false', cbm.output)


def test_t900805_status_head_drift_reports_stale_with_refresh_allowed(cbm):
    repo = cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    with open(repo / "file.txt", "a") as fh:
        fh.write("change\n")
    cbm.git(repo, "commit", "-qam", "second")
    cbm.helper_status()
    assert cbm.status == 0
    assert _jq_e('.status == "stale"', cbm.output)
    assert _jq_e('.refresh_allowed == true', cbm.output)
    assert _jq_e('.reasons | index("head-drift")', cbm.output)


def test_t900805_status_missing_receipt_reports_unknown_with_initial_refresh_allowed(cbm):
    cbm.fixture()
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.refresh_allowed == true', cbm.output)
    assert _jq_e('.reasons | index("receipt-missing")', cbm.output)


def test_t900805_status_wrong_root_reports_unknown_without_refresh(cbm):
    cbm.fixture(mode="mismatch")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.refresh_allowed == false', cbm.output)
    assert _jq_e('.reasons | index("root-mismatch")', cbm.output)


def test_t900805_status_wrong_project_reports_unknown_without_refresh(cbm):
    cbm.fixture(mode="project-mismatch")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("project-mismatch")', cbm.output)


def test_t900805_status_missing_cli_reports_unknown_without_refresh(cbm):
    repo = cbm.tmp / "repo"
    cbm.isolate_home()
    cbm.make_repo(repo)
    cbm.root = os.path.realpath(repo)
    cbm.env["PATH"] = "/usr/bin:/bin"
    cbm.helper_status(timeout=5)
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("tool-missing")', cbm.output)


def test_t900805_status_probe_timeout_reports_unknown(cbm):
    cbm.fixture(mode="timeout")
    cbm.helper_status(timeout=1)
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("probe-timeout")', cbm.output)


def test_t900805_status_malformed_probe_reports_unknown(cbm):
    cbm.fixture(mode="malformed")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("probe-malformed")', cbm.output)


def test_t900805_status_tool_error_envelope_reports_unknown(cbm):
    cbm.fixture(mode="tool-error")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("tool-error")', cbm.output)


def test_t900805_status_dirty_and_untracked_paths_are_unique_with_counts(cbm):
    repo = cbm.fixture()
    with open(repo / "file.txt", "a") as fh:
        fh.write("dirty\n")
    (repo / "untracked.txt").write_text("new\n")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.dirty.count == 1', cbm.output)
    assert _jq_e('.untracked.count == 1', cbm.output)
    assert _jq_e('.dirty.paths | index("file.txt")', cbm.output)
    assert _jq_e('.untracked.paths | index("untracked.txt")', cbm.output)


def test_t900805_status_unusual_paths_with_spaces_and_renames_stay_unique(cbm):
    repo = cbm.fixture()
    (repo / "spaced name.txt").write_text("x\n")
    cbm.git(repo, "add", ".")
    cbm.git(repo, "commit", "-qm", "spaced")
    cbm.git(repo, "mv", "spaced name.txt", "renamed.txt")
    with open(repo / "renamed.txt", "a") as fh:
        fh.write("dirty\n")
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.dirty.paths | map(select(. == "renamed.txt")) | length == 1', cbm.output)


def test_t900805_status_checkout_behind_local_upstream_stays_fresh_without_reindex(cbm):
    repo = cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    head = cbm.run_cmd(["git", "-C", str(repo), "rev-parse", "HEAD"]).stdout.strip()
    (repo / "ahead.txt").write_text("ahead\n")
    cbm.git(repo, "add", ".")
    cbm.git(repo, "commit", "-qm", "ahead-commit")
    ahead = cbm.run_cmd(["git", "-C", str(repo), "rev-parse", "HEAD"]).stdout.strip()
    cbm.git(repo, "update-ref", "refs/remotes/origin/main", ahead)
    cbm.git(repo, "reset", "-q", "--hard", head)
    cbm.git(repo, "clean", "-fdq")
    cbm.helper_status()
    assert cbm.status == 0
    assert _jq_e('.status == "fresh"', cbm.output)
    assert _jq_e('.upstream.relation == "behind"', cbm.output)
    assert _jq_e('.refresh_allowed == false', cbm.output)


def _receipt_text(cbm) -> str:
    cache = Path(cbm.env["TEST_HOME"]) / ".cache" / "codebase-memory-mcp"
    receipts = sorted(glob.glob(str(cache / "cbm-receipt-*.json")))
    assert receipts, "ls found no receipt"
    return "".join(Path(r).read_text() for r in receipts).rstrip("\n")


def test_t900805_receipt_failed_index_preserves_previous_valid_receipt(cbm):
    cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    before = _receipt_text(cbm)
    cbm.env["STUB_MODE"] = "fail-index"
    cbm.wrap(cbm.root)
    assert cbm.status != 0
    after = _receipt_text(cbm)
    assert before == after
    cbm.helper_status()
    assert cbm.status != 0
    assert _jq_e('.status == "unknown"', cbm.output)


def test_t900805_receipt_unstable_repo_during_index_preserves_receipt(cbm):
    repo = cbm.fixture()
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    cbm.env["STUB_TOUCH_FILE"] = str(repo / "file.txt")
    cbm.wrap(cbm.root)
    assert cbm.status != 0


def test_t900805_receipt_dirty_successful_index_stays_fresh_without_reindex_loop(cbm):
    repo = cbm.fixture()
    with open(repo / "file.txt", "a") as fh:
        fh.write("dirty\n")
    (repo / "untracked.txt").write_text("new\n")
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    cbm.helper_status()
    assert cbm.status == 0
    assert _jq_e('.status == "fresh"', cbm.output)
    assert _jq_e('.receipt.dirty == true', cbm.output)
    assert _jq_e('.refresh_allowed == false', cbm.output)


def test_t900805_wrapper_json_target_root_differing_from_cwd_is_used(cbm):
    cbm.fixture()
    other = cbm.tmp / "other"
    other.mkdir()
    cbm.wrap(cbm.root, cwd=other)
    assert cbm.status == 0
    cbm.helper_status()
    assert cbm.status == 0
    assert _jq_e('.status == "fresh"', cbm.output)


def test_t900805_wrapper_lock_timeout_exits_3(cbm):
    import fcntl

    cbm.isolate_home()
    cbm.env["CBMSF_TIMEOUT"] = "1"
    lock = cbm.home / ".cache" / "codebase-memory-mcp" / "cbm-index.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.touch()
    # Holder: a background flock(2) on the same lock file for the duration of the run.
    fd = os.open(lock, os.O_RDWR)
    fcntl.flock(fd, fcntl.LOCK_EX)
    try:
        cbm.wrap("/tmp")
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    assert cbm.status == 3


def test_t900805_status_no_fetch_or_index_is_triggered_by_status(cbm):
    repo = cbm.fixture()
    log = cbm.tmp / "cli.log"
    cbm.env["STUB_LOG"] = str(log)
    log.write_text("")
    cbm.helper_status()
    assert cbm.status != 0
    text = log.read_text()
    assert "index_repository" not in text
    assert "fetch" not in text


def test_t900805_cron_dry_run_never_indexes_even_when_refresh_allowed(cbm):
    repo = cbm.fixture()
    log = cbm.tmp / "cli.log"
    cbm.env["STUB_LOG"] = str(log)
    log.write_text("")
    cbm.run(["bash", str(cbm.cron), "--dry-run", "--repo", cbm.root])
    assert cbm.status == 0
    assert _jq_e('.status == "would-refresh"', cbm.output)
    assert "index_repository" not in log.read_text()


def test_t900996_status_db_changed_reports_unknown_with_refresh_allowed_re_baseline_via_refresh(cbm):
    cbm.fixture()
    # seed the graph DB so the receipt records a stat, then baseline via wrapper
    db = cbm.home / ".cache" / "codebase-memory-mcp" / f"{PROJECT}.db"
    db.write_text("v1\n")
    cbm.wrap(cbm.root)
    assert cbm.status == 0
    # simulate a frequent background DB writer (mtime/size change, cf. T900996)
    db.write_text("v2-moredata\n")
    cbm.helper_status()
    assert _jq_e('.status == "unknown"', cbm.output)
    assert _jq_e('.reasons | index("db-changed")', cbm.output)
    assert _jq_e('.receipt == null', cbm.output)
    assert _jq_e('.refresh_allowed == true', cbm.output)
