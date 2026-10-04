#!/usr/bin/env python3
"""cbm-graph-rerank.py — graph-aware rerank boost for K3 embed-store hits.

Ticket T900993 (plan k3-embed-store-rerank task 4). Takes a query, embeds it
via the LLM gateway, retrieves top candidates from the content-hash-keyed
store (cbm-embed-store.py) by cosine similarity, then re-ranks with
structure the K3 graph already carries — HANDLES matches, CALLS/IMPORTS
degree, TESTS_FILE — fetched via ONE query_graph call per feature kind.

The boost itself is a pure function over (embed score, structural features):
zero features degrade exactly to embed order. The pure layer is spec-tested
network-free (tests/spec/cbm-graph-rerank.bats); the CLI is a thin wrapper.

Usage:
    python3 scripts/mcp/cbm-graph-rerank.py rerank --query TEXT \
        [--root DIR] [--top-k 10] [--pool 50] [--project NAME]
"""

import argparse
import json
import math
import os
import sys
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


STORE = load_store_module()
SYNC = load_sync_module()
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
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--pool", type=int, default=DEFAULT_POOL)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("rerank", help="embed query, pool from store, graph boost")
    args = parser.parse_args()
    if not args.project:
        args.project = os.environ.get("CBM_PROJECT", DEFAULT_PROJECT)
    try:
        if args.command == "rerank":
            return cmd_rerank(args)
    except (SYNC.SyncError, STORE.EmbedStoreError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
