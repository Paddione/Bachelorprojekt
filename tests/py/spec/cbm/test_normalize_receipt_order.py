"""Normalize-before-receipt: the single-flight wrapper must run kind
normalization BEFORE the finish receipt, never after.

Regression: normalization ran after ``finish`` froze the DB stat
(ino/mtime_ns) into the receipt. Its UPDATEs then changed the DB file, so the
freshness validator reported ``db-changed`` with ``receipt: null`` and the
fail-closed embed-sync refused every sync (K3 repo-graph-label-cleanup).
"""

import json
import os
import stat
from pathlib import Path

PROJECT = "home-patrick-testproj"

STUB_CLI = r'''#!/bin/sh
case "$1" in
  --version)
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    if [ "$1" = "--json" ]; then shift; fi
    sub="$1"; shift
    emit_envelope() {
      python3 -c 'import json,sys; print(json.dumps({"content":[{"type":"text","text":sys.argv[1]}],"isError":False}))' "$1"
    }
    case "$sub" in
      index_status)
        proj=""
        while [ "$#" -gt 0 ]; do case "$1" in --project) proj="$2"; shift 2;; *) shift;; esac; done
        root="${STUB_ROOT:-/tmp/repo}"
        inner="{\"project\":\"$proj\",\"root_path\":\"$root\",\"git\":{\"canonical_root\":\"$root\",\"worktree_root\":\"$root\"},\"status\":\"ready\",\"nodes\":1,\"edges\":0}"
        emit_envelope "$inner"
        exit 0
        ;;
      detect_changes)
        inner='{"changed_count":0,"changed_files":[]}'
        emit_envelope "$inner"
        exit 0
        ;;
      index_repository)
        python3 - "$HOME" PROJECT_PLACEHOLDER <<'EOF'
import os
import sqlite3
import sys
home, project = sys.argv[1], sys.argv[2]
db = os.path.join(home, ".cache", "codebase-memory-mcp", project + ".db")
os.makedirs(os.path.dirname(db), exist_ok=True)
conn = sqlite3.connect(db)
conn.execute("CREATE TABLE IF NOT EXISTS nodes (id INTEGER PRIMARY KEY, project TEXT, label TEXT, name TEXT, qualified_name TEXT, file_path TEXT, start_line INTEGER, end_line INTEGER, properties TEXT)")
conn.execute("DELETE FROM nodes")
conn.execute(
    "INSERT INTO nodes (project, label, name, qualified_name, file_path, start_line, end_line, properties)"
    " VALUES (?, 'EnvVar', 'MY_VAR', ?, 'a.py', 1, 1, '{}')",
    (project, project + ".MY_VAR"),
)
conn.commit()
conn.close()
EOF
        inner='{"ok":true}'
        emit_envelope "$inner"
        exit 0
        ;;
      *) echo "unknown subcommand" >&2; exit 2;;
    esac
    ;;
  *) echo "unknown" >&2; exit 2;;
esac
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


def test_normalize_runs_before_finish_receipt(run_cmd, repo_root, tmp_path):
    """Receipt DB stat must equal the post-normalization DB (EnvVar mapped)."""
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    home = tmp_path / "home"
    (home / ".cache" / "codebase-memory-mcp").mkdir(parents=True, exist_ok=True)
    bindir = tmp_path / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    script = bindir / "codebase-memory-mcp"
    script.write_text(STUB_CLI.replace("PROJECT_PLACEHOLDER", PROJECT))
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env = {**os.environ, "HOME": str(home), "PATH": f"{bindir}:/usr/bin:/bin",
           "STUB_ROOT": os.path.realpath(repo), "CBM_PROJECT": PROJECT}
    env.pop("CBM_EMBED_SYNC", None)

    wrapper = repo_root / "scripts" / "mcp" / "cbm-single-flight.sh"
    payload = json.dumps({"repo_path": os.path.realpath(repo), "mode": "full",
                          "persistence": True})
    result = run_cmd(["bash", str(wrapper), payload], env=env, timeout=180)
    assert result.returncode == 0, f"wrapper failed:\n{result.output}"

    db = home / ".cache" / "codebase-memory-mcp" / f"{PROJECT}.db"
    assert db.exists(), "stub index did not create the project DB"

    import sqlite3
    conn = sqlite3.connect(str(db))
    try:
        labels = [r[0] for r in conn.execute("SELECT DISTINCT label FROM nodes")]
    finally:
        conn.close()
    assert "EnvVar" not in labels, f"normalization did not run: {labels}"
    assert "Variable" in labels, f"EnvVar not mapped to Variable: {labels}"

    receipts = sorted((home / ".cache" / "codebase-memory-mcp").glob(
        f"cbm-receipt-{PROJECT}-*.json"))
    assert receipts, "no receipt filed under the requested project"
    data = json.loads(receipts[-1].read_text())
    actual_mtime = os.stat(db).st_mtime_ns
    assert data["db"]["mtime_ns"] == actual_mtime, (
        "receipt froze a pre-normalization DB stat: "
        f"receipt={data['db']['mtime_ns']} actual={actual_mtime}")
