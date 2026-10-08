"""Native migration of tests/spec/cbm-reconcile.bats."""

import json
import os
import stat
from pathlib import Path

PROJECT = "home-patrick-Bachelorprojekt"

# Byte-for-byte the stub the BATS setup generated, with __PROJECT__ and
# __REPO__ replaced at creation time (the BATS heredoc expanded them the same way).
STUB_TEMPLATE = r'''#!/bin/sh
# Emulates the real CLI: "cli --json <sub>" wraps the payload in an MCP
# envelope; bare "cli <sub>" returns the raw payload (cbm-reconcile.py still
# probes index_status without --json, cbm-freshness.py uses --json).
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a' -e 'N' -e '$!ba' -e 's/\n/\\n/g'
}
emit_envelope() {
  printf '{"content":[{"type":"text","text":"%s"}],"isError":false}\n' "$(json_escape "$1")"
}
case "$1" in
  --version) echo "stub-cbm 0.0.0-test"; exit 0;;
  cli) shift
    use_json=""
    [ "${1:-}" = "--json" ] && { use_json=1; shift; }
    sub="$1"; shift
    case "$sub" in
      index_status)
        if [ "${STUB_MODE:-}" = "malformed-index" ]; then echo "not-json"; exit 0; fi
        inner="{\"project\":\"__PROJECT__\",\"root_path\":\"__REPO__\",\"git\":{\"canonical_root\":\"__REPO__\"},\"status\":\"ready\",\"nodes\":10,\"edges\":20}"
        if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
        exit 0;;
      get_graph_schema)
        echo '{"content":[{"type":"text","text":"{\"node_labels\":[{\"label\":\"Function\",\"count\":2,\"properties\":[\"name\",\"file_path\"]}]}"}]}'; exit 0;;
      query_graph)
        if [ -n "${STUB_QUERY_GARBAGE:-}" ]; then printf '{"content":[{"type":"text","text":"total garbage <|>"}]}'; exit 0; fi
        { echo "rows: 0  (cols: file)"
          if [ -n "${STUB_K3_FILESLIST:-}" ]; then
            while IFS= read -r f; do [ -n "$f" ] && echo "  $f"; done < "$STUB_K3_FILESLIST"
          else
            for f in ${STUB_K3_FILES:-}; do echo "  $f"; done
          fi
          echo "total: 0"; } | python3 -c 'import json,sys; print(json.dumps({"content":[{"type":"text","text":sys.stdin.read()}]}))'
        exit 0;;
      detect_changes)
        if [ -n "$use_json" ]; then
          emit_envelope "base: main
direction: inbound
changed_files: 0"
        else
          echo '{"changed_count":0,"changed_files":[]}'
        fi
        exit 0;;
      *) echo "unknown sub $sub" >&2; exit 1;;
    esac;;
  *) echo "unknown $1" >&2; exit 1;;
esac
'''

RECEIPT_WRITER = (
    "import importlib.util, sys, os\n"
    "spec = importlib.util.spec_from_file_location('cbm_freshness', sys.argv[1])\n"
    "mod = importlib.util.module_from_spec(spec)\n"
    "spec.loader.exec_module(mod)\n"
    "repo, project = sys.argv[2], sys.argv[3]\n"
    "root = mod.git_toplevel(repo)\n"
    "head = mod.git_head(root)\n"
    "diff, _ = mod.git_diff_binary(root)\n"
    "untracked, _ = mod.git_untracked_files(root)\n"
    "fp = mod.fingerprint_state(root, head, diff, untracked)\n"
    "receipt = {'schema_version': 1, 'timestamp': mod.utc_now_iso(), 'head_sha': head,\n"
    "           'canonical_root': root, 'project': project, 'mode': 'full',\n"
    "           'tool_version': 'stub-cbm 0.0.0-test', 'state_fingerprint': fp,\n"
    "           'dirty': False}\n"
    "mod.atomic_write_json(mod.receipt_path(project, root), receipt)\n"
    "print('receipt-written')\n"
)


def _git(run_cmd, repo: Path, *args):
    return run_cmd(["git", "-C", str(repo), *args]).check()


def _isolate_home(tmp_path: Path, env: dict) -> dict:
    home = tmp_path / "home"
    (home / ".cache" / "codebase-memory-mcp").mkdir(parents=True, exist_ok=True)
    env["TEST_HOME"] = str(home)
    env["HOME"] = str(home)
    return env


def _make_repo(run_cmd, repo: Path):
    (repo / "lib").mkdir(parents=True, exist_ok=True)
    run_cmd(["git", "init", "-q", str(repo)]).check()
    _git(run_cmd, repo, "config", "user.email", "test@example.com")
    _git(run_cmd, repo, "config", "user.name", "Test")
    _git(run_cmd, repo, "config", "commit.gpgsign", "false")
    (repo / "lib" / "a.ts").write_text("export const a = 1;\n")
    (repo / "lib" / "b.ts").write_text("export const b = 2;\n")
    (repo / "README.md").write_text("docs\n")
    _git(run_cmd, repo, "add", ".")
    _git(run_cmd, repo, "commit", "-qm", "init")


