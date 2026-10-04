#!/usr/bin/env python3
"""cbm-embed-sync.py — receipt-keyed incremental embedding sync (K3 symbol layer).

Ticket T900993 (plan k3-embed-store-rerank task 4). Pulls candidates from the
K3 graph (codebase-memory-mcp query_graph: Route nodes + docstring-bearing
Function nodes), diffs them against the content-hash-keyed store
(cbm-embed-store.py), embeds only the deltas via the LLM gateway, and stamps
the manifest with the current cbm-freshness receipt id.

Drift contract (fail-closed): sync refuses to run when the freshness verdict
is not "fresh" unless --allow-stale is passed explicitly. The manifest binds
the vectors to that receipt, so they can never silently drift from the graph
(defect D8 arc, #6234/#6235).

Subcommands:
    status  — store coverage vs current candidates (graph queries only,
              no embed-gateway network)
    sync    — full incremental sync (embeds deltas via LLM_EMBED_URL)

The embed pod transiently returns HTTP 401 (observed 2026-10-04) — every
gateway call retries 4 times with backoff. Stdlib only.
"""

import argparse
import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SCHEMA_VERSION = "k3-embed-sync/1"
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"
DEFAULT_EMBED_URL = "http://localhost:8081/v1/embeddings"
DEFAULT_MODEL = "bge-m3"
DEFAULT_TIMEOUT_S = 60
EMBED_TIMEOUT_S = 300
EMBED_ATTEMPTS = 4
EMBED_BACKOFF_S = (2, 5, 10)
EMBED_BATCH = 16
DOCSTRING_MAX = 1500
GIT_TIMEOUT_S = 15
ROUTE_SYMBOL_FALLBACK = "ANY"

_HERE = os.path.dirname(os.path.abspath(__file__))


class SyncError(Exception):
    """Raised on any fail-closed condition — CLI maps it to exit 1."""


