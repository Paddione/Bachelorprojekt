#!/usr/bin/env python3
"""cbm-embed-sync.py — receipt-keyed incremental embedding sync (K3 symbol layer).

Ticket T900993 (plan k3-embed-store-rerank task 4, A2 full corpus). Pulls
candidates from the K3 graph (codebase-memory-mcp query_graph): Route nodes,
ALL Function nodes (with or without docstring), Method nodes, Class +
Interface nodes, and Section (markdown heading) nodes. Diffs them against the
content-hash-keyed store (cbm-embed-store.py), embeds only the deltas via the
LLM gateway, and stamps the manifest with the current cbm-freshness receipt
id.

Graph-property notes (schema inspected 2026-10-04, project
home-patrick-Bachelorprojekt):
  * Function/Method carry signature + docstring, but NO code/content prop —
    function/method texts embed name + signature + docstring (no code-start;
    unavailable in the graph). The Cypher dialect rejects coalesce() and '+'
    concatenation, and the table parser only supports ONE free-text column
    (last), so signature and docstring are fetched by separate queries and
    joined in Python on (qualified_name, file_path).
  * Class/Interface carry docstring + base_classes (no signature).
  * Section carries NO body text — only name, qualified_name (which encodes
    the document + heading-slug path), file_path, start/end_line. Section
    texts therefore embed the heading path + file location, not prose.
    The section symbol is `section:<qualified_name>#<start_line>` — the
    qualified_name is already unique per heading, the line disambiguates
    duplicate headings and survives heading renames differently.

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
SIG_MAX = 500
CODE_MAX = 800
TEXT_MAX = 1500
GIT_TIMEOUT_S = 15
ROUTE_SYMBOL_FALLBACK = "ANY"

# Path exclusions (coarse mirror of index_status not_indexed dirs, 2026-10-04,
# plus generated bundles). Segments match anywhere in the repo-relative path;
# root prefixes only at the repo root (branded copies under components/ keep
# their vectors). Minified/bundled JS carries no retrievable signal.
EXCLUDED_SUFFIXES = (".min.js", ".bundle.js")
EXCLUDED_SEGMENTS = (
    "node_modules", "dist", ".worktrees", "__pycache__", ".venv",
    ".git", ".codebase-memory", ".astro", ".ds-sync", "coverage",
    "unsloth_compiled_cache",
)
EXCLUDED_ROOT_PREFIXES = (
    "assets/", "tmp/", ".output/", "dotfiles/",
    "docs/mermaid-snapshots/", "tests/results/", "tests/e2e/.auth",
    ".lighthouseci/", ".vscode/", ".claude/", ".pi/",
)

_HERE = os.path.dirname(os.path.abspath(__file__))


def eprint(msg):
    print(msg, file=sys.stderr)


def _load_sibling(mod_name, filename):
    """Load a sibling helper module once per process (sys.modules-pinned,
    so shared names like SyncError keep a single identity no matter which
    entry module loaded first)."""
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    import importlib.util
    path = os.path.join(_HERE, filename)
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


# Graph-access layer (queries, fetch_*, freshness probe, corpus hash) lives
# in cbm-sync-graph.py (S1 split). Re-exported so existing importers
# (tests, cbm-graph-rerank.py) keep working: SYNC.SyncError, SYNC.eprint,
# SYNC.run_cli_json, SYNC.envelope_text, SYNC.graph_rows.
GRAPH = _load_sibling("cbm_sync_graph", "cbm-sync-graph.py")
SyncError = GRAPH.SyncError
run_cli_json = GRAPH.run_cli_json
envelope_text = GRAPH.envelope_text
graph_rows = GRAPH.graph_rows


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


def function_text(qname, docstring, signature=None, code=None):
    """Embedding input for a Function candidate.

    Qualified name + optional signature + docstring + optional code-start,
    capped at TEXT_MAX total. With neither signature nor code the output is
    exactly the historic `qname + docstring[:DOCSTRING_MAX]` shape, so
    docstring-only callers are unaffected. `code` has no graph source today
    (Function nodes carry no content prop) and exists for forward use."""
    doc = docstring if isinstance(docstring, str) else ""
    if signature is None and code is None:
        return "%s\n%s" % (qname, doc[:DOCSTRING_MAX])
    header = qname
    if isinstance(signature, str) and signature.strip():
        header = "%s %s" % (qname, signature.strip()[:SIG_MAX])
    parts = [header]
    if doc:
        parts.append(doc[:DOCSTRING_MAX])
    if isinstance(code, str) and code:
        parts.append(code[:CODE_MAX])
    return "\n".join(parts)[:TEXT_MAX]


def method_text(qname, docstring, signature=None, parent=None):
    """Embedding input for a Method candidate: qualified name + signature,
    parent-class line for context, then docstring. Capped at TEXT_MAX."""
    header = qname
    if isinstance(signature, str) and signature.strip():
        header = "%s %s" % (qname, signature.strip()[:SIG_MAX])
    if isinstance(parent, str) and parent.strip():
        header = "%s\nclass %s" % (header, parent.strip())
    doc = docstring if isinstance(docstring, str) else ""
    parts = [header]
    if doc:
        parts.append(doc[:DOCSTRING_MAX])
    return "\n".join(parts)[:TEXT_MAX]


def class_text(qname, docstring, base=None, label="Class"):
    """Embedding input for a Class/Interface candidate: KIND + qualified
    name, base-class line, then docstring. Capped at TEXT_MAX. `base` is the
    raw base_classes rendering from the graph (a string or None)."""
    kind_word = "INTERFACE" if label == "Interface" else "CLASS"
    header = "%s %s" % (kind_word, qname)
    if base is not None and str(base).strip() and str(base).strip() != "-":
        header = "%s\nextends %s" % (header, str(base).strip()[:SIG_MAX])
    doc = docstring if isinstance(docstring, str) else ""
    parts = [header]
    if doc:
        parts.append(doc[:DOCSTRING_MAX])
    return "\n".join(parts)[:TEXT_MAX]


def section_symbol(qname, start_line):
    """Stable section symbol: `section:<qualified_name>#<start_line>`.

    The graph provides no section id or body text; the qualified_name already
    encodes the document + heading-slug path uniquely, and the start line
    disambiguates duplicate headings."""
    return "section:%s#%s" % (qname, start_line)


def section_text(qname, name, path, start_line, end_line):
    """Embedding input for a Section candidate: heading name + heading path
    (the qualified_name) + file location. The graph carries no section body,
    so this embeds structure, not prose. Capped at TEXT_MAX."""
    heading = name if isinstance(name, str) and name.strip() else qname
    loc = "%s:%s-%s" % (path, start_line, end_line)
    return ("SECTION %s\n%s\n%s" % (heading, qname, loc))[:TEXT_MAX]


def is_excluded(path):
    """True when a repo-relative path must not enter the embed corpus."""
    if not isinstance(path, str) or not path:
        return True
    if path.startswith("<"):
        return True  # phantom graph paths, e.g. <python-builtins>
    p = path.replace("\\", "/").strip("/")
    if p.endswith(EXCLUDED_SUFFIXES):
        return True
    if p == "assets" or p.startswith("assets/"):
        return True
    for prefix in EXCLUDED_ROOT_PREFIXES:
        if p == prefix.rstrip("/") or p.startswith(prefix):
            return True
    segments = set(p.split("/"))
    return any(seg in segments for seg in EXCLUDED_SEGMENTS)


def build_candidates(route_rows, function_rows, repo, commit,
                     method_rows=(), class_rows=(), section_rows=()):
    """Deterministic candidate list from parsed graph rows.

    route_rows:     (method, file_path) pairs
    function_rows:  (qualified_name, file_path, docstring[, signature])
    method_rows:    (qualified_name, file_path, docstring[, signature[,
                    parent_class]])
    class_rows:    (qualified_name, file_path, docstring[, base_classes[,
                    label]]) — label "Class" (default) or "Interface"
    section_rows:   (qualified_name, file_path, start_line, end_line, name)
                    in graph-column order (free-text name last)
    Keys follow the frozen-corpus scheme repo@commit:path:symbol; routes use
    the HTTP verb as symbol, functions/methods the qualified name, classes
    the qualified name, sections `section:<qname>#<line>`. Excluded paths
    (minified bundles, root assets/, vendor/build dirs) are skipped."""
    cands = {}

    def add(kind, path, symbol, text):
        if not path or not symbol or is_excluded(path):
            return
        key = make_key(repo, commit, path, symbol)
        if key in cands:
            return
        cands[key] = {"key": key, "kind": kind, "path": path,
                      "symbol": symbol, "text": text}

    for method, path in route_rows:
        if not path or not isinstance(path, str):
            continue
        symbol = method if isinstance(method, str) and method.strip() \
            else ROUTE_SYMBOL_FALLBACK
        add("route", path, symbol, route_text(path, method))
    for row in function_rows:
        qname, path, doc = row[0], row[1], row[2] if len(row) > 2 else None
        sig = row[3] if len(row) > 3 else None
        if not qname or not path:
            continue
        add("function", path, qname, function_text(qname, doc, sig))
    for row in method_rows or ():
        qname, path = row[0], row[1]
        doc = row[2] if len(row) > 2 else None
        sig = row[3] if len(row) > 3 else None
        parent = row[4] if len(row) > 4 else None
        if not qname or not path:
            continue
        add("method", path, qname, method_text(qname, doc, sig, parent))
    for row in class_rows or ():
        qname, path = row[0], row[1]
        doc = row[2] if len(row) > 2 else None
        base = row[3] if len(row) > 3 else None
        label = row[4] if len(row) > 4 else "Class"
        if not qname or not path:
            continue
        kind = "interface" if label == "Interface" else "class"
        add(kind, path, qname, class_text(qname, doc, base, label))
    for row in section_rows or ():
        qname, path, start_line, end_line, name = row
        if not qname or not path:
            continue
        symbol = section_symbol(qname, start_line)
        add("section", path, symbol,
            section_text(qname, name, path, start_line, end_line))
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


# Graph-access layer (queries, fetch_*, table parsing) lives in
# cbm-sync-graph.py — loaded as GRAPH above (S1 filesize split).


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


# freshness_state/corpus_sha256 live in cbm-sync-graph.py (S1 split).



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


def embed_texts(texts, url_or_urls, model, timeout=EMBED_TIMEOUT_S, log=None,
                on_batch=None):
    """Embed texts in batches; returns one vector per input, input order.

    url_or_urls: one endpoint string or a list (fan-out for bulk loads:
    every idle box running llama-server --embeddings — spare CPU RAM or
    VRAM — can join as an extra endpoint; batches shard round-robin,
    results re-assemble in input order). A single endpoint preserves the
    exact legacy sequential behavior. on_batch(pairs) fires after every
    completed batch with [(text_index, vector)] — used for checkpointing."""
    if isinstance(url_or_urls, (list, tuple)):
        urls = [normalize_embed_url(u) for u in url_or_urls if u]
    else:
        urls = [normalize_embed_url(url_or_urls)]
    if not urls:
        raise SyncError("embed-no-endpoints")
    chunks = [texts[i:i + EMBED_BATCH]
              for i in range(0, len(texts), EMBED_BATCH)]
    assignment = shard_batches(len(chunks), urls)
    vecs_by_idx = [None] * len(chunks)
    done = [0]

    def finish(idx, vecs):
        vecs_by_idx[idx] = vecs
        done[0] += len(vecs)
        if log:
            log("  embedded %d/%d" % (done[0], len(texts)))
        if on_batch:
            base = idx * EMBED_BATCH
            on_batch([(base + j, v) for j, v in enumerate(vecs)])

    if len(urls) == 1:
        for idx, chunk in enumerate(chunks):
            finish(idx, embed_batch(chunk, urls[0], model, timeout))
    else:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=len(urls),
                               thread_name_prefix="embed-fanout") as ex:
            futs = {ex.submit(embed_batch, chunk, url, model, timeout): idx
                    for idx, (chunk, url) in enumerate(zip(chunks,
                                                           assignment))}
            for fut in as_completed(futs):
                finish(futs[fut], fut.result())
    out = []
    for vecs in vecs_by_idx:
        out.extend(vecs)
    return out


def shard_batches(n_chunks, urls):
    """Pure: round-robin endpoint assignment per batch index.

    Heterogeneous helpers (a 2-thread CPU pod next to a full-VRAM GPU box)
    finish at different rates; chunks are uniform (EMBED_BATCH texts), so
    static sharding stays fair and order re-assembly stays trivial."""
    if not urls:
        raise SyncError("embed-no-endpoints")
    return [urls[i % len(urls)] for i in range(n_chunks)]


def merge_pairs(store, pairs, model):
    """Pure: fold freshly embedded (key, text, vector) triples into a copy
    of the store — the checkpoint primitive. Untouched keys keep their
    stored record; nothing is pruned or rekeyed (unlike apply_plan, which
    finalizes the whole corpus). A resumed sync reloads this artifact and
    embeds only what is still missing."""
    out = dict(store)
    for key, text, vec in pairs:
        out[key] = {"hash": content_hash(model, text), "model": model,
                    "dim": len(vec), "vector": list(vec)}
    return out


def resolve_embed_urls(args):
    """Precedence: --embed-urls (comma-separated) > $LLM_EMBED_URLS >
    --embed-url / $LLM_EMBED_URL (legacy single)."""
    raw = getattr(args, "embed_urls", None)
    if not raw:
        raw = os.environ.get("LLM_EMBED_URLS", "")
    urls = [u.strip() for u in (raw or "").split(",") if u.strip()]
    if urls:
        return urls
    return [args.embed_url]


# ── CLI ────────────────────────────────────────────────────────────────────

def resolve(args):
    repo_in = args.repo or os.getcwd()
    root = git_toplevel(repo_in)
    head = git_head(root)
    return root, head


def collect_candidates(args, root, head):
    repo_name = args.repo_name or os.path.basename(root)
    route_rows = GRAPH.fetch_route_rows(args.project, args.timeout)
    function_rows = GRAPH.fetch_function_full_rows(args.project, args.timeout)
    method_rows = GRAPH.fetch_method_rows(args.project, args.timeout)
    class_rows = GRAPH.fetch_class_like_rows(args.project, args.timeout, "Class")
    class_rows += GRAPH.fetch_class_like_rows(args.project, args.timeout,
                                        "Interface")
    section_rows = GRAPH.fetch_section_rows(args.project, args.timeout)
    return build_candidates(route_rows, function_rows, repo_name, head,
                             method_rows, class_rows, section_rows)


def kind_breakdown(candidates):
    counts = {}
    for c in candidates:
        counts[c["kind"]] = counts.get(c["kind"], 0) + 1
    return counts


def cmd_status(args):
    root, head = resolve(args)
    status, receipt = GRAPH.freshness_state(root, args.project, args.timeout)
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
        "candidate_kinds": kind_breakdown(candidates),
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
    status, receipt = GRAPH.freshness_state(root, args.project, args.timeout)
    guard_stale(status, args.allow_stale)
    receipt_id = (receipt or {}).get("timestamp")
    candidates = collect_candidates(args, root, head)
    store = STORE.load_artifact(artifact_path(root))
    plan = plan_sync(candidates, store, args.model)

    vectors_by_key = {}
    if plan["to_embed"]:
        texts = [e["text"] for e in plan["to_embed"]]
        keys = [e["key"] for e in plan["to_embed"]]
        text_by_key = dict(zip(keys, texts))
        urls = resolve_embed_urls(args)
        interim = dict(store)
        pending = [0]

        def on_batch(pairs):
            for idx, vec in pairs:
                key = keys[idx]
                vectors_by_key[key] = vec
            if args.checkpoint_every and args.checkpoint_every > 0:
                pending[0] += len(pairs)
                if pending[0] >= args.checkpoint_every:
                    pending[0] = 0
                    fresh = [(keys[i], text_by_key[keys[i]], vectors_by_key[keys[i]])
                             for i, _ in pairs]
                    for key, text, vec in fresh:
                        interim[key] = {
                            "hash": content_hash(args.model, text),
                            "model": args.model, "dim": len(vec),
                            "vector": list(vec)}
                    STORE.write_artifact(artifact_path(root), interim)
                    cp_manifest = STORE.make_manifest(
                        corpus_sha256=GRAPH.corpus_sha256(candidates),
                        receipt_id=receipt_id,
                        receipt_timestamp=receipt_id,
                        model=args.model,
                        dim=next(iter(interim.values()))["dim"],
                        vectors=len(interim),
                        head_sha=head,
                        project=args.project,
                        freshness_status=status,
                        allow_stale=bool(args.allow_stale),
                        checkpoint=True,
                        embedded_so_far=len(vectors_by_key),
                        to_embed_total=len(plan["to_embed"]))
                    STORE.write_manifest(manifest_path(root), cp_manifest)
                    eprint("  checkpoint %d/%d" % (len(vectors_by_key),
                                                   len(plan["to_embed"])))

        vecs = embed_texts(texts, urls, args.model,
                           log=lambda m: eprint(m), on_batch=on_batch)
        if len(set(len(v) for v in vecs)) > 1:
            raise SyncError("embed-inconsistent-dims")
        vectors_by_key = dict(zip(keys, vecs))
    new_store = apply_plan(candidates, store, args.model, vectors_by_key)
    STORE.write_artifact(artifact_path(root), new_store)
    manifest = STORE.make_manifest(
        corpus_sha256=GRAPH.corpus_sha256(candidates),
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
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo", default=None,
                        help="checkout root (default: cwd)")
    common.add_argument("--repo-name", default=None,
                        help="repo part of store keys (default: basename of "
                             "the checkout root; worktrees should pass the "
                             "canonical name, e.g. Bachelorprojekt)")
    common.add_argument("--project", default=None,
                        help="graph project (default: $CBM_PROJECT or %s)"
                             % DEFAULT_PROJECT)
    common.add_argument("--model", default=DEFAULT_MODEL)
    common.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    common.add_argument("--embed-url", default=os.environ.get(
        "LLM_EMBED_URL", DEFAULT_EMBED_URL))
    common.add_argument("--embed-urls", default=None,
                        help="comma-separated embedding endpoints for bulk "
                             "fan-out (default: $LLM_EMBED_URLS, else "
                             "--embed-url). Every idle box running "
                             "llama-server --embeddings — spare CPU RAM or "
                             "VRAM — can join; batches shard round-robin.")
    common.add_argument("--checkpoint-every", type=int, default=160,
                        help="write artifact+manifest every N embedded texts "
                             "(0 disables). A killed run resumes where it "
                             "stopped instead of losing hours.")
    common.add_argument("--allow-stale", action="store_true",
                        help="override the freshness fail-closed guard")
    parser = argparse.ArgumentParser(description=__doc__, parents=[common])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="store coverage vs candidates, no embed net",
                   parents=[common])
    sub.add_parser("sync", help="incremental embed sync (writes artifact)",
                   parents=[common])
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
