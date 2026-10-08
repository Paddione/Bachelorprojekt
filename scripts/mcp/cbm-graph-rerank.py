#!/usr/bin/env python3
"""cbm-graph-rerank.py — graph-aware rerank boost for K3 embed-store hits.

Ticket T900993 (plan k3-embed-store-rerank task 4). Takes a query, embeds it
via the LLM gateway, retrieves top candidates from the content-hash-keyed
store (cbm-embed-store.py) by cosine similarity, then re-ranks with
structure the K3 graph already carries — HANDLES matches, CALLS/IMPORTS
degree, TESTS_FILE — fetched via ONE query_graph call per feature kind.

The boost itself is a pure function over (embed score, structural features):
zero features degrade exactly to embed order. The pure layer is spec-tested
network-free (tests/py/spec/test_cbm_graph_rerank_and_hybrid.py); the CLI is a thin wrapper.

Usage:
    python3 scripts/mcp/cbm-graph-rerank.py rerank --query TEXT \
        [--root DIR] [--top-k 10] [--pool 50] [--project NAME]
    python3 scripts/mcp/cbm-graph-rerank.py hybrid --query TEXT \
        [--top-k 10] [--pool 50] [--db PATH] [--no-rerank] [--no-fts]

    `hybrid` is the 4-stage pipeline (task A3): BM25 FTS + bge-m3 dense in
    parallel, RRF fusion (k=60), bge-reranker-v2-m3 cross-encoder rerank of
    the top-50 pool, then the graph boost below as a capped last factor.
    Pure stage logic lives in cbm-hybrid.py (spec-tested network-free in
    tests/py/spec/test_cbm_graph_rerank_and_hybrid.py); here is only the IO wiring.
"""

import argparse
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

SCHEMA_VERSION = "k3-graph-rerank/1"
DEFAULT_PROJECT = "home-patrick-Bachelorprojekt"
DEFAULT_TIMEOUT_S = 60
DEFAULT_TOP_K = 10
DEFAULT_POOL = 50

# Boost weights: HANDLES is a rare, strong signal (66 edges in the live
# graph); degree grows logarithmically; TESTS_FILE adds a small bonus.
DEFAULT_WEIGHTS = {"handles": 0.10, "degree": 0.01, "tests_file": 0.02}

FEATURE_QUERIES = {
    "handles": "MATCH ()-[e:HANDLES]->() RETURN e.handler AS handler",
    "calls": "MATCH (a)-[:CALLS]->() RETURN a.file_path AS src",
    "imports": "MATCH (a)-[:IMPORTS]->() RETURN a.file_path AS src",
    "tests_file": "MATCH (a)-[:TESTS_FILE]->(b) RETURN b.file_path AS tested",
}

_HERE = os.path.dirname(os.path.abspath(__file__))


