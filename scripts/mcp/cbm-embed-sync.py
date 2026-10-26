#!/usr/bin/env python3
"""cbm-embed-sync.py — receipt-keyed incremental embedding sync (K3 symbol layer).

Ticket T900993 (plan k3-embed-store-rerank task 4, A2 full corpus). Pulls
candidates from the K3 graph (codebase-memory-mcp query_graph): Route nodes,
ALL Function nodes (with or without docstring), Method nodes, Class +
Interface nodes, and Section (markdown heading) nodes. Diffs them against the
content-hash-keyed store (cbm-embed-store.py), embeds only the deltas via the
LLM gateway, and stamps the manifest with the current cbm-freshness receipt
id.

Graph-property notes (schema inspected 2026-10-04, spans verified live;
project home-patrick-Bachelorprojekt):
  * Function/Method/Class/Interface/Section nodes carry file_path +
    start_line/end_line but NO code/content prop. Embedding inputs are
    therefore enriched from the checkout by enrich_candidates_with_source:
    functions/methods gain a bounded code-start excerpt, classes the
    class-body start, sections the markdown prose inside the heading span.
    Pass --no-source-body to restore the legacy name + signature +
    docstring-only texts (ablation baseline).
  * The Cypher dialect rejects coalesce() and '+' concatenation, and the
    table parser only supports ONE free-text column (last), so signature
    and docstring travel in separate queries and are joined in Python on
    (qualified_name, file_path, start_line) — the span disambiguates
    overloads sharing a qualified name.
  * Class/Interface carry docstring + base_classes (no signature).
  * The section symbol is `section:<qualified_name>#<start_line>` — the
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
DEFAULT_EMBED_URL = "http://127.0.0.1:8095/v1/embeddings"
DEFAULT_MODEL = "bge-m3"
DEFAULT_TIMEOUT_S = 60
EMBED_TIMEOUT_S = 300
EMBED_ATTEMPTS = 4
EMBED_BACKOFF_S = (2, 5, 10)
EMBED_BATCH = 16
DOCSTRING_MAX = 1500
SIG_MAX = 500
CODE_MAX = 800
SECTION_BODY_MAX = 1200
BODY_LINES = 60
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

CLIENT = _load_sibling("cbm_embed_client", "cbm-embed-client.py")
CLIENT.SyncError = SyncError
normalize_embed_url = CLIENT.normalize_embed_url
probe_url_live = CLIENT.probe_url_live
resolve_embed_urls = CLIENT.resolve_embed_urls
select_live_urls = CLIENT.select_live_urls
shard_batches = CLIENT.shard_batches
DEFAULT_EMBED_URL = CLIENT.DEFAULT_EMBED_URL
FALLBACK_EMBED_URLS = CLIENT.FALLBACK_EMBED_URLS


def embed_batch(texts, url, model, timeout):
    return CLIENT.embed_batch(texts, url, model, timeout)


def embed_texts(texts, url_or_urls, model, timeout=EMBED_TIMEOUT_S, log=None,
                on_batch=None):
    return CLIENT.embed_texts(
        texts, url_or_urls, model, timeout=timeout, log=log,
        on_batch=on_batch, batch_fn=embed_batch, batch_size=EMBED_BATCH)

ENRICH = _load_sibling("cbm_embed_enrich", "cbm-embed-enrich.py")
parse_span = ENRICH.parse_span
read_source_slice = ENRICH.read_source_slice


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

def route_text(path, method, body=None):
    """Embedding input for a Route candidate: verb + file path, then an
    optional handler-body excerpt. None keeps the historic shape."""
    verb = method if isinstance(method, str) and method.strip() \
        else ROUTE_SYMBOL_FALLBACK
    text = "ROUTE %s %s" % (verb.strip(), path)
    if isinstance(body, str) and body:
        text = "%s\n%s" % (text, body[:CODE_MAX])
    return text[:TEXT_MAX]


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


def method_text(qname, docstring, signature=None, parent=None, code=None):
    """Embedding input for a Method candidate: qualified name + signature,
    parent-class line for context, then docstring, then an optional
    source-body excerpt. Capped at TEXT_MAX. `code` has no graph source
    (Method nodes carry no content prop) and is filled from the checkout
    by enrich_candidates_with_source; None keeps the historic shape."""
    header = qname
    if isinstance(signature, str) and signature.strip():
        header = "%s %s" % (qname, signature.strip()[:SIG_MAX])
    if isinstance(parent, str) and parent.strip():
        header = "%s\nclass %s" % (header, parent.strip())
    doc = docstring if isinstance(docstring, str) else ""
    parts = [header]
    if doc:
        parts.append(doc[:DOCSTRING_MAX])
    if isinstance(code, str) and code:
        parts.append(code[:CODE_MAX])
    return "\n".join(parts)[:TEXT_MAX]


def class_text(qname, docstring, base=None, label="Class", body=None):
    """Embedding input for a Class/Interface candidate: KIND + qualified
    name, base-class line, then docstring, then an optional source-body
    excerpt. Capped at TEXT_MAX. `base` is the raw base_classes rendering
    from the graph (a string or None); `body` comes from the checkout."""
    kind_word = "INTERFACE" if label == "Interface" else "CLASS"
    header = "%s %s" % (kind_word, qname)
    if base is not None and str(base).strip() and str(base).strip() != "-":
        header = "%s\nextends %s" % (header, str(base).strip()[:SIG_MAX])
    doc = docstring if isinstance(docstring, str) else ""
    parts = [header]
    if doc:
        parts.append(doc[:DOCSTRING_MAX])
    if isinstance(body, str) and body:
        parts.append(body[:CODE_MAX])
    return "\n".join(parts)[:TEXT_MAX]


def section_symbol(qname, start_line):
    """Stable section symbol: `section:<qualified_name>#<start_line>`.

    The graph provides no section id or body text; the qualified_name already
    encodes the document + heading-slug path uniquely, and the start line
    disambiguates duplicate headings."""
    return "section:%s#%s" % (qname, start_line)


def section_text(qname, name, path, start_line, end_line, body=None):
    """Embedding input for a Section candidate: heading name + heading path
    (the qualified_name) + file location, then an optional prose excerpt.
    The graph carries no section body, so prose is filled from the checkout
    by enrich_candidates_with_source; None keeps the historic
    structure-only shape. Capped at TEXT_MAX."""
    heading = name if isinstance(name, str) and name.strip() else qname
    loc = "%s:%s-%s" % (path, start_line, end_line)
    parts = ["SECTION %s\n%s\n%s" % (heading, qname, loc)]
    if isinstance(body, str) and body:
        parts.append(body[:SECTION_BODY_MAX])
    return "\n".join(parts)[:TEXT_MAX]


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


_TEST_DIRNAMES = ("test", "tests", "__tests__", "e2e", "testing")


def is_test_path(path):
    """Heuristic test flag: spec/test suffixes or test directory segments.

    Carried as candidate metadata for downstream filtering/rerank weighting.
    It never enters the embedding input, so flagging changes no vector."""
    if not isinstance(path, str) or not path:
        return False
    p = path.replace("\\", "/").strip("/")
    base = p.rsplit("/", 1)[-1].lower()
    if (".test." in base or ".spec." in base or base.startswith("test_")
            or base.endswith("_test.py") or base.endswith("_test.go")):
        return True
    return any(seg.lower() in _TEST_DIRNAMES for seg in p.split("/"))


def build_candidates(route_rows, function_rows, repo, commit,
                     method_rows=(), class_rows=(), section_rows=()):
    """Deterministic candidate list from parsed graph rows.

    route_rows:     (method, file_path[, start_line[, end_line]])
    function_rows:  (qualified_name, file_path, docstring[, signature[,
                    start_line[, end_line]]])
    method_rows:    (qualified_name, file_path, docstring[, signature[,
                    parent_class[, start_line[, end_line]]]])
    class_rows:    (qualified_name, file_path, docstring[, base_classes[,
                    label[, start_line[, end_line]]]]) — label "Class"
                    (default) or "Interface"
    section_rows:   (qualified_name, file_path, start_line, end_line, name)
                    in graph-column order (free-text name last)
    Keys follow the frozen-corpus scheme repo@commit:path:symbol; routes use
    the HTTP verb as symbol, functions/methods/classes the qualified name,
    sections `section:<qname>#<line>`. Overloads sharing a qualified name
    are disambiguated as `symbol#<start_line>` so each keeps its own vector.
    Span-less legacy rows keep their historic key shape. Excluded paths
    (minified bundles, root assets/, vendor/build dirs) are skipped.
    Candidates carry `start_line`/`end_line` (ints or None) for source
    enrichment and a `test` flag that never enters the embedding input.
    Overload disambiguation is first-seen-wins on the backend snapshot
    order, which is stable across runs of the same generation; a genuinely
    new overload therefore only ever adds keys, never renames old ones."""
    cands = {}

    def add(kind, path, symbol, text, start_line=None, end_line=None,
            meta=None):
        if not path or not symbol or is_excluded(path):
            return
        sl, el = parse_span(start_line), parse_span(end_line)
        if symbol is not None and make_key(repo, commit, path, symbol) \
                in cands and sl is not None:
            symbol = "%s#%d" % (symbol, sl)
        key = make_key(repo, commit, path, symbol)
        if key in cands:
            return
        rec = {"key": key, "kind": kind, "path": path,
               "symbol": symbol, "text": text, "start_line": sl,
               "end_line": el, "test": is_test_path(path)}
        if meta:
            rec.update(meta)
        cands[key] = rec

    for row in route_rows or ():
        method, path = row[0], row[1]
        sl = row[2] if len(row) > 2 else None
        el = row[3] if len(row) > 3 else None
        if not path or not isinstance(path, str):
            continue
        symbol = method if isinstance(method, str) and method.strip() \
            else ROUTE_SYMBOL_FALLBACK
        add("route", path, symbol, route_text(path, method), sl, el,
            meta={"method": method})
    for row in function_rows:
        qname, path, doc = row[0], row[1], row[2] if len(row) > 2 else None
        sig = row[3] if len(row) > 3 else None
        sl = row[4] if len(row) > 4 else None
        el = row[5] if len(row) > 5 else None
        if not qname or not path:
            continue
        add("function", path, qname, function_text(qname, doc, sig), sl,
            el, meta={"doc": doc, "sig": sig})
    for row in method_rows or ():
        qname, path = row[0], row[1]
        doc = row[2] if len(row) > 2 else None
        sig = row[3] if len(row) > 3 else None
        parent = row[4] if len(row) > 4 else None
        sl = row[5] if len(row) > 5 else None
        el = row[6] if len(row) > 6 else None
        if not qname or not path:
            continue
        add("method", path, qname, method_text(qname, doc, sig, parent),
            sl, el, meta={"doc": doc, "sig": sig, "parent": parent})
    for row in class_rows or ():
        qname, path = row[0], row[1]
        doc = row[2] if len(row) > 2 else None
        base = row[3] if len(row) > 3 else None
        label = row[4] if len(row) > 4 else "Class"
        sl = row[5] if len(row) > 5 else None
        el = row[6] if len(row) > 6 else None
        if not qname or not path:
            continue
        kind = "interface" if label == "Interface" else "class"
        add(kind, path, qname, class_text(qname, doc, base, label), sl,
            el, meta={"doc": doc, "base": base, "label": label})
    for row in section_rows or ():
        qname, path, start_line, end_line, name = row
        if not qname or not path or is_excluded(path):
            continue
        symbol = section_symbol(qname, start_line)
        sl, el = parse_span(start_line), parse_span(end_line)
        if make_key(repo, commit, path, symbol) in cands and sl is not None:
            symbol = "%s@%d" % (symbol, sl)
        key = make_key(repo, commit, path, symbol)
        if key in cands:
            continue
        cands[key] = {"key": key, "kind": "section", "path": path,
                      "symbol": symbol,
                      "text": section_text(qname, name, path, start_line,
                                           end_line),
                      "start_line": sl, "end_line": el,
                      "test": is_test_path(path),
                      "qname": qname, "name": name,
                      "raw_start": start_line, "raw_end": end_line}
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


def enrich_candidates_with_source(root, candidates,
                                  code_chars=CODE_MAX,
                                  section_chars=SECTION_BODY_MAX):
    composers = {
        "function_text": function_text,
        "method_text": method_text,
        "class_text": class_text,
        "section_text": section_text,
        "route_text": route_text,
    }
    return ENRICH.enrich_candidates_with_source(
        root, candidates, code_chars=code_chars,
        section_chars=section_chars, composers=composers)


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



# ── embed gateway (delegates to cbm-embed-client.py — S1 split) ───────────

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


# ── CLI ────────────────────────────────────────────────────────────────────

def resolve(args):
    repo_in = args.repo or os.getcwd()
    top = git_toplevel(repo_in)
    head = git_head(top)
    if getattr(args, "repo", None) and os.path.isdir(repo_in):
        # Explicit --repo pointing at a project subdirectory (subdir
        # projects such as home-patrick-dotfiles): keep it as the store
        # root instead of collapsing to the enclosing checkout. The
        # freshness validator fail-closes unless the graph's root_path
        # attests exactly this directory, so a wrong --repo cannot bind
        # another project's vectors. Default (cwd) behavior is unchanged.
        return os.path.realpath(repo_in), head
    root = top
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
    candidates = build_candidates(route_rows, function_rows, repo_name, head,
                                  method_rows, class_rows, section_rows)
    if getattr(args, "no_source_body", False):
        return candidates
    enriched, _coverage = enrich_candidates_with_source(root, candidates)
    return enriched


def source_coverage(candidates, attempted=True):
    """Status counters: how many candidates carry a source body.

    attempted=False (the --no-source-body path) reports no bodies and no
    read misses — no checkout read was tried, so nothing could miss."""
    with_body = sum(1 for c in candidates if c.get("body_chars"))
    spanned = sum(1 for c in candidates if c.get("start_line") is not None
                  and c.get("end_line") is not None)
    test = sum(1 for c in candidates if c.get("test"))
    return {"with_body": with_body,
            "no_span": len(candidates) - spanned,
            "read_miss": spanned - with_body if attempted else 0,
            "test_flagged": test}


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
        "source_body": source_coverage(
            candidates,
            attempted=not getattr(args, "no_source_body", False)),
        "source_enrichment": "off" if getattr(
            args, "no_source_body", False) else "on",
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
        urls = select_live_urls(resolve_embed_urls(args))
        pending = [0]

        def on_batch(pairs):
            for idx, vec in pairs:
                key = keys[idx]
                vectors_by_key[key] = vec
            if args.checkpoint_every and args.checkpoint_every > 0:
                pending[0] += len(pairs)
                if pending[0] >= args.checkpoint_every:
                    pending[0] = 0
                    fresh = [(keys[i], {
                        "hash": content_hash(args.model, text_by_key[keys[i]]),
                        "model": args.model,
                        "dim": len(vectors_by_key[keys[i]]),
                        "vector": list(vectors_by_key[keys[i]])})
                        for i, _ in pairs]
                    if not fresh:
                        return
                    STORE.append_records(artifact_path(root), fresh)
                    cp_manifest = STORE.make_manifest(
                        corpus_sha256=GRAPH.corpus_sha256(candidates),
                        receipt_id=receipt_id,
                        receipt_timestamp=receipt_id,
                        model=args.model,
                        dim=fresh[0][1]["dim"],
                        vectors=len(store) + len(vectors_by_key),
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
    common.add_argument("--no-source-body", action="store_true",
                        help="skip checkout source enrichment (code-start / "
                             "section prose); restores the legacy "
                             "name+signature+docstring-only texts. Useful "
                             "for ablation against enriched vectors.")
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
