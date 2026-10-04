#!/usr/bin/env python3
"""Conservative K3 freshness reporting with successful-index receipts.

Read-only status never fetches or indexes. Failed, missing or malformed
graph probes never yield fresh. Receipts are written atomically by the
single-flight wrapper while holding its lock.

Usage:
  cbm-freshness.py status --repo PATH --project NAME --timeout SECONDS
  cbm-freshness.py begin --args-json JSON [--project NAME]
  cbm-freshness.py finish --args-json JSON --attempt-id ID --exit-code N \\
      --stdout-file PATH --stderr-file PATH [--project NAME]
"""
import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"
DEFAULT_TIMEOUT_S = 30


def _load_sibling(mod_name, filename):
    """Load a sibling helper module once per process (sys.modules-pinned)."""
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        mod_name, os.path.join(here, filename))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


# Repo-state layer (git snapshot, fingerprint, receipt paths' snapshot) lives
# in cbm-freshness-state.py (S1 filesize split). Re-exported so existing
# importers (tests) keep working: mod.git_toplevel, mod.git_head,
# mod.git_diff_binary, mod.git_untracked_files, mod.fingerprint_state.
_STATE = _load_sibling("cbm_freshness_state", "cbm-freshness-state.py")
git_toplevel = _STATE.git_toplevel
git_head = _STATE.git_head
git_diff_binary = _STATE.git_diff_binary
git_untracked_files = _STATE.git_untracked_files
git_status_lists = _STATE.git_status_lists
fingerprint_state = _STATE.fingerprint_state
git_origin_main = _STATE.git_origin_main
upstream_relation = _STATE.upstream_relation

def eprint(msg):
    print(msg, file=sys.stderr)


def cache_dir():
    home = os.environ.get("HOME") or str(Path.home())
    return Path(home) / ".cache" / "codebase-memory-mcp"


def safe_project(project):
    return "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in project)


def root_hash(canonical_root):
    return hashlib.sha256(canonical_root.encode("utf-8")).hexdigest()[:32]


def receipt_path(project, canonical_root):
    return cache_dir() / f"cbm-receipt-{safe_project(project)}-{root_hash(canonical_root)}.json"


def attempt_path(project, canonical_root):
    return cache_dir() / f"cbm-attempt-{safe_project(project)}-{root_hash(canonical_root)}.json"


def db_path(project):
    return cache_dir() / f"{project}.db"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def db_stat_info(project):
    p = db_path(project)
    try:
        st = os.stat(p)
    except FileNotFoundError:
        return None
    except OSError:
        return {"path": str(p), "error": "stat-failed"}
    return {"path": str(p), "size": st.st_size, "mtime_ns": st.st_mtime_ns,
            "ino": st.st_ino, "mode": st.st_mode}


def atomic_write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            pass
    os.replace(tmp, path)


def load_json_file(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh), None
    except FileNotFoundError:
        return None, "missing"
    except (json.JSONDecodeError, UnicodeDecodeError, OSError):
        return None, "malformed"


def tool_version(timeout=10):
    rc, out, _err, timed_out, missing = _STATE.run_bytes(
        ["codebase-memory-mcp", "--version"], timeout=timeout)
    if missing:
        return None, "tool-missing"
    if timed_out:
        return None, "probe-timeout"
    if rc != 0:
        return None, "probe-failed"
    try:
        text = out.decode("utf-8", "surrogateescape").strip()
    except Exception:
        return None, "probe-malformed"
    return (text or "unknown"), None


def envelope_text(data):
    """Extract concatenated text from an MCP `cli --json` envelope, or None."""
    if not isinstance(data, dict):
        return None
    content = data.get("content")
    if not isinstance(content, list):
        return None
    parts = [item.get("text", "") for item in content
             if isinstance(item, dict) and item.get("type") == "text"]
    return "\n".join(parts) if parts else None


def parse_changes_text(text):
    """Minimal structuring of a detect_changes plain-text payload.

    Never fails the probe: unparseable fields stay None."""
    base, changed = None, None
    try:
        for line in text.splitlines():
            if ":" not in line:
                continue
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()
            if key == "base" and value and base is None:
                base = value
            elif key == "changed_files" and changed is None:
                try:
                    changed = int(value.split()[0])
                except (ValueError, IndexError):
                    changed = None
    except Exception:
        pass
    return {"text": text, "base": base, "changed_files": changed}


