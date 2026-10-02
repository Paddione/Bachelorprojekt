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
import stat as statmod
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"
DEFAULT_TIMEOUT_S = 30
GIT_TIMEOUT_S = 15

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


def run_bytes(cmd, cwd=None, timeout=15):
    """Run command, return (rc, stdout_bytes, stderr_bytes, timed_out, missing)."""
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, timeout=timeout)
        return p.returncode, p.stdout or b"", p.stderr or b"", False, False
    except subprocess.TimeoutExpired as ex:
        out = ex.stdout or b""
        err = ex.stderr or b""
        if isinstance(out, str):
            out = out.encode()
        if isinstance(err, str):
            err = err.encode()
        return 124, out, err, True, False
    except FileNotFoundError:
        return 127, b"", b"", False, True
    except OSError:
        return 1, b"", b"", False, False


def git_toplevel(repo):
    rc, out, _err, _to, missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "--show-toplevel"], timeout=GIT_TIMEOUT_S)
    if missing or rc != 0:
        return None
    try:
        raw = out.decode("utf-8", "surrogateescape").strip()
    except Exception:
        return None
    if not raw:
        return None
    try:
        return os.path.realpath(raw)
    except Exception:
        return raw


def git_head(repo):
    rc, out, _err, _to, missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "HEAD"], timeout=GIT_TIMEOUT_S)
    if missing or rc != 0:
        return None
    try:
        sha = out.decode("utf-8", "surrogateescape").strip()
    except Exception:
        return None
    if len(sha) != 40:
        return None
    return sha


def git_origin_main(repo):
    rc, out, _err, _to, missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "--verify", "origin/main"], timeout=GIT_TIMEOUT_S)
    if missing or rc != 0:
        return None
    try:
        sha = out.decode("utf-8", "surrogateescape").strip()
    except Exception:
        return None
    if len(sha) != 40:
        return None
    return sha


def git_is_ancestor(repo, a, b):
    """True if a is ancestor of b, False if not, None on error."""
    rc, _out, _err, _to, missing = run_bytes(
        ["git", "-C", repo, "merge-base", "--is-ancestor", a, b], timeout=GIT_TIMEOUT_S)
    if missing:
        return None
    if rc == 0:
        return True
    if rc == 1:
        return False
    return None


def upstream_relation(repo, head, upstream):
    if not head or not upstream:
        return "unknown"
    if head == upstream:
        return "same"
    h_in_u = git_is_ancestor(repo, head, upstream)
    u_in_h = git_is_ancestor(repo, upstream, head)
    if h_in_u is None or u_in_h is None:
        return "unknown"
    if h_in_u and not u_in_h:
        return "behind"
    if u_in_h and not h_in_u:
        return "ahead"
    if not h_in_u and not u_in_h:
        return "diverged"
    return "unknown"


def parse_status_z(raw):
    """Parse git status --porcelain=v1 -z. Return (dirty, untracked) unique sorted."""
    dirty = set()
    untracked = set()
    if not raw:
        return [], []
    parts = raw.split(b"\x00")
    i = 0
    while i < len(parts):
        field = parts[i]
        i += 1
        if not field:
            continue
        if len(field) < 4:
            continue
        try:
            xy = field[:2].decode("utf-8", "surrogateescape")
            path = field[3:].decode("utf-8", "surrogateescape")
        except Exception:
            continue
        if xy == "??":
            if path:
                untracked.add(path)
            continue
        if path:
            dirty.add(path)
        if xy[0] in ("R", "C") or xy[1] in ("R", "C"):
            if i < len(parts) and parts[i]:
                try:
                    orig = parts[i].decode("utf-8", "surrogateescape")
                except Exception:
                    orig = ""
                if orig:
                    dirty.add(orig)
                i += 1
    return sorted(dirty), sorted(untracked)


def git_status_lists(repo):
    rc, out, _err, timed_out, missing = run_bytes(
        ["git", "-C", repo, "status", "--porcelain=v1", "-z",
         "--untracked-files=normal"], timeout=GIT_TIMEOUT_S)
    if missing:
        return None, None, "git-missing"
    if timed_out:
        return None, None, "git-timeout"
    if rc != 0:
        return None, None, "git-status-failed"
    dirty, untracked = parse_status_z(out)
    return dirty, untracked, None


def git_diff_binary(repo):
    rc, out, _err, timed_out, missing = run_bytes(
        ["git", "-C", repo, "diff", "--binary", "HEAD"], timeout=GIT_TIMEOUT_S)
    if missing:
        return None, "git-missing"
    if timed_out:
        return None, "git-timeout"
    if rc != 0:
        return None, "git-diff-failed"
    return out, None


