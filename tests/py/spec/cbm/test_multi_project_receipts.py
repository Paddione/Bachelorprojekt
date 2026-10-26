"""Multi-project receipts: refresh files attempt+receipt under the requested
project (not DEFAULT_PROJECT), and subdir project roots are accepted."""

import json
import os
import stat
from pathlib import Path

PROJECT = "home-patrick-testproj"
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"

STUB_CLI = r'''#!/bin/sh
case "$1" in
  --version)
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    if [ "$1" = "--json" ]; then shift; JSON_MODE=1; else JSON_MODE=0; fi
    sub="$1"; shift
    emit_envelope() {
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


def _make_repo(run_cmd, repo: Path):
    repo.mkdir(parents=True, exist_ok=True)
    run_cmd(["git", "init", "-q", str(repo)]).check()
    _git(run_cmd, repo, "config", "user.email", "test@example.com")
    _git(run_cmd, repo, "config", "user.name", "Test")
    _git(run_cmd, repo, "config", "commit.gpgsign", "false")
    (repo / "file.txt").write_text("hello\n")
    _git(run_cmd, repo, "add", ".")
    _git(run_cmd, repo, "commit", "-qm", "init")


def _base_env(tmp_path: Path) -> dict:
    home = tmp_path / "home"
    (home / ".cache" / "codebase-memory-mcp").mkdir(parents=True, exist_ok=True)
    bindir = tmp_path / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    script = bindir / "codebase-memory-mcp"
    script.write_text(STUB_CLI)
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return {"HOME": str(home), "PATH": f"{bindir}:/usr/bin:/bin"}


def _receipts(home: Path, project: str):
    cache = home / ".cache" / "codebase-memory-mcp"
    return sorted(cache.glob(f"cbm-receipt-{project}-*.json"))


def test_refresh_files_receipt_under_requested_project(run_cmd, repo_root, tmp_path):
    """The single-flight wrapper must key attempt+receipt by the cron's
    --project, never by DEFAULT_PROJECT (previously all non-default projects
    produced receipts filed under home-patrick-Bachelorprojekt, which the
    freshness validator then rejected with receipt-identity-mismatch)."""
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    env = _base_env(tmp_path)
    env.update({**os.environ, **env})
    env["STUB_ROOT"] = os.path.realpath(repo)
    stub = tmp_path / "sync-stub.py"
    stub.write_text(SYNC_STUB)
    env["CBM_EMBED_SYNC"] = str(stub)
    env["SYNC_LOG"] = str(tmp_path / "sync.log")
    if "CBM_PROJECT" in env and env["CBM_PROJECT"] == PROJECT:
        pass
    env.pop("CBM_PROJECT", None)

    cron = repo_root / "scripts" / "cbm-refresh-cron.sh"
    result = run_cmd(
        ["bash", str(cron), "--repo", os.path.realpath(repo),
         "--project", PROJECT, "--timeout", "30"],
        env=env, timeout=120,
    )
    home = Path(env["HOME"])
    ours = _receipts(home, PROJECT)
    assert ours, f"no receipt filed under {PROJECT}: {result.stdout[-500:]}"
    data = json.loads(ours[0].read_text())
    assert data["project"] == PROJECT
    assert data["canonical_root"] == os.path.realpath(repo)
    leaked = _receipts(home, DEFAULT_PROJECT)
    assert leaked == [], f"receipt leaked under default project: {leaked}"


def test_status_accepts_subdir_project_root(run_cmd, repo_root, tmp_path):
    """A project rooted at a subdirectory of a git checkout (e.g.
    home-patrick-dotfiles) must not fail closed with root-mismatch when the
    caller points --repo at the attested project root."""
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    sub = repo / "sub"
    sub.mkdir()
    env = _base_env(tmp_path)
    env.update({**os.environ, **env})
    env["STUB_ROOT"] = os.path.realpath(sub)
    helper = repo_root / "scripts" / "mcp" / "cbm-freshness.py"

    result = run_cmd(
        ["python3", str(helper), "status", "--repo", os.path.realpath(sub),
         "--project", "home-patrick-sub", "--timeout", "30"],
        env=env, timeout=60,
    )
    data = json.loads(result.stdout)
    assert "root-mismatch" not in data["reasons"], data["reasons"]

    # Negative control: pointing --repo at the enclosing checkout while the
    # graph attests the subdir must still fail closed.
    result2 = run_cmd(
        ["python3", str(helper), "status", "--repo", os.path.realpath(repo),
         "--project", "home-patrick-sub", "--timeout", "30"],
        env=env, timeout=60,
    )
    data2 = json.loads(result2.stdout)
    assert "root-mismatch" in data2["reasons"], data2["reasons"]


def test_finish_survives_artifact_churn(run_cmd, repo_root, tmp_path):
    """begin → rewrite `.codebase-memory/artifact.json` (what a persisting
    index run does) → finish must still record success + receipt."""
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    env = _base_env(tmp_path)
    env.update({**os.environ, **env})
    helper = repo_root / "scripts" / "mcp" / "cbm-freshness.py"
    payload = json.dumps({"repo_path": os.path.realpath(repo), "mode": "fast"})

    begin = run_cmd(
        ["python3", str(helper), "begin", "--args-json", payload,
         "--project", PROJECT],
        env=env, timeout=60,
    )
    begin.check()
    attempt_id = json.loads(begin.stdout)["attempt_id"]

    artifacts = repo / ".codebase-memory"
    artifacts.mkdir()
    (artifacts / "artifact.json").write_text('{"v": 1}\n')

    out = tmp_path / "out.json"
    out.write_text('{"ok": true}')
    err = tmp_path / "err.txt"
    err.write_text("")
    finish = run_cmd(
        ["python3", str(helper), "finish", "--args-json", payload,
         "--attempt-id", attempt_id, "--exit-code", "0",
         "--stdout-file", str(out), "--stderr-file", str(err),
         "--project", PROJECT],
        env=env, timeout=60,
    )
    assert finish.returncode == 0, finish.stderr
    home = Path(env["HOME"])
    ours = _receipts(home, PROJECT)
    assert ours, "no receipt recorded despite only artifact churn"
    assert json.loads(ours[0].read_text())["project"] == PROJECT


def _load_sync(repo_root):
    import importlib.util

    path = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    spec = importlib.util.spec_from_file_location("cbm_embed_sync", str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_fingerprint_ignores_tool_artifact_paths(run_cmd, repo_root):
    """Untracked files under `.codebase-memory/` (the indexer's own
    persistence output) must not move the stability fingerprint — otherwise
    every persisting refresh trips its own unstable-repo guard."""
    code = (
        "import importlib.util, sys; "
        "spec = importlib.util.spec_from_file_location("
        "'st', sys.argv[1]); st = importlib.util.module_from_spec(spec); "
        "spec.loader.exec_module(st); "
        "base = st.fingerprint_state('/r', 'h', b'diff', ['a.txt']); "
        "same = st.fingerprint_state('/r', 'h', b'diff', "
        "['a.txt', '.codebase-memory/artifact.json', 'sub/.codebase-memory/x']); "
        "moved = st.fingerprint_state('/r', 'h', b'diff', ['a.txt', 'b.txt']); "
        "print('SAME' if base == same else 'DIFFER'); "
        "print('MOVED' if base != moved else 'STUCK')"
    )
    result = run_cmd(
        ["python3", "-c", code,
         str(repo_root / "scripts" / "mcp" / "cbm-freshness-state.py")],
        timeout=60,
    )
    lines = result.stdout.strip().split("\n")
    assert lines == ["SAME", "MOVED"], result.stdout


def test_resolve_keeps_explicit_subdir_repo(run_cmd, repo_root, tmp_path):
    """resolve() must keep an explicit --repo pointing at a project
    subdirectory (subdir projects) instead of collapsing to the enclosing
    checkout; default (cwd) behavior is unchanged."""
    import argparse

    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    sub = repo / "sub"
    sub.mkdir()
    mod = _load_sync(repo_root)

    root, _head = mod.resolve(argparse.Namespace(repo=os.path.realpath(sub)))
    assert root == os.path.realpath(sub), root

    root2, _head2 = mod.resolve(argparse.Namespace(repo=os.path.realpath(repo)))
    assert root2 == os.path.realpath(repo), root2