def parse_probe_payload(data, expect_json):
    """Unwrap a `cli --json` MCP envelope.

    Returns (payload, raw_text, error_code): payload is the inner dict for
    JSON probes (index_status) or {"text","base","changed_files"} for text
    probes (detect_changes); raw_text is the unwrapped envelope text ("" when
    absent); error_code is None on success, else probe-malformed/tool-error.
    Fail-closed: any unrecognised shape yields an error code, never success.
    """
    if not isinstance(data, dict):
        return None, "", "probe-malformed"
    text = envelope_text(data)
    if text is None:
        if data.get("isError"):
            return None, "", "tool-error"
        return None, "", "probe-malformed"
    if data.get("isError"):
        return None, text, "tool-error"
    if expect_json:
        try:
            inner = json.loads(text) if text.strip() else None
        except json.JSONDecodeError:
            return None, text, "probe-malformed"
        if not isinstance(inner, dict):
            return None, text, "probe-malformed"
        if "error" in inner or "tool_error" in inner:
            return inner, text, "tool-error"
        return inner, text, None
    if not text.strip():
        return None, text, "probe-malformed"
    return parse_changes_text(text), text, None


def probe_graph(cmd, timeout, expect_json):
    """Run a `cli --json` probe and unwrap its MCP envelope.

    expect_json=True for probes whose inner text is JSON (index_status),
    False for plain-text probes (detect_changes). Returns
    (payload, error_code, stdout, stderr) like probe_json."""
    rc, out, err, timed_out, missing = _STATE.run_bytes(cmd, timeout=timeout)
    if missing:
        return None, "tool-missing", "", ""
    if timed_out:
        return None, "probe-timeout", "", ""
    try:
        stdout = out.decode("utf-8", "surrogateescape")
        stderr = err.decode("utf-8", "surrogateescape")
    except Exception:
        return None, "probe-malformed", "", ""
    if rc != 0:
        return None, "probe-failed", stdout, stderr
    try:
        data = json.loads(stdout) if stdout.strip() else None
    except json.JSONDecodeError:
        return None, "probe-malformed", stdout, stderr
    payload, _raw, perr = parse_probe_payload(data, expect_json)
    if perr:
        return payload, perr, stdout, stderr
    return payload, None, stdout, stderr


def probe_json(cmd, timeout):
    """Backwards-compatible JSON probe: unwraps a `cli --json` envelope
    whose inner text is JSON (e.g. index_status)."""
    return probe_graph(cmd, timeout, True)


def graph_identity(data):
    """Extract (project, canonical_root) from index_status payload if present."""
    if not isinstance(data, dict):
        return None, None
    proj = data.get("project")
    root = data.get("root_path")
    git = data.get("git") if isinstance(data.get("git"), dict) else {}
    canon = git.get("canonical_root") or git.get("worktree_root") or root
    if isinstance(canon, str):
        try:
            canon = os.path.realpath(canon)
        except Exception:
            pass
    return proj, canon


def validate_receipt(data):
    if not isinstance(data, dict):
        return False
    required = ["schema_version", "timestamp", "head_sha", "canonical_root",
                "project", "mode", "tool_version", "state_fingerprint", "dirty"]
    for key in required:
        if key not in data:
            return False
    if data.get("schema_version") != SCHEMA_VERSION:
        return False
    if not isinstance(data.get("head_sha"), str) or len(data["head_sha"]) != 40:
        return False
    if not isinstance(data.get("canonical_root"), str) or not data["canonical_root"]:
        return False
    if not isinstance(data.get("project"), str) or not data["project"]:
        return False
    if not isinstance(data.get("state_fingerprint"), str) or not data["state_fingerprint"]:
        return False
    if not isinstance(data.get("dirty"), bool):
        return False
    return True


def same_db(a, b):
    if a is None or b is None:
        return a is None and b is None
    if not isinstance(a, dict) or not isinstance(b, dict):
        return False
    if "error" in a or "error" in b:
        return False
    for key in ("size", "mtime_ns", "ino", "mode", "path"):
        if a.get(key) != b.get(key):
            return False
    return True