def eprint(msg):
    print(msg, file=sys.stderr)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_store_module():
    import importlib.util
    path = os.path.join(_HERE, "cbm-embed-store.py")
    spec = importlib.util.spec_from_file_location("cbm_embed_store", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


STORE = load_store_module()
content_hash = STORE.content_hash
make_key = STORE.make_key
identity_of = STORE.identity_of
artifact_path = STORE.artifact_path
manifest_path = STORE.manifest_path


# ── pure candidate/plan layer (no network, no IO — spec-tested) ────────────

def route_text(path, method):
    """Embedding input for a Route candidate."""
    verb = method if isinstance(method, str) and method.strip() \
        else ROUTE_SYMBOL_FALLBACK
    return "ROUTE %s %s" % (verb.strip(), path)


def function_text(qname, docstring):
    """Embedding input for a Function candidate: qualified name + docstring."""
    doc = docstring if isinstance(docstring, str) else ""
    return "%s\n%s" % (qname, doc[:DOCSTRING_MAX])


def build_candidates(route_rows, function_rows, repo, commit):
    """Deterministic candidate list from parsed graph rows.

    route_rows:     (method, file_path) pairs
    function_rows:  (qualified_name, file_path, docstring) triples
    Keys follow the frozen-corpus scheme repo@commit:path:symbol; routes use
    the HTTP verb as symbol, functions the qualified name."""
    cands = {}
    for method, path in route_rows:
        if not path or not isinstance(path, str):
            continue
        symbol = method if isinstance(method, str) and method.strip() \
            else ROUTE_SYMBOL_FALLBACK
        key = make_key(repo, commit, path, symbol)
        cands[key] = {"key": key, "kind": "route", "path": path,
                      "symbol": symbol, "text": route_text(path, method)}
    for qname, path, doc in function_rows:
        if not qname or not path:
            continue
        key = make_key(repo, commit, path, qname)
        if key in cands:
            continue
        cands[key] = {"key": key, "kind": "function", "path": path,
                      "symbol": qname, "text": function_text(qname, doc)}
    return sorted(cands.values(), key=lambda c: (c["path"], c["symbol"]))


def plan_sync(candidates, store, model):
    """Pure sync plan over (candidate texts, store contents).

    Returns {"to_embed": [{"key","text"}...], "unchanged": [key...],
             "to_prune": [store key...]} — deterministic, no network, no IO.
    Embedding is keyed by content hash over (model, exact input text): a
    model bump re-embeds everything by construction."""
    hashes = {c["key"]: content_hash(model, c["text"]) for c in candidates}
    diff = STORE.diff_by_hash(hashes, store)
    text_by_key = {c["key"]: c["text"] for c in candidates}
    return {
        "to_embed": [{"key": k, "text": text_by_key[k]}
                     for k in diff["to_embed"]],
        "unchanged": diff["unchanged"],
        "to_prune": diff["to_prune"],
    }


def apply_plan(candidates, store, model, vectors_by_key):
    """Pure: the post-sync store — candidate keys roll forward to the current
    commit; unchanged candidates reuse the stored vector, deltas get the
    freshly embedded one. Keys absent from the candidates are dropped."""
    by_identity = {identity_of(k): rec for k, rec in store.items()}
    hashes = {c["key"]: content_hash(model, c["text"]) for c in candidates}
    out = {}
    for cand in candidates:
        key = cand["key"]
        ident = identity_of(key)
        old = by_identity.get(ident)
        if old is not None and old.get("hash") == hashes[key]:
            rec = {"hash": old["hash"], "model": old["model"],
                   "dim": old["dim"], "vector": old["vector"]}
        else:
            vec = vectors_by_key.get(key)
            if vec is None:
                raise SyncError("missing-vector:%s" % key)
            rec = {"hash": hashes[key], "model": model,
                   "dim": len(vec), "vector": list(vec)}
        out[key] = rec
    return out


def check_manifest(manifest):
    """Fail-closed gate: a manifest without a receipt id (or otherwise
    malformed) must never pass — the sync cannot bind vectors to graph state
    without it."""
    STORE.validate_manifest(manifest)


def guard_stale(freshness_status, allow_stale):
    """Drift contract: refuse to run unless the graph is fresh."""
    if allow_stale:
        return
    if freshness_status != "fresh":
        raise SyncError(
            "freshness-not-fresh:%s — pass --allow-stale to override "
            "(vectors would drift from the graph)" % freshness_status)


# ── graph access (codebase-memory-mcp CLI) ─────────────────────────────────

ROUTE_QUERY = ("MATCH (r:Route) WHERE r.file_path IS NOT NULL "
               "RETURN r.method AS method, r.file_path AS path")
FUNCTION_QUERY = ("MATCH (f:Function) WHERE f.docstring IS NOT NULL "
                  "AND f.file_path IS NOT NULL "
                  "RETURN f.qualified_name AS qname, f.file_path AS path, "
                  "f.docstring AS doc")


def run_cli_json(cmd, timeout):
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise SyncError("cli-timeout:%s" % cmd[0])
    except FileNotFoundError:
        raise SyncError("cli-missing:%s" % cmd[0])
    except OSError as exc:
        raise SyncError("cli-failed:%s" % exc)
    stdout = p.stdout.decode("utf-8", "surrogateescape")
    if p.returncode != 0:
        raise SyncError("cli-exit-%d:%s" % (p.returncode, cmd[0]))
    try:
        data = json.loads(stdout) if stdout.strip() else None
    except json.JSONDecodeError:
        raise SyncError("cli-malformed-json:%s" % cmd[0])
    if not isinstance(data, dict):
        raise SyncError("cli-envelope-malformed:%s" % cmd[0])
    return data


def envelope_text(data):
    content = data.get("content")
    if not isinstance(content, list):
        return None
    parts = [item.get("text", "") for item in content
             if isinstance(item, dict) and item.get("type") == "text"]
    return "\n".join(parts) if parts else None


def _strip_quotes(value):
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1]
    return value


def graph_rows(text, ncols):
    """Parse query_graph table rows: lines indented by exactly two spaces
    between 'rows:' and 'total:'. First ncols-1 columns are single tokens;
    the last column takes the remainder (quote-stripped). '-' -> None."""
    rows = []
    if not isinstance(text, str):
        return rows
    in_rows = False
    for line in text.splitlines():
        if line.startswith("rows:"):
            in_rows = True
            continue
        if in_rows and line.startswith("total:"):
            break
        if not in_rows or not line.startswith("  ") or line.startswith("   "):
            continue
        parts = line.strip().split(None, ncols - 1)
        if len(parts) < ncols:
            continue
        parsed = [None if p == "-" else _strip_quotes(p) for p in parts[:-1]]
        last = parts[-1] if parts else ""
        parsed.append(None if last == "-" else _strip_quotes(last))
        rows.append(tuple(parsed))
    return rows


def fetch_route_rows(project, timeout):
    data = run_cli_json(["codebase-memory-mcp", "cli", "--json", "query_graph",
                         "--project", project, "--query", ROUTE_QUERY], timeout)
    return graph_rows(envelope_text(data) or "", 2)


