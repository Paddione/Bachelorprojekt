#!/usr/bin/env python3
"""cbm-freshness-state.py — repo-state layer for the K3 freshness probe (T900993).

Split out of cbm-freshness.py (S1 filesize gate): process runner, git
snapshot helpers (toplevel/head/upstream/status/diff/untracked), the
state fingerprint, receipt-path helpers' consumer snapshot_repo, and the
script-checkout default. Pure stdlib, no project imports — raises only
stdlib exceptions, so no shared-exception plumbing is needed. The CLI
(cmd_status/cmd_begin/cmd_finish) stays in cbm-freshness.py, which loads
this module via a sys.modules-pinned sibling loader and re-exports the
helpers consumed by tests (git_toplevel, git_head, git_diff_binary,
git_untracked_files, fingerprint_state).
"""

import hashlib
import os
import stat as statmod
import subprocess
from pathlib import Path

GIT_TIMEOUT_S = 15


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


def git_common_dir(repo):
    """Absolute common git dir of the repo (main checkout's .git for
    worktrees). T002430: the graph tool canonicalizes worktree repo roots to
    the main checkout, so identity checks must accept the common-dir root."""
    rc, out, _err, to, missing = run_bytes(
        ["git", "-C", repo, "rev-parse", "--path-format=absolute",
         "--git-common-dir"], timeout=GIT_TIMEOUT_S)
    if missing or to or rc != 0:
        return None
    raw = out.decode("utf-8", "surrogateescape").strip()
    if not raw:
        return None
    p = Path(raw)
    if p.name == ".git":
        p = p.parent
    try:
        return os.path.realpath(str(p))
    except Exception:
        return str(p)



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