def load_store_module():
    import importlib.util
    path = os.path.join(_HERE, "cbm-embed-store.py")
    spec = importlib.util.spec_from_file_location("cbm_embed_store", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_sync_module():
    import importlib.util
    path = os.path.join(_HERE, "cbm-embed-sync.py")
    spec = importlib.util.spec_from_file_location("cbm_embed_sync", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_hybrid_module():
    import importlib.util
    path = os.path.join(_HERE, "cbm-hybrid.py")
    spec = importlib.util.spec_from_file_location("cbm_hybrid", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


STORE = load_store_module()
SYNC = load_sync_module()
HYBRID = load_hybrid_module()
identity_of = STORE.identity_of


# ── pure rerank layer (no network, no IO — spec-tested) ────────────────────

def zero_features():
    return {"handles": False, "call_degree": 0, "import_degree": 0,
            "tests_file": False}


def make_features(handles=False, call_degree=0, import_degree=0,
                  tests_file=False):
    return {"handles": bool(handles),
            "call_degree": int(call_degree or 0),
            "import_degree": int(import_degree or 0),
            "tests_file": bool(tests_file)}


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def apply_boost(embed_score, features, weights=None):
    """Pure: boosted score = embed score + w_handles*[HANDLES match]
    + w_degree*(log1p(call_degree) + log1p(import_degree))
    + w_tests*[TESTS_FILE]. Zero features -> score == embed_score."""
    w = dict(DEFAULT_WEIGHTS)
    if weights:
        w.update(weights)
    feat = make_features(**(features or {}))
    b_handles = w["handles"] if feat["handles"] else 0.0
    b_degree = w["degree"] * (math.log1p(feat["call_degree"])
                              + math.log1p(feat["import_degree"]))
    b_tests = w["tests_file"] if feat["tests_file"] else 0.0
    boost = b_handles + b_degree + b_tests
    return {"score": embed_score + boost, "boost": boost,
            "breakdown": {"handles": b_handles, "degree": b_degree,
                          "tests_file": b_tests}}


def score_candidates(candidates, features_by_key, weights=None):
    """Pure: candidates = [{"key", "embed_score"}...] — returns the ranked
    list (score desc, key asc as tie-break). With zero features the embed
    order is preserved exactly."""
    ranked = []
    for cand in candidates:
        feats = features_by_key.get(cand["key"]) or zero_features()
        boosted = apply_boost(cand["embed_score"], feats, weights)
        ranked.append({"key": cand["key"],
                       "identity": identity_of(cand["key"]),
                       "embed_score": cand["embed_score"],
                       "score": boosted["score"],
                       "boost": boosted["boost"],
                       "breakdown": boosted["breakdown"],
                       "features": feats})
    ranked.sort(key=lambda r: (-r["score"], r["key"]))
    return ranked


def features_for_identity(identity, handles, calls, imports, tested):
    """Pure join: structural features for one candidate identity
    ('path:symbol'). HANDLES matches on the symbol (handler qualified name);
    degrees join on the file path; TESTS_FILE on the tested path."""
    path, _, symbol = identity.rpartition(":")
    return make_features(
        handles=symbol in handles if symbol else False,
        call_degree=calls.get(path, 0),
        import_degree=imports.get(path, 0),
        tests_file=path in tested if path else False)


# ── graph + gateway access (thin wrappers) ─────────────────────────────────

def fetch_feature_sets(project, timeout, warnings):
    """ONE query_graph call per feature kind. Any probe failure degrades that
    feature to empty (recorded as a warning) instead of failing the rank."""
    sets = {"handles": set(), "calls": {}, "imports": {}, "tests_file": set()}
    for kind, query in FEATURE_QUERIES.items():
        try:
            data = SYNC.run_cli_json(
                ["codebase-memory-mcp", "cli", "--json", "query_graph",
                 "--project", project, "--query", query], timeout)
            rows = SYNC.graph_rows(SYNC.envelope_text(data) or "", 1)
        except SYNC.SyncError as exc:
            warnings.append("feature-probe-failed:%s:%s" % (kind, exc))
            continue
        if kind == "handles":
            sets[kind] = {r[0] for r in rows if r[0]}
        elif kind in ("calls", "imports"):
            counts = {}
            for r in rows:
                if r[0]:
                    counts[r[0]] = counts.get(r[0], 0) + 1
            sets[kind] = counts
        else:
            sets[kind] = {r[0] for r in rows if r[0]}
    return sets


def embed_query(text, url, model):
    vecs = SYNC.embed_texts([text], url, model)
    if len(vecs) != 1:
        raise SYNC.SyncError("embed-query-failed")
    return vecs[0]


# ── CLI ────────────────────────────────────────────────────────────────────

def cmd_rerank(args):
    warnings = []
    root = os.path.realpath(args.root or os.getcwd())
    store = STORE.load_artifact(STORE.artifact_path(root))
    manifest = STORE.load_manifest(STORE.manifest_path(root))
    if manifest["model"] != args.model:
        warnings.append("model-mismatch:store=%s" % manifest["model"])

    query_vec = embed_query(args.query, args.embed_url, args.model)
    scored = []
    for key, rec in store.items():
        if len(rec["vector"]) != len(query_vec):
            warnings.append("dim-mismatch:%s" % key)
            continue
        scored.append({"key": key,
                       "embed_score": cosine(query_vec, rec["vector"])})
    scored.sort(key=lambda c: (-c["embed_score"], c["key"]))
    pool = scored[:args.pool]

    sets = fetch_feature_sets(args.project, args.timeout, warnings)
    features_by_key = {}
    for cand in pool:
        features_by_key[cand["key"]] = features_for_identity(
            identity_of(cand["key"]), sets["handles"], sets["calls"],
            sets["imports"], sets["tests_file"])
    ranked = score_candidates(pool, features_by_key)
    out = {"schema_version": SCHEMA_VERSION,
           "query": args.query,
           "model": args.model,
           "store": {"vectors": len(store),
                     "receipt_id": manifest["receipt_id"]},
           "pool": len(pool),
           "top_k": args.top_k,
           "results": ranked[:args.top_k],
           "warnings": sorted(set(warnings)),
           "generated_at": datetime.now(timezone.utc).isoformat()}
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0


# ── hybrid CLI (task A3: BM25 + dense -> RRF -> cross-encoder -> boost) ──────

def _hybrid_nodes_by_qualified(db, symbols):
    """Batch node lookup for dense-only keys: {qualified_name: node}."""
    symbols = [s for s in dict.fromkeys(symbols) if s]
    if not symbols or not os.path.exists(db):
        return {}
    import sqlite3
    conn = sqlite3.connect("file:%s?mode=ro" % db, uri=True)
    try:
        out = {}
        for i in range(0, len(symbols), 500):
            chunk = symbols[i:i + 500]
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(
                "SELECT id, name, qualified_name, label, file_path, "
                "properties FROM nodes WHERE qualified_name IN (%s)"
                % placeholders, chunk).fetchall()
            for row in rows:
                node = dict(zip(("id", "name", "qualified_name", "label",
                                 "file_path", "properties"), row))
                try:
                    props = node.get("properties")
                    node["properties"] = json.loads(props) \
                        if isinstance(props, str) and props else {}
                    if not isinstance(node["properties"], dict):
                        node["properties"] = {}
                except (ValueError, TypeError):
                    node["properties"] = {}
                out[node["qualified_name"]] = node
        return out
    finally:
        conn.close()


def cmd_hybrid(args):
    warnings = []
    timings = {}
    t_all = time.perf_counter()
    root = os.path.realpath(args.root or os.getcwd())
    project = args.project or os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    db = HYBRID.resolve_db_path(project, args.db)

    # embed the query first (dense stage needs the vector)
    t0 = time.perf_counter()
    try:
        store = STORE.load_artifact(STORE.artifact_path(root))
    except STORE.EmbedStoreError as exc:
        store = {}
        warnings.append("store-missing:%s" % exc)
    try:
        manifest = STORE.load_manifest(STORE.manifest_path(root))
        receipt_id = manifest.get("receipt_id")
        if manifest.get("model") != args.model:
            warnings.append("model-mismatch:store=%s" % manifest.get("model"))
    except STORE.EmbedStoreError as exc:
        manifest = None
        receipt_id = None
        warnings.append("manifest-missing:%s" % exc)
    try:
        query_vec = embed_query(args.query, args.embed_url, args.model)
    except SYNC.SyncError as exc:
        if args.no_fts:
            raise
        # embed gateway down but FTS can still answer -> dense degrades
        warnings.append("embed-failed:%s" % exc)
        query_vec = None
    timings["embed_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    # stage 1: BM25 FTS + dense cosine in parallel
    match_query = "" if args.no_fts else HYBRID.escape_fts_query(args.query)
    if args.no_fts:
        warnings.append("fts-skipped:--no-fts")

    def run_fts():
        t = time.perf_counter()
        try:
            hits = HYBRID.fts_search(db, match_query, args.pool)
        except HYBRID.HybridError as exc:
            warnings.append("fts-failed:%s" % exc)
            hits = []
        return hits, round((time.perf_counter() - t) * 1000, 1)

    def run_dense():
        t = time.perf_counter()
        if query_vec is None:
            return [], round((time.perf_counter() - t) * 1000, 1)
        scored = HYBRID.dense_search(query_vec, store, args.pool)
        return scored, round((time.perf_counter() - t) * 1000, 1)

    with ThreadPoolExecutor(max_workers=2) as pool_exec:
        fts_future = pool_exec.submit(run_fts)
        dense_future = pool_exec.submit(run_dense)
        fts_hits, fts_ms = fts_future.result()
        dense_scored, dense_ms = dense_future.result()
    timings["fts_ms"] = fts_ms
    timings["dense_ms"] = dense_ms

    # map FTS nodes into the store-key space for fusion (identity join);
    # nodes without a vector stay as FTS-only `fts:` entries (RRF ranks
    # single-list items naturally).
    by_identity = {identity_of(k): k for k in store}
    dense_by_key = {c["key"]: c["dense_score"] for c in dense_scored}
    fts_ranks = {}
    node_by_key = {}
    fts_keys = []
    for rank, hit in enumerate(fts_hits, 1):
        node = hit["node"]
        ident = "%s:%s" % (node.get("file_path") or "",
                           node.get("qualified_name") or "")
        key = by_identity.get(ident)
        if key is None:
            key = "fts:%s" % ident
        fts_keys.append(key)
        fts_ranks[key] = rank
        node_by_key[key] = node
    dense_keys = [c["key"] for c in dense_scored]

    # stage 2: RRF fusion, truncated to the rerank pool
    t0 = time.perf_counter()
    fused = HYBRID.rrf_fuse([fts_keys, dense_keys])[:args.pool]
    timings["fuse_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    # node metadata for dense-only keys (for rerank documents)
    dense_symbols = []
    for cand in fused:
        if cand["key"] not in node_by_key:
            dense_symbols.append(
                cand["key"].split("@", 1)[-1].rsplit(":", 1)[-1]
                if ":" in cand["key"] else cand["key"])
    for qn, node in _hybrid_nodes_by_qualified(db, dense_symbols).items():
        for cand in fused:
            ident = identity_of(cand["key"])
            if ident.rpartition(":")[2] == qn and \
                    cand["key"] not in node_by_key:
                node_by_key[cand["key"]] = node

    # stage 3: cross-encoder rerank of the pool (graceful degradation)
    t0 = time.perf_counter()
    rerank_scores = {}
    rerank_degraded = False
    if args.no_rerank:
        warnings.append("rerank-skipped:--no-rerank")
        rerank_degraded = True
    elif fused:
        documents = [HYBRID.rerank_document_text(
            identity_of(c["key"]), node_by_key.get(c["key"]))
            for c in fused]
        try:
            by_index = HYBRID.rerank_cross(
                args.query, documents, args.rerank_url, args.rerank_model,
                timeout=args.rerank_timeout)
            rerank_scores = {fused[i]["key"]: s
                             for i, s in by_index.items()
                             if 0 <= i < len(fused)}
            if len(rerank_scores) < len(fused):
                warnings.append("rerank-index-gaps:%d/%d"
                                % (len(rerank_scores), len(fused)))
        except HYBRID.HybridError as exc:
            warnings.append("rerank-failed:%s" % exc)
            rerank_degraded = True
    timings["rerank_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    # stage 4: small graph boost as capped last factor
    t0 = time.perf_counter()
    raw_boosts = {}
    breakdowns = {}
    if args.no_boost:
        warnings.append("boost-skipped:--no-boost")
        for cand in fused:
            raw_boosts[cand["key"]] = 0.0
            breakdowns[cand["key"]] = {"handles": 0.0, "degree": 0.0,
                                       "tests_file": 0.0}
    else:
        sets = fetch_feature_sets(project, args.timeout, warnings)
        for cand in fused:
            ident = identity_of(cand["key"])
            feats = features_for_identity(ident, sets["handles"], sets["calls"],
                                          sets["imports"], sets["tests_file"])
            boosted = apply_boost(0.0, feats)
            raw_boosts[cand["key"]] = boosted["boost"]
            breakdowns[cand["key"]] = boosted["breakdown"]
    final = HYBRID.apply_final_scores(fused, rerank_scores, raw_boosts)
    timings["boost_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    results = []
    for entry in final[:args.top_k]:
        key = entry["key"]
        node = node_by_key.get(key) or {}
        results.append({
            "key": None if key.startswith("fts:") else key,
            "identity": identity_of(key),
            "node": {k: node.get(k) for k in
                     ("qualified_name", "label", "file_path")},
            "scores": {"fts_rank": fts_ranks.get(key),
                       "dense": dense_by_key.get(key),
                       "fused": entry["fused_score"],
                       "rerank": entry["rerank_score"],
                       "boost": entry["boost"],
                       "final": entry["final"]},
            "boost_breakdown": breakdowns.get(key, {}),
        })
    timings["total_ms"] = round((time.perf_counter() - t_all) * 1000, 1)
    out = {"schema_version": HYBRID.SCHEMA_VERSION,
           "query": args.query,
           "model": args.model,
           "rerank_model": args.rerank_model,
           "store": {"vectors": len(store), "receipt_id": receipt_id},
           "stages": {
               "fts": {"hits": len(fts_hits),
                       "match": match_query if match_query else None},
               "dense": {"hits": len(dense_scored)},
               "fused": {"candidates": len(fused)},
               "reranked": {"docs": len(rerank_scores),
                            "degraded": rerank_degraded or not rerank_scores},
               "boosted": {"cap": HYBRID.GRAPH_BOOST_CAP,
                           "max_boost": max(
                               (e["boost"] for e in final),
                               default=0.0)},
           },
           "pool": len(fused),
           "top_k": args.top_k,
           "results": results,
           "warnings": sorted(set(warnings)),
           "timings": timings,
           "generated_at": datetime.now(timezone.utc).isoformat()}
    print(json.dumps(out, ensure_ascii=False, sort_keys=True))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=None, help="unused, kept for symmetry")
    parser.add_argument("--root", default=None,
                        help="repo root holding .codebase-memory/ (default: cwd)")
    parser.add_argument("--project", default=None,
                        help="graph project (default: $CBM_PROJECT or %s)"
                             % DEFAULT_PROJECT)
    parser.add_argument("--model", default="bge-m3")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_S)
    parser.add_argument("--embed-url", default=os.environ.get(
        "LLM_EMBED_URL", SYNC.DEFAULT_EMBED_URL))
    parser.add_argument("--top-k", type=int, default=None,
                        help="results to return (default: %d)" % DEFAULT_TOP_K)
    parser.add_argument("--pool", type=int, default=None,
                        help="candidate pool size (default: %d)" % DEFAULT_POOL)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("rerank", help="embed query, pool from store, graph boost")
    hy = sub.add_parser("hybrid", help="4-stage hybrid search "
                        "(BM25 FTS + dense -> RRF -> cross-encoder rerank "
                        "-> capped graph boost)")
    hy.add_argument("--query", required=True, help="search query text")
    hy.add_argument("--top-k", type=int, default=argparse.SUPPRESS,
                    help="results to return (default: %d)" % DEFAULT_TOP_K)
    hy.add_argument("--pool", type=int, default=argparse.SUPPRESS,
                    help="fused pool for rerank (default: %d)" % DEFAULT_POOL)
    hy.add_argument("--db", default=None,
                    help="graph sqlite DB (default: $CBM_DB or "
                         "~/.cache/codebase-memory-mcp/<project>.db)")
    hy.add_argument("--rerank-url", default=None,
                    help="reranker base URL (default: $LLM_RERANKER_URL or "
                         "http://localhost:8082 — needs a port-forward to "
                         "svc/llm-gateway-rerank; failures degrade to fused "
                         "order, never fail closed)")
    hy.add_argument("--rerank-model", default=HYBRID.DEFAULT_RERANK_MODEL)
    hy.add_argument("--rerank-timeout", type=int,
                    default=HYBRID.RERANK_TIMEOUT_S)
    hy.add_argument("--no-rerank", action="store_true",
                    help="skip the cross-encoder stage (offline mode)")
    hy.add_argument("--no-fts", action="store_true",
                    help="skip the BM25 stage (dense-only)")
    hy.add_argument("--no-boost", action="store_true",
                    help="skip the graph-boost stage (ablation: fused/rerank "
                         "order passes through unchanged)")
    args = parser.parse_args()
    if not args.project:
        args.project = os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    if args.top_k is None:
        args.top_k = DEFAULT_TOP_K
    if args.pool is None:
        args.pool = DEFAULT_POOL
    try:
        if args.command == "rerank":
            return cmd_rerank(args)
        if args.command == "hybrid":
            if args.rerank_url is None:
                args.rerank_url = HYBRID.resolve_rerank_url()
            return cmd_hybrid(args)
    except (SYNC.SyncError, STORE.EmbedStoreError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