def fetch_function_rows(project, timeout):
    data = run_cli_json(["codebase-memory-mcp", "cli", "--json", "query_graph",
                         "--project", project, "--query", FUNCTION_QUERY],
                        timeout)
    rows = graph_rows(envelope_text(data) or "", 3)
    return [(q, p, d) for q, p, d in rows if d]


def git_toplevel(repo):
    p = subprocess.run(["git", "-C", repo, "rev-parse", "--show-toplevel"],
                       capture_output=True, timeout=GIT_TIMEOUT_S)
    if p.returncode != 0:
        raise SyncError("repo-not-found:%s" % repo)
    return os.path.realpath(p.stdout.decode("utf-8", "surrogateescape").strip())


def git_head(root):
    p = subprocess.run(["git", "-C", root, "rev-parse", "HEAD"],
                       capture_output=True, timeout=GIT_TIMEOUT_S)
    if p.returncode != 0:
        raise SyncError("head-unknown:%s" % root)
    return p.stdout.decode("utf-8", "surrogateescape").strip()


# ── freshness receipts (drift contract) ────────────────────────────────────

def freshness_state(repo, project, timeout):
    """(status, receipt) from cbm-freshness.py; any probe failure is
    'unknown' with receipt None — never guessed fresh."""
    script = os.path.join(_HERE, "cbm-freshness.py")
    try:
        p = subprocess.run(
            [sys.executable, script, "status", "--repo", repo,
             "--project", project, "--timeout", str(timeout)],
            capture_output=True, timeout=timeout + 10)
        data = json.loads(p.stdout.decode("utf-8", "surrogateescape")) \
            if p.stdout.strip() else None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        data = None
    if not isinstance(data, dict) or "status" not in data:
        return "unknown", None
    receipt = data.get("receipt") if isinstance(data.get("receipt"), dict) \
        else None
    return data.get("status", "unknown"), receipt


def corpus_sha256(candidates):
    """Deterministic hash over the ordered candidate corpus (key\\0text)."""
    import hashlib
    blob = "\n".join("%s\x00%s" % (c["key"], c["text"]) for c in candidates)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ── embed gateway (thin wrapper around the pure layer) ─────────────────────

def normalize_embed_url(url):
    url = (url or "").rstrip("/")
    if url.endswith("/v1/embeddings"):
        return url
    if url.endswith("/v1"):
        return url + "/embeddings"
    return url + "/v1/embeddings"