def cmd_status(args):
    repo_in = args.repo or _STATE.script_checkout_root()
    project = args.project or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    timeout = args.timeout
    reasons = []
    checkout_root = git_toplevel(repo_in)
    if not checkout_root:
        out = {"status": "unknown", "reasons": ["repo-not-found"],
               "refresh_allowed": False, "checkout": {"root": None, "head": None},
               "upstream": {"sha": None, "relation": "unknown"},
               "dirty": {"paths": [], "count": 0},
               "untracked": {"paths": [], "count": 0},
               "graph": {}, "receipt": None, "attempt": None,
               "project": project, "timeout_s": timeout}
        print(json.dumps(out, ensure_ascii=False, sort_keys=True))
        return 1
    head = git_head(checkout_root)
    upstream_sha = git_origin_main(checkout_root)
    relation = upstream_relation(checkout_root, head, upstream_sha)
    if not head:
        reasons.append("head-unknown")
    dirty, untracked, git_err = git_status_lists(checkout_root)
    if git_err:
        reasons.append(git_err)
        dirty, untracked = [], []
    diff_bytes, diff_err = git_diff_binary(checkout_root) if head else (None, "head-unknown")
    if diff_err and diff_err not in reasons:
        reasons.append(diff_err)
    untracked_files, ls_err = git_untracked_files(checkout_root)
    if ls_err and ls_err not in reasons:
        reasons.append(ls_err)
        untracked_files = []
    fingerprint = None
    if head and diff_bytes is not None and untracked_files is not None:
        try:
            fingerprint = fingerprint_state(checkout_root, head, diff_bytes, untracked_files)
        except Exception:
            reasons.append("fingerprint-failed")
    else:
        if "fingerprint-failed" not in reasons:
            reasons.append("snapshot-incomplete")
    ver, ver_err = tool_version(timeout=min(timeout, 10))
    status_data, status_err, _so, _se = probe_json(
        ["codebase-memory-mcp", "cli", "--json", "index_status", "--project", project], timeout)
    changes_data, changes_err, _co, _ce = probe_graph(
        ["codebase-memory-mcp", "cli", "--json", "detect_changes", "--project", project],
        timeout, False)
    graph = {"tool_version": ver,
             "index_status": status_data,
             "detect_changes": changes_data}
    probe_failed = False
    for code in (ver_err, status_err, changes_err):
        if code:
            probe_failed = True
            if code not in reasons:
                reasons.append(code)
    if status_data is not None:
        gproj, groot = graph_identity(status_data)
        if gproj and gproj != project:
            probe_failed = True
            if "project-mismatch" not in reasons:
                reasons.append("project-mismatch")
        if groot and groot != checkout_root:
            probe_failed = True
            if "root-mismatch" not in reasons:
                reasons.append("root-mismatch")
    rpath = receipt_path(project, checkout_root)
    apath = attempt_path(project, checkout_root)
    receipt, rerr = load_json_file(rpath)
    attempt, aerr = load_json_file(apath)
    if rerr == "missing":
        reasons.append("receipt-missing")
    elif rerr == "malformed" or not validate_receipt(receipt):
        reasons.append("receipt-malformed")
        receipt = None
    else:
        try:
            rroot = os.path.realpath(receipt["canonical_root"])
        except Exception:
            rroot = receipt["canonical_root"]
        if rroot != checkout_root or receipt["project"] != project:
            reasons.append("receipt-identity-mismatch")
            receipt = None
    if aerr == "malformed":
        reasons.append("attempt-malformed")
        attempt = None
    cur_db = db_stat_info(project)
    if receipt is not None:
        rec_db = receipt.get("db")
        if rec_db is not None and not same_db(rec_db, cur_db):
            reasons.append("db-changed")
            receipt = None
        elif attempt is not None and isinstance(attempt, dict):
            astate = attempt.get("state")
            arid = attempt.get("receipt_id")
            rts = receipt.get("timestamp", "")
            ats = attempt.get("timestamp", "")
            if astate in ("in_progress", "failed") and ats >= rts:
                if astate == "in_progress":
                    reasons.append("attempt-in-progress")
                else:
                    reasons.append("attempt-failed")
                receipt = None
            elif astate == "success" and arid and arid != attempt.get("receipt_id"):
                pass
    dirty_flag = bool(dirty or untracked)
    refresh_allowed = False
    status = "unknown"
    fatal = {"repo-not-found", "head-unknown", "tool-missing", "probe-timeout",
             "probe-failed", "probe-malformed", "tool-error", "root-mismatch",
             "project-mismatch", "receipt-malformed", "receipt-identity-mismatch",
             "db-changed", "attempt-in-progress", "attempt-failed", "attempt-malformed",
             "snapshot-incomplete", "fingerprint-failed", "git-missing", "git-timeout",
             "git-status-failed", "git-diff-failed", "git-ls-files-failed"}
    has_fatal = any(r in fatal for r in reasons)
    if not has_fatal and not probe_failed and receipt is not None and fingerprint:
        if receipt["head_sha"] == head and receipt["state_fingerprint"] == fingerprint:
            status = "fresh"
            reasons = [r for r in reasons if r not in ("receipt-missing",)]
            if dirty_flag:
                if "dirty-snapshot" not in reasons:
                    reasons.append("dirty-snapshot")
            else:
                if "clean-snapshot" not in reasons:
                    reasons.append("clean-snapshot")
            if relation in ("behind", "diverged", "ahead"):
                if "upstream-lag" not in reasons and relation in ("behind", "diverged"):
                    reasons.append("upstream-lag")
            refresh_allowed = False
        else:
            status = "stale"
            if receipt["head_sha"] != head:
                reasons.append("head-drift")
            if receipt["state_fingerprint"] != fingerprint:
                reasons.append("state-drift")
            refresh_allowed = True
    elif not has_fatal and not probe_failed and receipt is None and "receipt-missing" in reasons:
        status = "unknown"
        if "initial-refresh" not in reasons:
            reasons.append("initial-refresh")
        refresh_allowed = True
    else:
        status = "unknown"
        refresh_allowed = False
    out = {"status": status, "reasons": sorted(set(reasons)),
           "refresh_allowed": refresh_allowed,
           "checkout": {"root": checkout_root, "head": head},
           "upstream": {"sha": upstream_sha, "relation": relation},
           "dirty": {"paths": dirty or [], "count": len(dirty or [])},
           "untracked": {"paths": untracked or [], "count": len(untracked or [])},
           "graph": graph, "receipt": receipt, "attempt": attempt,
           "fingerprint": fingerprint, "db": cur_db,
           "project": project, "timeout_s": timeout}
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0 if status in ("fresh", "stale") else 1


