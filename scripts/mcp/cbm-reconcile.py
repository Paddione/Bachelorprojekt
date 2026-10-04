#!/usr/bin/env python3
"""cbm-reconcile.py — K1/K3 reconciliation report (defect D8, T002430).

Emits ONE JSON object describing per-file coverage of git-tracked files vs
K3 code-graph symbols, the K3 freshness verdict (from cbm-freshness.py
receipts) and the K1 embedding-evidence state. Fail-closed: any probe
failure yields verdict "unknown", never "fresh".

Stdlib only. No network. K1 has no local evidence surface in this checkout
(pgvector is an external service; the indexer trigger is a machine-local git
hook, unversioned) — the report says so instead of guessing.

Usage:
    python3 scripts/mcp/cbm-reconcile.py status --repo PATH \
        [--project NAME] [--timeout SECONDS] [--max-list N]

Exit 0 when the verdict is fresh or diverged (evidence valid), 1 when unknown.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SCHEMA_VERSION = "k3-reconcile/1"
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"
DEFAULT_TIMEOUT_S = 30
GIT_TIMEOUT_S = 15
MAX_LIST_DEFAULT = 200
LABEL_QUERY_LIMIT = 50000

# Files in K3 but not git are always meaningful (stale graph entries).
# For the git->K3 direction only symbol-bearing extensions are actionable —
# assets/docs without parseable symbols are not drift.
CODE_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".svelte", ".astro",
    ".py", ".sh", ".bash", ".go", ".rs", ".java", ".php", ".sql", ".css",
    ".scss", ".bats",
}

FATAL = "unknown"


def eprint(msg):
    print(msg, file=sys.stderr)


def run_bytes(cmd, timeout=15):
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return p.returncode, p.stdout or b"", p.stderr or b"", False, False
    except subprocess.TimeoutExpired as ex:
        return 124, ex.stdout or b"", ex.stderr or b"", True, False
    except FileNotFoundError:
        return 127, b"", b"", False, True
    except OSError:
        return 1, b"", b"", False, False


def git_toplevel(repo):
    rc, out, _err, to, missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "--show-toplevel"], GIT_TIMEOUT_S)
    if missing or to or rc != 0:
        return None
    raw = out.decode("utf-8", "surrogateescape").strip()
    return os.path.realpath(raw) if raw else None


def git_head(repo):
    rc, out, _err, to, _missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "HEAD"], GIT_TIMEOUT_S)
    if to or rc != 0:
        return None
    return out.decode("utf-8", "surrogateescape").strip() or None


def git_tracked_files(repo):
    rc, out, _err, to, _missing = run_bytes(
        ["git", "-C", repo, "ls-files", "-z"], GIT_TIMEOUT_S)
    if to or rc != 0:
        return None
    text = out.decode("utf-8", "surrogateescape")
    return {p.replace(os.sep, "/") for p in text.split("\0") if p}


def probe_cli_json(cmd, timeout):
    """Run a CLI probe, return (data, error_code, stdout, stderr).

    data is the parsed stdout JSON (MCP envelope dict or bare dict).
    """
    rc, out, err, timed_out, missing = run_bytes(cmd, timeout)
    if missing:
        return None, "tool-missing", "", ""
    if timed_out:
        return None, "probe-timeout", "", ""
    stdout = out.decode("utf-8", "surrogateescape")
    stderr = err.decode("utf-8", "surrogateescape")
    if rc != 0:
        return None, "probe-failed", stdout, stderr
    try:
        data = json.loads(stdout) if stdout.strip() else None
    except json.JSONDecodeError:
        return None, "probe-malformed", stdout, stderr
    if not isinstance(data, dict):
        return None, "probe-malformed", stdout, stderr
    if "error" in data or "isError" in data and data.get("isError"):
        return data, "tool-error", stdout, stderr
    return data, None, stdout, stderr


def envelope_text(data):
    """Extract concatenated text from an MCP --json envelope, or None."""
    if not isinstance(data, dict):
        return None
    content = data.get("content")
    if not isinstance(content, list):
        return None
    parts = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(item.get("text", ""))
    return "\n".join(parts) if parts else None


def parse_query_rows(text):
    """Parse query_graph table text: rows are lines indented by two spaces
    between the 'rows:' header and the 'total:' trailer. Returns a set or
    None when the format is unrecognised."""
    if not isinstance(text, str) or "rows:" not in text:
        return None
    rows = set()
    for line in text.splitlines():
        if line.startswith("total:"):
            break
        if line.startswith("  ") and not line.startswith("   "):
            value = line.strip()
            if value:
                rows.add(value.replace("\\", "/"))
    return rows if rows or "rows:" in text else None


def k3_symbol_files(project, timeout, reasons):
    """DISTINCT file_path per label that carries file_path, via the CLI.
    Returns a set of paths, or None on any probe failure (fail-closed)."""
    schema, err, _so, _se = probe_cli_json(
        ["codebase-memory-mcp", "cli", "--json", "get_graph_schema",
         "--project", project], timeout)
    if err or schema is None:
        reasons.append("k3-schema-probe-failed")
        return None
    text = envelope_text(schema)
    if text is None:
        reasons.append("k3-schema-probe-failed")
        return None
    try:
        schema_body = json.loads(text)
    except json.JSONDecodeError:
        reasons.append("k3-schema-probe-failed")
        return None
    labels = [lbl.get("label") for lbl in schema_body.get("node_labels", [])
              if isinstance(lbl, dict) and "file_path" in (lbl.get("properties") or [])]
    if not labels:
        reasons.append("k3-schema-no-file-labels")
        return None
    files = set()
    for label in labels:
        query = ("MATCH (n:%s) RETURN DISTINCT n.file_path AS file LIMIT %d"
                 % (label, LABEL_QUERY_LIMIT))
        _data, err, _so, _se = probe_cli_json(
            ["codebase-memory-mcp", "cli", "--json", "query_graph",
             "--project", project, "--query", query], timeout)
        if err:
            reasons.append("k3-coverage-probe-failed")
            return None
        rows = parse_query_rows(envelope_text(_data) or "")
        if rows is None:
            reasons.append("k3-coverage-probe-failed")
            return None
        files |= rows
    return files


def k3_index_info(project, timeout, reasons):
    data, err, _so, _se = probe_cli_json(
        ["codebase-memory-mcp", "cli", "index_status", "--project", project],
        timeout)
    if err or data is None:
        reasons.append("k3-index-probe-failed")
        return None
    info = {"nodes": data.get("nodes"), "edges": data.get("edges"),
            "status": data.get("status"), "root_path": data.get("root_path"),
            "project": data.get("project")}
    return info


def k3_freshness(script_path, repo, project, timeout, reasons):
    try:
        p = subprocess.run(
            [sys.executable, str(script_path), "status", "--repo", repo,
             "--project", project, "--timeout", str(timeout)],
            capture_output=True, timeout=timeout + 10)
        out = p.stdout.decode("utf-8", "surrogateescape")
        data = json.loads(out) if out.strip() else None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        data = None
    if not isinstance(data, dict) or "status" not in data:
        reasons.append("freshness-probe-failed")
        return {"status": "unknown", "reasons": ["freshness-probe-failed"],
                "receipt": None}
    return {"status": data.get("status"), "reasons": data.get("reasons", []),
            "receipt": (data.get("receipt") or {}).get("timestamp")
            if isinstance(data.get("receipt"), dict) else None}


def k1_evidence():
    """K1 exposes no disk evidence in a checkout: pgvector is external, the
    indexer (scripts/index-repo.ts) is triggered by a machine-local git hook
    that is not versioned, and no receipt is written. Report unavailable."""
    return {
        "status": "unavailable",
        "reasons": ["no-local-receipt", "pgvector-external-not-probed",
                     "hook-machine-local-unversioned"],
        "surfaces": {"indexer": "scripts/index-repo.ts",
                      "client": "components/website/src/lib/embeddings.ts",
                      "store": "pgvector (external service)"},
        "note": ("K1 divergence is not judgeable from disk; the index-time "
                 "asymmetry (post-commit vs hourly cron) remains documented "
                 "in docs/brain/k3-code-graph.md until K1 emits receipts."),
    }


def capped(paths, limit):
    sorted_paths = sorted(paths)
    return {"count": len(sorted_paths),
            "paths": sorted_paths[:limit],
            "truncated": len(sorted_paths) > limit}


def cmd_status(args):
    reasons = []
    repo_in = args.repo or os.getcwd()
    project = args.project or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    timeout = args.timeout
    limit = args.max_list

    checkout_root = git_toplevel(repo_in)
    if not checkout_root:
        out = {"schema_version": SCHEMA_VERSION, "verdict": FATAL,
               "verdict_reasons": ["repo-not-found"], "repo": {"root": None},
               "project": project, "k3_freshness": {"status": "unknown"},
               "k3_index": None, "k1_evidence": k1_evidence(),
               "coverage": None}
        print(json.dumps(out, ensure_ascii=False, sort_keys=True))
        return 1
    head = git_head(checkout_root)
    if not head:
        reasons.append("head-unknown")

    freshness = k3_freshness(Path(__file__).resolve().parent / "cbm-freshness.py",
                             checkout_root, project, timeout, reasons)
    index_info = k3_index_info(project, timeout, reasons)
    k3_files = k3_symbol_files(project, timeout, reasons)
    tracked = git_tracked_files(checkout_root)
    if tracked is None:
        reasons.append("git-ls-files-failed")

    coverage = None
    if index_info is not None and k3_files is not None and tracked is not None and head:
        tracked_code = {p for p in tracked
                        if os.path.splitext(p)[1].lower() in CODE_EXTS}
        code_unindexed = tracked_code - k3_files
        k3_untracked = k3_files - tracked
        coverage = {
            "tracked_files": len(tracked),
            "tracked_code_files": len(tracked_code),
            "k3_symbol_files": len(k3_files),
            "code_unindexed": capped(code_unindexed, limit),
            "k3_untracked": capped(k3_untracked, limit),
        }
    if freshness["status"] != "fresh":
        verdict = FATAL
        if "k3-not-fresh" not in reasons:
            reasons.append("k3-not-fresh")
    elif index_info is None or k3_files is None or tracked is None or not head \
            or coverage is None:
        verdict = FATAL
    else:
        code_unindexed = coverage["code_unindexed"]["count"]
        k3_untracked = coverage["k3_untracked"]["count"]
        if code_unindexed or k3_untracked:
            verdict = "diverged"
            if code_unindexed:
                reasons.append("code-unindexed:%d" % code_unindexed)
            if k3_untracked:
                reasons.append("k3-untracked:%d" % k3_untracked)
        else:
            verdict = "fresh"
    if verdict == FATAL:
        reasons.append("verdict-unknown")

    out = {"schema_version": SCHEMA_VERSION,
           "verdict": verdict,
           "verdict_reasons": sorted(set(reasons)),
           "repo": {"root": checkout_root, "head": head},
           "project": project,
           "k3_freshness": freshness,
           "k3_index": index_info,
           "k1_evidence": k1_evidence(),
           "coverage": coverage,
           "timeout_s": timeout}
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0 if verdict in ("fresh", "diverged") else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    status = sub.add_parser("status", help="emit one reconciliation JSON object")
    status.add_argument("--repo", default=None,
                        help="checkout root (default: cwd)")
    status.add_argument("--project", default=None,
                        help="graph project (default: $CBM_PROJECT or %s)"
                             % DEFAULT_PROJECT)
    status.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    status.add_argument("--max-list", type=int, default=MAX_LIST_DEFAULT,
                        help="cap for divergence path lists")
    args = parser.parse_args()
    if args.command == "status":
        sys.exit(cmd_status(args))


if __name__ == "__main__":
    main()