def embed_batch(texts, url, model, timeout):
    body = json.dumps({"model": model, "input": list(texts)}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"})
    last = None
    for attempt in range(EMBED_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.load(resp)
            if not isinstance(data, dict) or not isinstance(data.get("data"), list):
                raise SyncError("embed-envelope-malformed")
            vecs = [None] * len(data["data"])
            for item in data["data"]:
                idx = item.get("index")
                if isinstance(idx, int) and 0 <= idx < len(vecs):
                    vecs[idx] = item.get("embedding")
            if any(v is None for v in vecs):
                raise SyncError("embed-index-gaps")
            return vecs
        except SyncError:
            raise
        except Exception as exc:  # transient 401/503/disconnect — retry
            last = exc
            if attempt < EMBED_ATTEMPTS - 1:
                delay = EMBED_BACKOFF_S[min(attempt, len(EMBED_BACKOFF_S) - 1)]
                eprint("  embed retry %d/%d in %ds: %r"
                       % (attempt + 1, EMBED_ATTEMPTS, delay, exc))
                time.sleep(delay)
    raise SyncError("embed-failed-after-%d-attempts:%r"
                    % (EMBED_ATTEMPTS, last))


def embed_texts(texts, url, model, timeout=EMBED_TIMEOUT_S, log=None):
    """Embed texts in batches; returns one vector per input, input order."""
    endpoint = normalize_embed_url(url)
    vecs = []
    for i in range(0, len(texts), EMBED_BATCH):
        chunk = texts[i:i + EMBED_BATCH]
        vecs.extend(embed_batch(chunk, endpoint, model, timeout))
        if log:
            log("  embedded %d/%d" % (min(i + EMBED_BATCH, len(texts)),
                                      len(texts)))
    return vecs


# ── CLI ────────────────────────────────────────────────────────────────────

def resolve(args):
    repo_in = args.repo or os.getcwd()
    root = git_toplevel(repo_in)
    head = git_head(root)
    return root, head


def collect_candidates(args, root, head):
    repo_name = os.path.basename(root)
    route_rows = fetch_route_rows(args.project, args.timeout)
    function_rows = fetch_function_rows(args.project, args.timeout)
    return build_candidates(route_rows, function_rows, repo_name, head)


def cmd_status(args):
    root, head = resolve(args)
    status, receipt = freshness_state(root, args.project, args.timeout)
    candidates = collect_candidates(args, root, head)
    store = STORE.load_artifact(artifact_path(root))
    try:
        manifest = STORE.load_manifest(manifest_path(root))
    except STORE.EmbedStoreError as exc:
        manifest = {"error": str(exc)}
    plan = plan_sync(candidates, store, args.model)
    out = {
        "schema_version": SCHEMA_VERSION,
        "repo": {"root": root, "head": head},
        "project": args.project,
        "model": args.model,
        "freshness": {"status": status,
                      "receipt_id": (receipt or {}).get("timestamp")},
        "candidates": len(candidates),
        "store": {"vectors": len(store), "manifest": manifest},
        "plan": {"to_embed": len(plan["to_embed"]),
                 "unchanged": len(plan["unchanged"]),
                 "to_prune": len(plan["to_prune"])},
        "model_mismatch": bool(isinstance(manifest, dict)
                               and "model" in manifest
                               and manifest["model"] != args.model),
        "receipt_drift": bool(isinstance(manifest, dict)
                              and "receipt_id" in manifest
                              and manifest["receipt_id"]
                              != (receipt or {}).get("timestamp")),
        "generated_at": utc_now_iso(),
    }
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0


def cmd_sync(args):
    root, head = resolve(args)
    status, receipt = freshness_state(root, args.project, args.timeout)
    guard_stale(status, args.allow_stale)
    receipt_id = (receipt or {}).get("timestamp")
    candidates = collect_candidates(args, root, head)
    store = STORE.load_artifact(artifact_path(root))
    plan = plan_sync(candidates, store, args.model)

    vectors_by_key = {}
    if plan["to_embed"]:
        texts = [e["text"] for e in plan["to_embed"]]
        keys = [e["key"] for e in plan["to_embed"]]
        vecs = embed_texts(texts, args.embed_url, args.model,
                           log=lambda m: eprint(m))
        if len(set(len(v) for v in vecs)) > 1:
            raise SyncError("embed-inconsistent-dims")
        vectors_by_key = dict(zip(keys, vecs))
    new_store = apply_plan(candidates, store, args.model, vectors_by_key)
    STORE.write_artifact(artifact_path(root), new_store)
    manifest = STORE.make_manifest(
        corpus_sha256=corpus_sha256(candidates),
        receipt_id=receipt_id,
        receipt_timestamp=receipt_id,
        model=args.model,
        dim=next(iter(new_store.values()))["dim"] if new_store else 0,
        vectors=len(new_store),
        head_sha=head,
        project=args.project,
        freshness_status=status,
        allow_stale=bool(args.allow_stale))
    check_manifest(manifest)
    STORE.write_manifest(manifest_path(root), manifest)
    out = {"schema_version": SCHEMA_VERSION,
           "repo": {"root": root, "head": head},
           "project": args.project,
           "model": args.model,
           "freshness": {"status": status, "receipt_id": receipt_id},
           "embedded": len(plan["to_embed"]),
           "unchanged": len(plan["unchanged"]),
           "pruned": len(plan["to_prune"]),
           "vectors": len(new_store),
           "corpus_sha256": manifest["corpus_sha256"],
           "manifest": manifest_path(root),
           "artifact": artifact_path(root),
           "generated_at": utc_now_iso()}
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=None,
                        help="checkout root (default: cwd)")
    parser.add_argument("--project", default=None,
                        help="graph project (default: $CBM_PROJECT or %s)"
                             % DEFAULT_PROJECT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    parser.add_argument("--embed-url", default=os.environ.get(
        "LLM_EMBED_URL", DEFAULT_EMBED_URL))
    parser.add_argument("--allow-stale", action="store_true",
                        help="override the freshness fail-closed guard")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="store coverage vs candidates, no embed net")
    sub.add_parser("sync", help="incremental embed sync (writes artifact)")
    args = parser.parse_args()
    if not args.project:
        args.project = os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    try:
        if args.command == "status":
            return cmd_status(args)
        if args.command == "sync":
            return cmd_sync(args)
    except SyncError as exc:
        eprint(json.dumps({"ok": False, "error": str(exc)}))
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