def _stub_cli(tmp_path: Path, repo: Path, env: dict):
    bindir = tmp_path / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    script = bindir / "codebase-memory-mcp"
    script.write_text(STUB_TEMPLATE.replace("__PROJECT__", PROJECT)
                      .replace("__REPO__", str(repo)))
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env["PATH"] = f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}"


def _make_fresh_receipt(run_cmd, repo_root: Path, env: dict, repo: Path):
    freshness = str(repo_root / "scripts/mcp/cbm-freshness.py")
    result = run_cmd(["python3", "-c", RECEIPT_WRITER, freshness, str(repo), PROJECT],
                     env=env)
    result.check()
    assert result.stdout.strip() == "receipt-written"


def _reconcile(run_cmd, repo_root: Path, env: dict, repo: Path):
    return run_cmd(["python3", str(repo_root / "scripts/mcp/cbm-reconcile.py"),
                    "status", "--repo", str(repo), "--project", PROJECT], env=env)


def _fixture(run_cmd, repo_root, tmp_path):
    """isolate_home + make_repo + stub_cli + make_fresh_receipt; returns (env, repo)."""
    env = _isolate_home(tmp_path, {})
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    _stub_cli(tmp_path, repo, env)
    _make_fresh_receipt(run_cmd, repo_root, env, repo)
    return env, repo


def test_single_json_object_with_schema_and_verdict_fields_on_stdout(
        run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    assert isinstance(d, dict), "not a single JSON object"
    for key in ("schema_version", "verdict", "verdict_reasons", "k3_freshness",
                "k1_evidence", "coverage", "repo", "project"):
        assert key in d, f"missing {key}"


def test_fresh_index_full_coverage_verdict_fresh(run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    env["STUB_K3_FILES"] = "lib/a.ts lib/b.ts README.md"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    assert d["verdict"] == "fresh", d["verdict"]


def test_tracked_code_file_missing_from_graph_diverged_with_code_unindexed(
        run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    env["STUB_K3_FILES"] = "lib/a.ts"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    assert d["verdict"] == "diverged", d["verdict"]
    cu = d["coverage"]["code_unindexed"]
    assert "lib/b.ts" in cu["paths"], cu
    assert cu["count"] >= 1


def test_graph_file_not_in_git_diverged_with_k3_untracked(run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    env["STUB_K3_FILES"] = "lib/a.ts lib/b.ts README.md deleted/ghost.ts"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    assert d["verdict"] == "diverged", d["verdict"]
    ku = d["coverage"]["k3_untracked"]
    assert "deleted/ghost.ts" in ku["paths"], ku


def test_k3_freshness_unknown_verdict_unknown_exit_1_fail_closed(
        run_cmd, repo_root, tmp_path):
    env = _isolate_home(tmp_path, {})
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    _stub_cli(tmp_path, repo, env)
    # freshness helper gets malformed index_status
    env["STUB_MODE"] = "malformed-index"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 1
    d = json.loads(result.output)
    assert d["verdict"] == "unknown", d["verdict"]
    assert d["k3_freshness"]["status"] == "unknown"


def test_k1_evidence_is_unavailable_with_reasons_and_surfaces_fail_closed_no_guessing(
        run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    env["STUB_K3_FILES"] = "lib/a.ts lib/b.ts README.md"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    k1 = d["k1_evidence"]
    assert k1["status"] == "unavailable", k1
    assert len(k1["reasons"]) >= 1
    assert "surfaces" in k1


def test_paths_with_spaces_survive_via_nul_delimited_git_listing(
        run_cmd, repo_root, tmp_path):
    env, repo = _fixture_plain(run_cmd, repo_root, tmp_path)
    (repo / "lib" / "weird name.ts").write_text("x\n")
    _git(run_cmd, repo, "add", ".")
    _git(run_cmd, repo, "commit", "-qm", "weird")
    _stub_cli(tmp_path, repo, env)
    _make_fresh_receipt(run_cmd, repo_root, env, repo)
    listing = tmp_path / "k3files.txt"
    listing.write_text("\n".join(["lib/a.ts", "lib/b.ts", "lib/weird name.ts",
                                 "README.md"]) + "\n")
    env["STUB_K3_FILESLIST"] = str(listing)
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 0
    d = json.loads(result.output)
    cu = d["coverage"]["code_unindexed"]["paths"]
    assert "lib/weird name.ts" not in cu, cu


def test_query_graph_garbage_output_fail_closed_unknown_not_silent_fresh(
        run_cmd, repo_root, tmp_path):
    env, repo = _fixture(run_cmd, repo_root, tmp_path)
    env["STUB_K3_FILES"] = "lib/a.ts lib/b.ts README.md"
    env["STUB_QUERY_GARBAGE"] = "1"
    result = _reconcile(run_cmd, repo_root, env, repo)
    assert result.returncode == 1
    d = json.loads(result.output)
    assert d["verdict"] == "unknown", d["verdict"]


def _fixture_plain(run_cmd, repo_root, tmp_path):
    """Same as _fixture but without the stub/receipt (caller adds them after commits)."""
    env = _isolate_home(tmp_path, {})
    repo = tmp_path / "repo"
    _make_repo(run_cmd, repo)
    return env, repo
