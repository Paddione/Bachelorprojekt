#!/usr/bin/env python3
"""cbm-hybrid.py — pure 4-stage hybrid search layer (K3 symbol search).

Ticket T900993 (task A3). Stages:

    (1) BM25 FTS (nodes_fts) + bge-m3 dense (embed store) in parallel
    (2) RRF fusion (k=60 standard)
    (3) bge-reranker-v2-m3 cross-encoder rerank of the top-50 pool
    (4) small graph boost (existing apply_boost), capped last factor

This module holds the pure, network-free layer (spec-tested in
tests/spec/cbm-hybrid-search.bats) plus two thin stdlib-only IO helpers
(fts_search over sqlite3, rerank_cross over urllib). It imports no sibling
cbm-* module, so the BATS suite can load it in isolation. The CLI lives in
cbm-graph-rerank.py (`hybrid` subcommand), which wires these helpers to the
embed store (cbm-embed-store.py), the embed gateway (cbm-embed-sync.py) and
the graph boost (cbm-graph-rerank.py score_candidates/apply_boost).

Rerank endpoint discovery (2026-10-04):
    in-cluster  http://llm-gateway-rerank.workspace.svc.cluster.local:8081
                (svc llm-gateway-rerank:8081 -> bge-rerank:8080)
    request     POST <base>/v1/rerank
                {"model": "bge-reranker-v2-m3", "query": ..., "documents": [...]}
    response    {"results": [{"index": i, "relevance_score": f}, ...]}
    (see taskfiles/Taskfile.llm.yml `llm:status`/`llm:test` and
    scripts/knowledge/lib-context-retrieve.mjs `rerank()`).
Local dev needs `kubectl port-forward svc/llm-gateway-rerank 8082:8081
-n workspace` (or LLM_RERANKER_URL pointing at the in-cluster DNS); a dead
reranker never fails the search — the CLI degrades to fused order.

FTS -> node join: nodes_fts is a contentless FTS5 table whose rowid IS the
nodes.id (verified: equal row counts, column reads return NULL so metadata
must come from `nodes`). Query `SELECT rowid, rank ... MATCH` then join
`nodes` for (name, qualified_name, label, file_path, properties).
"""

import json
import math
import os
import re
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path

SCHEMA_VERSION = "k3-hybrid-search/1"

# Standard RRF constant (Cormack et al.): score = sum(1/(k + rank)).
RRF_K = 60

# Graph boost is a small LAST factor: the raw boost (HANDLES 0.10 + log
# degree + TESTS_FILE 0.02, unbounded via degree) is capped so it can never
# invert a strong cross-encoder gap. Cap < bound; tests assert the bound.
GRAPH_BOOST_CAP = 0.14
GRAPH_BOOST_BOUND = 0.15

DEFAULT_RERANK_MODEL = "bge-reranker-v2-m3"
DEFAULT_RERANK_URL = "http://localhost:8082/v1/rerank"
RERANK_TIMEOUT_S = 120
RERANK_ATTEMPTS = 4
RERANK_BACKOFF_S = (2, 5, 10)
RERANK_DOC_CHARS = 1000

FTS_MATCH_SQL = ("SELECT rowid, rank FROM nodes_fts "
                 "WHERE nodes_fts MATCH ? ORDER BY rank LIMIT ?")
FTS_NODE_SQL = ("SELECT id, name, qualified_name, label, file_path, "
                "properties FROM nodes WHERE id IN (%s)")

# FTS5 query syntax specials that must never reach MATCH unquoted:
# double-quote (phrase), * (prefix), parens (grouping), : (column filter),
# ^ (phrase-start anchor); + / - are token-prefix operators (AND/NOT).
_FTS5_STRIP_RE = re.compile(r'["*():^]')
_FTS5_SIGN_RE = re.compile(r'[+-]')


class HybridError(Exception):
    """Raised on IO-stage failures the caller may degrade from (rerank) or
    fail on (FTS when explicitly requested)."""


def eprint(msg):
    import sys
    print(msg, file=sys.stderr)


# ── pure layer (no network, no IO — spec-tested) ─────────────────────────────

