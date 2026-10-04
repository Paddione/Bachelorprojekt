#!/usr/bin/env python3
"""Pure utilities for cbm-freshness.py (T002430 split; S1 budget relief).

No CLI surface of its own — everything here is import-only and side-effect
free except atomic file writes through atomic_write_json()."""

import hashlib
import json
import os
import subprocess
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