def git_untracked_files(repo):
    rc, out, _err, timed_out, missing = run_bytes(
        ["git", "-C", repo, "ls-files", "--others", "--exclude-standard", "-z"],
        timeout=GIT_TIMEOUT_S)
    if missing:
        return None, "git-missing"
    if timed_out:
        return None, "git-timeout"
    if rc != 0:
        return None, "git-ls-files-failed"
    files = []
    for part in out.split(b"\x00"):
        if not part:
            continue
        try:
            files.append(part.decode("utf-8", "surrogateescape"))
        except Exception:
            continue
    return sorted(set(files)), None


def fingerprint_state(canonical_root, head, diff_bytes, untracked_files):
    h = hashlib.sha256()
    h.update(b"cbm-freshness-v1\x00")
    h.update(b"head:")
    h.update((head or "").encode("utf-8", "surrogateescape"))
    h.update(b"\x00diff-len:")
    h.update(len(diff_bytes or b"").to_bytes(8, "big"))
    h.update(b"\x00")
    h.update(diff_bytes or b"")
    for rel in sorted(untracked_files or []):
        h.update(b"\x00untracked:")
        h.update(rel.encode("utf-8", "surrogateescape"))
        full = os.path.join(canonical_root, rel)
        try:
            st = os.lstat(full)
        except FileNotFoundError:
            h.update(b":missing")
            continue
        except OSError:
            h.update(b":stat-error")
            continue
        if statmod.S_ISLNK(st.st_mode):
            h.update(b":symlink:")
            try:
                target = os.readlink(full)
            except OSError:
                h.update(b"readlink-error")
                continue
            h.update(target.encode("utf-8", "surrogateescape"))
        elif statmod.S_ISREG(st.st_mode):
            h.update(b":file:")
            try:
                with open(full, "rb") as fh:
                    while True:
                        chunk = fh.read(65536)
                        if not chunk:
                            break
                        h.update(chunk)
            except OSError:
                h.update(b":read-error")
        else:
            h.update(b":other")
    return h.hexdigest()


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
    rc, out, _err, timed_out, missing = run_bytes(
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


def probe_json(cmd, timeout):
    rc, out, err, timed_out, missing = run_bytes(cmd, timeout=timeout)
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
    if not isinstance(data, dict):
        return None, "probe-malformed", stdout, stderr
    if "error" in data or "tool_error" in data:
        return data, "tool-error", stdout, stderr
    return data, None, stdout, stderr


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


def script_checkout_root():
    try:
        here = str(Path(__file__).resolve().parent)
        rc, out, _err, _to, missing = run_bytes(
            ["git", "-C", here, "rev-parse", "--show-toplevel"], timeout=GIT_TIMEOUT_S)
        if missing or rc != 0:
            return os.getcwd()
        raw = out.decode("utf-8", "surrogateescape").strip()
        return os.path.realpath(raw) if raw else os.getcwd()
    except Exception:
        return os.getcwd()


def cmd_status(args):
    repo_in = args.repo or script_checkout_root()
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
        ["codebase-memory-mcp", "cli", "index_status", "--project", project], timeout)
    changes_data, changes_err, _co, _ce = probe_json(
        ["codebase-memory-mcp", "cli", "detect_changes", "--project", project], timeout)
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


def snapshot_repo(repo_in):
    root = git_toplevel(repo_in)
    if not root:
        return None, "repo-not-found"
    head = git_head(root)
    if not head:
        return {"root": root, "head": None}, "head-unknown"
    diff_bytes, derr = git_diff_binary(root)
    if derr:
        return {"root": root, "head": head}, derr
    ufiles, lerr = git_untracked_files(root)
    if lerr:
        return {"root": root, "head": head}, lerr
    try:
        fp = fingerprint_state(root, head, diff_bytes, ufiles)
    except Exception:
        return {"root": root, "head": head}, "fingerprint-failed"
    dirty, untracked, gerr = git_status_lists(root)
    if gerr:
        return {"root": root, "head": head}, gerr
    return {"root": root, "head": head, "fingerprint": fp,
            "dirty": bool(dirty or untracked),
            "dirty_count": len(dirty), "untracked_count": len(untracked)}, None


def cmd_begin(args):
    parsed, perr = parse_index_args(args.args_json)
    if perr:
        eprint(f"[cbm-freshness] begin: {perr}")
        return 2
    project = args.project or parsed["project"] or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    snap, serr = snapshot_repo(parsed["repo_path"])
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
    snap_after, serr = snapshot_repo(parsed["repo_path"])
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