def escape_fts_query(query):
    """Build a safe FTS5 MATCH string from raw user input.

    Every token is double-quoted (tokens are literals then: AND/OR/NOT/NEAR
    stay words, `:` cannot start a column filter, `*` cannot start a prefix
    query) and combined with OR. Returns '' for empty input (caller skips
    the FTS stage)."""
    if not isinstance(query, str):
        return ""
    cleaned = _FTS5_STRIP_RE.sub(" ", query)
    cleaned = _FTS5_SIGN_RE.sub(" ", cleaned)
    tokens = cleaned.split()
    if not tokens:
        return ""
    return " OR ".join('"%s"' % t for t in tokens)


def _rank_keys(ranked):
    keys = []
    for item in ranked:
        keys.append(item["key"] if isinstance(item, dict) else item)
    return keys


def rrf_fuse(ranked_lists, k=RRF_K):
    """Pure standard RRF: each list contributes 1/(k + rank) (rank 1-based)
    per key; items in one list only keep their single contribution. Sorted
    by fused score desc, key asc as deterministic tie-break."""
    scores = {}
    ranks = {}
    for lst in ranked_lists or []:
        for rank, key in enumerate(_rank_keys(lst), 1):
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            ranks.setdefault(key, []).append(rank)
    fused = [{"key": key, "fused_score": scores[key],
              "ranks": ranks[key]} for key in scores]
    fused.sort(key=lambda e: (-e["fused_score"], e["key"]))
    return fused


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def dense_search(query_vec, store, top_n):
    """Pure cosine over the embed store ({key: {vector}}). Returns
    [{"key", "dense_score"}] sorted desc, key asc tie-break; dimension
    mismatches are skipped (caller warns)."""
    scored = []
    for key, rec in (store or {}).items():
        vec = rec.get("vector") if isinstance(rec, dict) else None
        if not isinstance(vec, list) or len(vec) != len(query_vec):
            continue
        scored.append({"key": key,
                       "dense_score": cosine(query_vec, vec)})
    scored.sort(key=lambda c: (-c["dense_score"], c["key"]))
    return scored[:top_n]


def parse_rerank_results(payload, n_docs):
    """Pure: {doc index: relevance_score} from a /v1/rerank payload.
    Anything malformed or gapped degrades to {} (caller falls back to fused
    order for missing docs) — never raises."""
    try:
        if not isinstance(payload, dict):
            return {}
        results = payload.get("results")
        if not isinstance(results, list):
            return {}
        out = {}
        for res in results:
            if not isinstance(res, dict):
                continue
            idx = res.get("index")
            score = res.get("relevance_score")
            if isinstance(idx, bool) or not isinstance(idx, int):
                continue
            if isinstance(score, bool) or not isinstance(score, (int, float)):
                continue
            if not math.isfinite(score):
                continue
            if idx < 0:
                continue
            if n_docs and idx >= n_docs:
                continue
            out[idx] = float(score)
        return out
    except Exception:
        return {}


def apply_final_scores(fused, rerank_scores=None, boosts_by_key=None,
                       cap=GRAPH_BOOST_CAP):
    """Pure final stage: base = cross-encoder score when present else fused
    score; boost = min(raw graph boost, cap). Sorted by final desc, key asc.
    Zero rerank/boosts degrade exactly to fused order."""
    rerank_scores = rerank_scores or {}
    boosts_by_key = boosts_by_key or {}
    final = []
    for entry in fused:
        key = entry["key"]
        base = rerank_scores.get(key, entry["fused_score"])
        raw = boosts_by_key.get(key, 0.0)
        try:
            raw = float(raw)
        except (TypeError, ValueError):
            raw = 0.0
        if not math.isfinite(raw):
            raw = 0.0
        boost = min(max(raw, 0.0), cap)
        final.append({"key": key, "fused_score": entry["fused_score"],
                      "rerank_score": rerank_scores.get(key),
                      "boost": boost, "final": base + boost})
    final.sort(key=lambda e: (-e["final"], e["key"]))
    return final


def rerank_document_text(identity, node):
    """Pure document composer for the cross-encoder: qualified name +
    signature/docstring when a graph node matched, else the bare identity
    (path:symbol). Truncated to RERANK_DOC_CHARS."""
    if node:
        parts = [node.get("qualified_name") or "",
                 node.get("label") or "",
                 node.get("file_path") or ""]
        props = node.get("properties") or {}
        if isinstance(props, dict):
            for field in ("signature", "docstring"):
                val = props.get(field)
                if isinstance(val, str) and val.strip():
                    parts.append(val.strip()[:RERANK_DOC_CHARS])
        text = "\n".join(p for p in parts if p)
        if text.strip():
            return text[:RERANK_DOC_CHARS]
    return (identity or "")[:RERANK_DOC_CHARS]