def parse_index_args(args_json):
    try:
        data = json.loads(args_json)
    except (json.JSONDecodeError, TypeError):
        return None, "args-malformed"
    if not isinstance(data, dict):
        return None, "args-malformed"
    repo = data.get("repo_path")
    if not isinstance(repo, str) or not repo:
        return None, "repo-not-found"
    mode = data.get("mode", "fast")
    if not isinstance(mode, str):
        mode = "fast"
    proj = data.get("project")
    if not isinstance(proj, str) or not proj:
        proj = None
    return {"repo_path": repo, "mode": mode, "project": proj, "raw": data}, None


def cmd_begin(args):
    parsed, perr = parse_index_args(args.args_json)
    if perr:
        eprint(f"[cbm-freshness] begin: {perr}")
        return 2
    project = args.project or parsed["project"] or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    snap, serr = _STATE.snapshot_repo(parsed["repo_path"])
    if serr:
        eprint(f"[cbm-freshness] begin: {serr}")
        return 1
    ver, verr = tool_version(timeout=10)
    if verr:
        eprint(f"[cbm-freshness] begin: {verr}")
        return 1
    attempt_id = hashlib.sha256(
        f"{snap['root']}\x00{project}\x00{time.time_ns()}\x00{os.getpid()}".encode()
    ).hexdigest()[:16]
    marker = {"schema_version": SCHEMA_VERSION, "state": "in_progress",
              "attempt_id": attempt_id, "receipt_id": None,
              "timestamp": utc_now_iso(), "canonical_root": snap["root"],
              "project": project, "mode": parsed["mode"],
              "head_sha": snap["head"], "state_fingerprint": snap["fingerprint"],
              "dirty": snap["dirty"], "tool_version": ver}
    try:
        atomic_write_json(attempt_path(project, snap["root"]), marker)
    except OSError as ex:
        eprint(f"[cbm-freshness] begin: marker-write-failed: {ex}")
        return 1
    print(json.dumps({"attempt_id": attempt_id, "canonical_root": snap["root"],
                      "project": project, "head_sha": snap["head"],
                      "state_fingerprint": snap["fingerprint"]},
                     ensure_ascii=False, sort_keys=True))
    return 0


