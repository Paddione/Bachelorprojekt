"""Native migration of tests/spec/cbm-refresh-cron-A4.bats."""

import json
import os
import stat
from pathlib import Path

PROJECT = "home-patrick-Bachelorprojekt"

STUB_CLI = r'''#!/bin/sh
case "$1" in
  --version)
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    # Real CLI: `cli --json <sub>` -> MCP envelope on stdout; bare `cli <sub>`
    # -> raw payload (A1 fix uses --json everywhere).
    if [ "$1" = "--json" ]; then shift; JSON_MODE=1; else JSON_MODE=0; fi
    sub="$1"; shift
    emit_envelope() {
      # $1 = inner text (already JSON-escaped via python to be safe)
      python3 -c 'import json,sys; print(json.dumps({"content":[{"type":"text","text":sys.argv[1]}],"isError":False}))' "$1"
    }
    case "$sub" in
      index_status)
        proj=""
        while [ "$#" -gt 0 ]; do case "$1" in --project) proj="$2"; shift 2;; *) shift;; esac; done
        root="${STUB_ROOT:-/tmp/repo}"
        inner="{\"project\":\"$proj\",\"root_path\":\"$root\",\"git\":{\"canonical_root\":\"$root\",\"worktree_root\":\"$root\"},\"status\":\"ready\",\"nodes\":1,\"edges\":1}"
        if [ "$JSON_MODE" = "1" ]; then emit_envelope "$inner"; else printf '%s\n' "$inner"; fi
        exit 0
        ;;
      detect_changes)
        inner='{"changed_count":0,"changed_files":[]}'
        if [ "$JSON_MODE" = "1" ]; then emit_envelope "$inner"; else printf '%s\n' "$inner"; fi
        exit 0
        ;;
      index_repository)
        inner='{"ok":true}'
        if [ "$JSON_MODE" = "1" ]; then emit_envelope "$inner"; else printf '%s\n' "$inner"; fi
        exit 0
        ;;
      *) echo "unknown subcommand" >&2; exit 2;;
    esac
    ;;
  *) echo "unknown" >&2; exit 2;;
esac
'''

SYNC_STUB = r'''import os, sys
log = os.environ.get("SYNC_LOG", "")
if log:
    with open(log, "a") as f:
        f.write(" ".join(sys.argv[1:]) + "\n")
sys.exit(int(os.environ.get("SYNC_EXIT_CODE", "0")))
'''


def _git(run_cmd, repo: Path, *args):
    run_cmd(["git", "-C", str(repo), *args]).check()


def _isolate_home(tmp_path: Path) -> dict:
    home = tmp_path / "home"
    (home / ".cache" / "codebase-memory-mcp").mkdir(parents=True, exist_ok=True)
    return {"HOME": str(home)}


def _make_repo(run_cmd, repo: Path):
    repo.mkdir(parents=True, exist_ok=True)
    run_cmd(["git", "init", "-q", str(repo)]).check()
    _git(run_cmd, repo, "config", "user.email", "test@example.com")
    _git(run_cmd, repo, "config", "user.name", "Test")
    _git(run_cmd, repo, "config", "commit.gpgsign", "false")
    (repo / "file.txt").write_text("hello\n")
    _git(run_cmd, repo, "add", ".")
    _git(run_cmd, repo, "commit", "-qm", "init")


def _stub_cli(tmp_path: Path) -> dict:
    """Writes the codebase-memory-mcp stub; PATH is replaced, not prepended (as in BATS)."""
    bindir = tmp_path / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    script = bindir / "codebase-memory-mcp"
    script.write_text(STUB_CLI)
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return {"PATH": f"{bindir}:/usr/bin:/bin"}


def _make_sync_stub(tmp_path: Path) -> dict:
    stub = tmp_path / "sync-stub.py"
    stub.write_text(SYNC_STUB)
    log = tmp_path / "sync.log"
    log.write_text("")
    return {"CBM_EMBED_SYNC": str(stub), "SYNC_LOG": str(log)}


def _make_stale_repo(run_cmd, repo_root: Path, tmp_path: Path, env: dict) -> tuple:
    """Fresh receipt first, then HEAD drift -> helper reports stale, refresh allowed."""
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    stale_root = os.path.realpath(repo)
    env.update(STUB_ROOT=stale_root)
    env.update(_stub_cli(tmp_path))
    wrapper = repo_root / "scripts/mcp/cbm-single-flight.sh"
    run_cmd(["bash", str(wrapper),
             json.dumps({"repo_path": stale_root, "mode": "fast", "persistence": True})],
            env=env).check()
    (repo / "file.txt").write_text("hello\ndrift\n")
    _git(run_cmd, repo, "commit", "-qam", "drift")
    return stale_root


def _last_line(text: str) -> str:
    lines = text.rstrip("\n").split("\n")
    return lines[-1] if lines else ""


def test_t900993_a4_dry_run_would_refresh_never_invokes_embed_sync(
        run_cmd, repo_root, tmp_path):
    env = _isolate_home(tmp_path)
    root = _make_stale_repo(run_cmd, repo_root, tmp_path, env)
    env.update(_make_sync_stub(tmp_path))
    env["SYNC_EXIT_CODE"] = "0"
    result = run_cmd(["bash", str(repo_root / "scripts/cbm-refresh-cron.sh"),
                      "--dry-run", "--repo", root], env=env)
    assert result.returncode == 0
    assert json.loads(result.output)["status"] == "would-refresh"
    assert not Path(env["SYNC_LOG"]).stat().st_size


def test_t900993_a4_successful_refresh_invokes_embed_sync_with_repo_context(
        run_cmd, repo_root, tmp_path):
    env = _isolate_home(tmp_path)
    root = _make_stale_repo(run_cmd, repo_root, tmp_path, env)
    env.update(_make_sync_stub(tmp_path))
    env["SYNC_EXIT_CODE"] = "0"
    result = run_cmd(["bash", str(repo_root / "scripts/cbm-refresh-cron.sh"),
                      "--repo", root], env=env)
    assert result.returncode == 0
    assert json.loads(_last_line(result.stdout))["status"] == "refreshed"
    log = Path(env["SYNC_LOG"]).read_text()
    assert log, "sync log empty"
    assert any(line.startswith("sync ") for line in log.splitlines())
    assert f"--repo {root}" in log
    assert f"--project {PROJECT}" in log


def test_t900993_a4_sync_failure_is_non_fatal_refresh_stays_valid(
        run_cmd, repo_root, tmp_path):
    env = _isolate_home(tmp_path)
    root = _make_stale_repo(run_cmd, repo_root, tmp_path, env)
    env.update(_make_sync_stub(tmp_path))
    env["SYNC_EXIT_CODE"] = "1"
    result = run_cmd(["bash", str(repo_root / "scripts/cbm-refresh-cron.sh"),
                      "--repo", root], env=env)
    assert result.returncode == 0
    assert json.loads(_last_line(result.stdout))["status"] == "refreshed"
    assert Path(env["SYNC_LOG"]).read_text()