# ── IO helpers (stdlib only, no sibling imports) ─────────────────────────────

def resolve_db_path(project, override=None):
    """--db > $CBM_DB > ~/.cache/codebase-memory-mcp/<project>.db
    (mirrors cbm-freshness.db_path without importing it)."""
    if override:
        return str(override)
    env = os.environ.get("CBM_DB")
    if env:
        return str(env)
    home = os.environ.get("HOME") or str(Path.home())
    return str(Path(home) / ".cache" / "codebase-memory-mcp"
               / ("%s.db" % project))


def fts_search(db_path, match_query, top_n):
    """Read-only BM25 over nodes_fts. Returns [{"rowid","rank","node":{...}}]
    ordered by rank (best first); rowid == nodes.id. Empty match -> []."""
    if not match_query or top_n <= 0:
        return []
    if not os.path.exists(db_path):
        raise HybridError("fts-db-missing:%s" % db_path)
    try:
        conn = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    except sqlite3.Error as exc:
        raise HybridError("fts-db-open-failed:%s" % exc) from exc
    try:
        try:
            rows = conn.execute(FTS_MATCH_SQL,
                                (match_query, top_n)).fetchall()
        except sqlite3.Error as exc:
            raise HybridError("fts-match-failed:%s" % exc) from exc
        if not rows:
            return []
        ids = [r[0] for r in rows]
        rank_by_id = {r[0]: r[1] for r in rows}
        placeholders = ",".join("?" for _ in ids)
        nodes = conn.execute(FTS_NODE_SQL % placeholders, ids).fetchall()
        cols = ("id", "name", "qualified_name", "label", "file_path",
                "properties")
        by_id = {}
        for row in nodes:
            node = dict(zip(cols, row))
            try:
                props = node.get("properties")
                node["properties"] = json.loads(props) \
                    if isinstance(props, str) and props else {}
                if not isinstance(node["properties"], dict):
                    node["properties"] = {}
            except (json.JSONDecodeError, ValueError):
                node["properties"] = {}
            by_id[node["id"]] = node
        out = []
        for rowid in ids:
            node = by_id.get(rowid)
            if node is None:
                continue
            out.append({"rowid": rowid, "rank": rank_by_id[rowid],
                        "node": node})
        return out
    finally:
        conn.close()


def normalize_rerank_url(url):
    url = (url or "").rstrip("/")
    if url.endswith("/v1/rerank"):
        return url
    if url.endswith("/v1"):
        return url + "/rerank"
    return url + "/v1/rerank"


def resolve_rerank_url(explicit=None):
    if explicit:
        return normalize_rerank_url(explicit)
    return normalize_rerank_url(
        os.environ.get("LLM_RERANKER_URL", DEFAULT_RERANK_URL))


def rerank_batch(query, documents, url, model, timeout):
    body = json.dumps({"model": model, "query": query,
                       "documents": list(documents)}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"})
    last = None
    for attempt in range(RERANK_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.load(resp)
            return parse_rerank_results(payload, len(documents))
        except Exception as exc:  # transient 401/503/OOM/timeout — retry
            last = exc
            if attempt < RERANK_ATTEMPTS - 1:
                delay = RERANK_BACKOFF_S[min(attempt,
                                             len(RERANK_BACKOFF_S) - 1)]
                eprint("  rerank retry %d/%d in %ds: %r"
                       % (attempt + 1, RERANK_ATTEMPTS, delay, exc))
                time.sleep(delay)
    raise HybridError("rerank-failed-after-%d-attempts:%r"
                      % (RERANK_ATTEMPTS, last))


def rerank_cross(query, documents, url, model,
                 timeout=RERANK_TIMEOUT_S):
    """Cross-encoder rerank of the fused pool. Returns {doc_index: score};
    raises HybridError when the backend stays down (caller degrades to fused
    order — never fail closed)."""
    endpoint = normalize_rerank_url(url)
    if not documents:
        return {}
    try:
        model_name = model or DEFAULT_RERANK_MODEL
        return rerank_batch(query, documents, endpoint, model_name,
                            timeout)
    except HybridError:
        raise
    except Exception as exc:
        raise HybridError("rerank-failed:%r" % (exc,)) from exc