def cmd_finish(args):
    parsed, perr = parse_index_args(args.args_json)
    if perr:
        eprint(f"[cbm-freshness] finish: {perr}")
        return 2
    project = args.project or parsed["project"] or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    snap_before_root = git_toplevel(parsed["repo_path"])
    if not snap_before_root:
        eprint("[cbm-freshness] finish: repo-not-found")
        return 1
    apath = attempt_path(project, snap_before_root)
    marker, merr = load_json_file(apath)
    if merr or not isinstance(marker, dict) or marker.get("attempt_id") != args.attempt_id:
        eprint("[cbm-freshness] finish: attempt-mismatch")
        try:
            atomic_write_json(apath, {"schema_version": SCHEMA_VERSION, "state": "failed",
                                      "attempt_id": args.attempt_id, "receipt_id": None,
                                      "timestamp": utc_now_iso(),
                                      "canonical_root": snap_before_root,
                                      "project": project, "reason": "attempt-mismatch"})
        except OSError:
            pass
        return 1
    if args.exit_code != 0:
        try:
            marker.update({"state": "failed", "timestamp": utc_now_iso(),
                           "reason": f"cli-exit-{args.exit_code}"})
            atomic_write_json(apath, marker)
        except OSError as ex:
            eprint(f"[cbm-freshness] finish: marker-write-failed: {ex}")
            return 1
        return 0
    try:
        with open(args.stdout_file, "r", encoding="utf-8") as fh:
            stdout_text = fh.read()
    except OSError:
        stdout_text = ""
    try:
        cli_data = json.loads(stdout_text) if stdout_text.strip() else {}
    except json.JSONDecodeError:
        cli_data = None
    if cli_data is None or (isinstance(cli_data, dict) and ("error" in cli_data or "tool_error" in cli_data)):
        try:
            marker.update({"state": "failed", "timestamp": utc_now_iso(), "reason": "tool-error"})
            atomic_write_json(apath, marker)
        except OSError:
            pass
        eprint("[cbm-freshness] finish: tool-error")
        return 1
    snap_after, serr = _STATE.snapshot_repo(parsed["repo_path"])
    if serr:
        try:
            marker.update({"state": "failed", "timestamp": utc_now_iso(), "reason": serr})
            atomic_write_json(apath, marker)
        except OSError:
            pass
        eprint(f"[cbm-freshness] finish: {serr}")
        return 1
    before_fp = marker.get("state_fingerprint")
    before_head = marker.get("head_sha")
    if before_fp != snap_after.get("fingerprint") or before_head != snap_after.get("head"):
        try:
            marker.update({"state": "failed", "timestamp": utc_now_iso(), "reason": "unstable-repo"})
            atomic_write_json(apath, marker)
        except OSError:
            pass
        eprint("[cbm-freshness] finish: unstable-repo")
        return 1
    if snap_after["root"] != snap_before_root:
        try:
            marker.update({"state": "failed", "timestamp": utc_now_iso(), "reason": "root-mismatch"})
            atomic_write_json(apath, marker)
        except OSError:
            pass
        return 1
    ver, _verr = tool_version(timeout=10)
    receipt = {"schema_version": SCHEMA_VERSION, "timestamp": utc_now_iso(),
               "head_sha": snap_after["head"], "canonical_root": snap_after["root"],
               "project": project, "mode": parsed["mode"],
               "tool_version": ver or marker.get("tool_version") or "unknown",
               "state_fingerprint": snap_after["fingerprint"],
               "dirty": snap_after["dirty"],
               "dirty_count": snap_after["dirty_count"],
               "untracked_count": snap_after["untracked_count"],
               "db": db_stat_info(project),
               "receipt_id": args.attempt_id}
    try:
        atomic_write_json(receipt_path(project, snap_after["root"]), receipt)
        marker.update({"state": "success", "timestamp": utc_now_iso(),
                       "receipt_id": args.attempt_id})
        atomic_write_json(apath, marker)
    except OSError as ex:
        eprint(f"[cbm-freshness] finish: receipt-write-failed: {ex}")
        return 1
    return 0


def build_parser():
    ap = argparse.ArgumentParser(prog="cbm-freshness.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("status", help="Read-only freshness report")
    sp.add_argument("--repo", default=None)
    sp.add_argument("--project", default=None)
    sp.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    bp = sub.add_parser("begin", help="Record pre-index snapshot under lock")
    bp.add_argument("--args-json", required=True)
    bp.add_argument("--project", default=None)
    fp = sub.add_parser("finish", help="Validate index result and record receipt")
    fp.add_argument("--args-json", required=True)
    fp.add_argument("--attempt-id", required=True)
    fp.add_argument("--exit-code", type=int, required=True)
    fp.add_argument("--stdout-file", required=True)
    fp.add_argument("--stderr-file", required=True)
    fp.add_argument("--project", default=None)
    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    if args.cmd == "status":
        if args.timeout is None or args.timeout <= 0 or args.timeout > 600:
            eprint("[cbm-freshness] status: invalid --timeout (1..600)")
            return 2
        return cmd_status(args)
    if args.cmd == "begin":
        return cmd_begin(args)
    if args.cmd == "finish":
        return cmd_finish(args)
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
