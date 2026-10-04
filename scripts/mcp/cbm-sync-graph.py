#!/usr/bin/env python3
"""cbm-sync-graph.py — K3 graph-access layer for the embed sync (T900993).

Split out of cbm-embed-sync.py (S1 filesize gate): Cypher query constants,
`cli --json` envelope parsing, table-row parsing, per-kind fetch helpers,
the freshness-receipt probe (drift contract) and the corpus hash. The CLI
stays in cbm-embed-sync.py, which loads this module via a sys.modules-pinned
sibling loader and re-exports SyncError/run_cli_json/envelope_text/graph_rows
(single identity — cbm-graph-rerank.py also imports those via the sync
module). Stdlib only.
"""

import json
import os
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))


class SyncError(Exception):
    """Raised on any fail-closed condition — CLI maps it to exit 1."""


# ── graph access (codebase-memory-mcp CLI) ─────────────────────────────────

ROUTE_QUERY = ("MATCH (r:Route) WHERE r.file_path IS NOT NULL "
               "RETURN r.method AS method, r.file_path AS path")
FUNCTION_QUERY = ("MATCH (f:Function) WHERE f.docstring IS NOT NULL "
                  "AND f.file_path IS NOT NULL "
                  "RETURN f.qualified_name AS qname, f.file_path AS path, "
                  "f.docstring AS doc")
# Full-corpus queries (A2). The table parser supports exactly one free-text
# column, which must come LAST — signature/docstring/base therefore travel in
# separate queries and are joined in Python on (qualified_name, file_path).
FUNCTION_ALL_QUERY = ("MATCH (f:Function) WHERE f.file_path IS NOT NULL "
                      "RETURN f.qualified_name AS qname, f.file_path AS path, "
                      "f.signature AS sig")
METHOD_ALL_QUERY = ("MATCH (m:Method) WHERE m.file_path IS NOT NULL "
                    "RETURN m.qualified_name AS qname, m.file_path AS path, "
                    "m.parent_class AS parent, m.signature AS sig")
METHOD_DOC_QUERY = ("MATCH (m:Method) WHERE m.docstring IS NOT NULL "
                    "AND m.file_path IS NOT NULL "
                    "RETURN m.qualified_name AS qname, m.file_path AS path, "
                    "m.docstring AS doc")
CLASS_ALL_QUERY = ("MATCH (c:Class) WHERE c.file_path IS NOT NULL "
                   "RETURN c.qualified_name AS qname, c.file_path AS path")
CLASS_DOC_QUERY = ("MATCH (c:Class) WHERE c.docstring IS NOT NULL "
                   "AND c.file_path IS NOT NULL "
                   "RETURN c.qualified_name AS qname, c.file_path AS path, "
                   "c.docstring AS doc")
CLASS_BASE_QUERY = ("MATCH (c:Class) WHERE c.file_path IS NOT NULL "
                    "RETURN c.qualified_name AS qname, c.file_path AS path, "
                    "c.base_classes AS base")
INTERFACE_ALL_QUERY = ("MATCH (c:Interface) WHERE c.file_path IS NOT NULL "
                       "RETURN c.qualified_name AS qname, "
                       "c.file_path AS path")
INTERFACE_DOC_QUERY = ("MATCH (c:Interface) WHERE c.docstring IS NOT NULL "
                       "AND c.file_path IS NOT NULL "
                       "RETURN c.qualified_name AS qname, "
                       "c.file_path AS path, c.docstring AS doc")
INTERFACE_BASE_QUERY = ("MATCH (c:Interface) WHERE c.file_path IS NOT NULL "
                        "RETURN c.qualified_name AS qname, "
                        "c.file_path AS path, c.base_classes AS base")
SECTION_QUERY = ("MATCH (s:Section) WHERE s.file_path IS NOT NULL "
                 "RETURN s.qualified_name AS qname, s.file_path AS path, "
                 "s.start_line AS sl, s.end_line AS el, s.name AS name")


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


def query_rows(project, timeout, query, ncols):
    data = run_cli_json(["codebase-memory-mcp", "cli", "--json", "query_graph",
                         "--project", project, "--query", query], timeout)
    return graph_rows(envelope_text(data) or "", ncols)


def fetch_function_full_rows(project, timeout):
    """All functions as (qname, path, doc, sig) quads — doc-less functions
    included with doc None."""
    all_rows = query_rows(project, timeout, FUNCTION_ALL_QUERY, 3)
    docs = {(q, p): d for q, p, d in fetch_function_rows(project, timeout)}
    sigs = {}
    for q, p, sig in all_rows:
        if q and p and (q, p) not in sigs:
            sigs[(q, p)] = sig
    return [(q, p, docs.get((q, p)), sig) for (q, p), sig in sigs.items()]


def fetch_method_rows(project, timeout):
    """All methods as (qname, path, doc, sig, parent) rows."""
    all_rows = query_rows(project, timeout, METHOD_ALL_QUERY, 4)
    docs = {(q, p): d
            for q, p, d in query_rows(project, timeout, METHOD_DOC_QUERY, 3)
            if d}
    out = {}
    for q, p, parent, sig in all_rows:
        if q and p and (q, p) not in out:
            out[(q, p)] = (q, p, docs.get((q, p)), sig, parent)
    return list(out.values())


def fetch_class_like_rows(project, timeout, label):
    """All Class (label='Class') or Interface rows as
    (qname, path, doc, base, label)."""
    if label == "Interface":
        all_q, doc_q, base_q = (INTERFACE_ALL_QUERY, INTERFACE_DOC_QUERY,
                                INTERFACE_BASE_QUERY)
    else:
        all_q, doc_q, base_q = (CLASS_ALL_QUERY, CLASS_DOC_QUERY,
                                CLASS_BASE_QUERY)
    all_rows = query_rows(project, timeout, all_q, 2)
    docs = {(q, p): d for q, p, d in query_rows(project, timeout, doc_q, 3)
            if d}
    bases = {}
    for q, p, base in query_rows(project, timeout, base_q, 3):
        if q and p and (q, p) not in bases:
            bases[(q, p)] = base
    seen, out = set(), []
    for q, p in all_rows:
        if not q or not p or (q, p) in seen:
            continue
        seen.add((q, p))
        out.append((q, p, docs.get((q, p)), bases.get((q, p)), label))
    return out


def fetch_section_rows(project, timeout):
    """All sections as (qname, path, start_line, end_line, name) rows in
    graph-column order (free-text name last)."""
    rows = query_rows(project, timeout, SECTION_QUERY, 5)
    return [(q, p, sl, el, name) for q, p, sl, el, name in rows if q and p]



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

