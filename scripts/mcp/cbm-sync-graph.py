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
import re
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))

# Paging contract (CLI 0.11.0): query_graph defaults to 200 visible rows plus
# a small output-token budget, and both truncate silently from the caller's
# view (total:/has_more:/next_cursor: stay in the envelope). Every fetch
# helper must exhaust pages via snapshot cursor — a single page is never
# the corpus.
PAGE_ROWS = 2000
PAGE_TOKENS = 100000
MAX_PAGES = 1000


class SyncError(Exception):
    """Raised on any fail-closed condition — CLI maps it to exit 1."""


# ── graph access (codebase-memory-mcp CLI) ─────────────────────────────────

ROUTE_QUERY = ("MATCH (r:Route) WHERE r.file_path IS NOT NULL "
               "RETURN r.method AS method, r.file_path AS path, "
               "r.start_line AS sl, r.end_line AS el")
FUNCTION_QUERY = ("MATCH (f:Function) WHERE f.docstring IS NOT NULL "
                  "AND f.file_path IS NOT NULL "
                  "RETURN f.qualified_name AS qname, f.file_path AS path, "
                  "f.start_line AS sl, f.end_line AS el, f.docstring AS doc")
# Full-corpus queries (A2). The table parser supports exactly one free-text
# column, which must come LAST — signature/docstring/base therefore travel in
# separate queries and are joined in Python on (qualified_name, file_path,
# start_line). The span disambiguates overloads/nested functions that share a
# qualified name; source spans additionally ground the embedding enrichment
# in cbm-embed-sync.py (code-start/section-prose read from the checkout).
FUNCTION_ALL_QUERY = ("MATCH (f:Function) WHERE f.file_path IS NOT NULL "
                      "RETURN f.qualified_name AS qname, f.file_path AS path, "
                      "f.start_line AS sl, f.end_line AS el, f.signature AS sig")
METHOD_ALL_QUERY = ("MATCH (m:Method) WHERE m.file_path IS NOT NULL "
                    "RETURN m.qualified_name AS qname, m.file_path AS path, "
                    "m.parent_class AS parent, m.start_line AS sl, "
                    "m.end_line AS el, m.signature AS sig")
METHOD_DOC_QUERY = ("MATCH (m:Method) WHERE m.docstring IS NOT NULL "
                    "AND m.file_path IS NOT NULL "
                    "RETURN m.qualified_name AS qname, m.file_path AS path, "
                    "m.start_line AS sl, m.end_line AS el, m.docstring AS doc")
CLASS_ALL_QUERY = ("MATCH (c:Class) WHERE c.file_path IS NOT NULL "
                   "RETURN c.qualified_name AS qname, c.file_path AS path, "
                   "c.start_line AS sl, c.end_line AS el")
CLASS_DOC_QUERY = ("MATCH (c:Class) WHERE c.docstring IS NOT NULL "
                   "AND c.file_path IS NOT NULL "
                   "RETURN c.qualified_name AS qname, c.file_path AS path, "
                   "c.start_line AS sl, c.end_line AS el, c.docstring AS doc")
CLASS_BASE_QUERY = ("MATCH (c:Class) WHERE c.file_path IS NOT NULL "
                    "RETURN c.qualified_name AS qname, c.file_path AS path, "
                    "c.start_line AS sl, c.end_line AS el, "
                    "c.base_classes AS base")
INTERFACE_ALL_QUERY = ("MATCH (c:Interface) WHERE c.file_path IS NOT NULL "
                       "RETURN c.qualified_name AS qname, "
                       "c.file_path AS path, c.start_line AS sl, "
                       "c.end_line AS el")
INTERFACE_DOC_QUERY = ("MATCH (c:Interface) WHERE c.docstring IS NOT NULL "
                       "AND c.file_path IS NOT NULL "
                       "RETURN c.qualified_name AS qname, "
                       "c.file_path AS path, c.start_line AS sl, "
                       "c.end_line AS el, c.docstring AS doc")
INTERFACE_BASE_QUERY = ("MATCH (c:Interface) WHERE c.file_path IS NOT NULL "
                        "RETURN c.qualified_name AS qname, "
                        "c.file_path AS path, c.start_line AS sl, "
                        "c.end_line AS el, c.base_classes AS base")
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


_REF_RE = re.compile(r"^@(\d+)\+(.*)$")


def parse_refs(text):
    """Ref-prefix table of a tree envelope: lines indented by exactly two
    spaces between 'rows_refs:' and 'rows:', shaped '<id> <prefix>'.

    The renderer compresses repeated long values as @N+suffix (see the
    'rows_ref_rule: @N+suffix=prefix+suffix' line); without this table
    those references would enter the corpus as literal garbage paths."""
    refs = {}
    if not isinstance(text, str):
        return refs
    in_refs = False
    for line in text.splitlines():
        if line.startswith("rows_refs:"):
            in_refs = True
            continue
        if line.startswith("rows:"):
            break
        if not in_refs or not line.startswith("  ") \
                or line.startswith("   "):
            continue
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[0].isdigit():
            refs[parts[0]] = _strip_quotes(parts[1])
    return refs


def resolve_ref(value, refs):
    """Expand one '@N+suffix' value via the envelope's ref table; values
    without the shape pass through untouched. Unknown ids fail closed —
    embedding an unresolvable reference would corrupt the corpus."""
    if not refs or not isinstance(value, str):
        return value
    match = _REF_RE.match(value)
    if not match:
        return value
    rid, suffix = match.group(1), match.group(2)
    if rid not in refs:
        raise SyncError("cli-ref-unknown:@%s" % rid)
    return refs[rid] + suffix


def _split_row(line, ncols):
    """Whitespace split of one table row honoring double quotes: the backend
    quotes values containing spaces (e.g. asset paths like "Brett Design
    System/..."), and a naive split would misalign every later column into
    garbage paths/keys. Backslash escapes inside quotes; the last column
    takes the remainder. Unbalanced quotes yield fewer parts and the row is
    skipped by the caller instead of corrupting the corpus."""
    parts, buf, in_quotes, escaped, splits = [], [], False, False, 0
    for ch in line.strip():
        if escaped:
            buf.append(ch)
            escaped = False
            continue
        if in_quotes:
            if ch == "\\":
                escaped = True
                buf.append(ch)
                continue
            if ch == '"':
                in_quotes = False
                buf.append(ch)
                continue
            buf.append(ch)
            continue
        if ch == '"':
            in_quotes = True
            buf.append(ch)
            continue
        if ch in (" ", "\t"):
            if splits >= ncols - 1:
                buf.append(ch)
                continue
            if buf:
                parts.append("".join(buf))
                buf = []
                splits += 1
            continue
        buf.append(ch)
    if buf:
        parts.append("".join(buf))
    return parts


def graph_rows(text, ncols):
    """Parse query_graph table rows: lines indented by exactly two spaces
    between 'rows:' and 'total:'. First ncols-1 columns are single tokens;
    the last column takes the remainder (quote-stripped). '-' -> None.
    Tree '@N+suffix' references are expanded via the envelope's rows_refs
    table; the refs block itself never yields data rows."""
    rows = []
    if not isinstance(text, str):
        return rows
    refs = parse_refs(text)
    in_rows = False
    for line in text.splitlines():
        if line.startswith("rows:"):
            in_rows = True
            continue
        if in_rows and line.startswith("total:"):
            break
        if not in_rows or not line.startswith("  ") or line.startswith("   "):
            continue
        parts = _split_row(line, ncols)
        if len(parts) < ncols:
            continue
        parsed = [None if p == "-" else resolve_ref(_strip_quotes(p), refs)
                  for p in parts[:-1]]
        last = parts[-1] if parts else ""
        parsed.append(None if last == "-"
                      else resolve_ref(_strip_quotes(last), refs))
        rows.append(tuple(parsed))
    return rows


def parse_page_meta(text):
    """(has_more, next_cursor) from a query_graph tree envelope. A missing
    has_more fails closed as None — callers treat unknown as an error."""
    has_more, cursor = None, None
    if not isinstance(text, str):
        return None, None
    for line in text.splitlines():
        if line.startswith("has_more:"):
            has_more = line.split(":", 1)[1].strip().lower() == "true"
        elif line.startswith("next_cursor:"):
            cursor = line.split(":", 1)[1].strip() or None
    return has_more, cursor


def paged_query_rows(project, timeout, query, ncols):
    """Exhaust every snapshot page; fail closed on unknown truncation or
    stalled progress. Returns concatenated graph_rows across pages."""
    rows_all = []
    cursor = None
    for _ in range(MAX_PAGES):
        cmd = ["codebase-memory-mcp", "cli", "--json", "query_graph",
               "--project", project, "--query", query,
               "--max-rows", str(PAGE_ROWS),
               "--max-output-tokens", str(PAGE_TOKENS)]
        if cursor:
            cmd += ["--cursor", cursor]
        data = run_cli_json(cmd, timeout)
        text = envelope_text(data) or ""
        page_rows = graph_rows(text, ncols)
        rows_all.extend(page_rows)
        has_more, cursor = parse_page_meta(text)
        if has_more is None:
            raise SyncError("cli-page-meta-missing")
        if has_more and not page_rows:
            raise SyncError("cli-page-no-progress")
        if not has_more:
            return rows_all
        if not cursor:
            raise SyncError("cli-page-cursor-missing")
    raise SyncError("cli-page-limit:%d" % MAX_PAGES)


def fetch_route_rows(project, timeout):
    rows = paged_query_rows(project, timeout, ROUTE_QUERY, 4)
    return [(m, p, sl, el) for m, p, sl, el in rows]


def fetch_function_rows(project, timeout):
    rows = paged_query_rows(project, timeout, FUNCTION_QUERY, 5)
    return [(q, p, sl, el, d) for q, p, sl, el, d in rows if d]


def query_rows(project, timeout, query, ncols):
    return paged_query_rows(project, timeout, query, ncols)


def fetch_function_full_rows(project, timeout):
    """All functions as (qname, path, doc, sig, start_line, end_line) rows —
    doc-less functions included with doc None. The doc/signature join key is
    (qualified_name, file_path, start_line) so overloads sharing a name keep
    their own docstring and signature."""
    all_rows = query_rows(project, timeout, FUNCTION_ALL_QUERY, 5)
    docs = {(q, p, sl): d
            for q, p, sl, el, d in query_rows(project, timeout,
                                             FUNCTION_QUERY, 5) if d}
    sigs = {}
    for q, p, sl, el, sig in all_rows:
        if q and p and (q, p, sl) not in sigs:
            sigs[(q, p, sl)] = (sig, el)
    return [(q, p, docs.get((q, p, sl)), sig, sl, el)
            for (q, p, sl), (sig, el) in sigs.items()]


def fetch_method_rows(project, timeout):
    """All methods as (qname, path, doc, sig, parent, start_line, end_line)
    rows — the doc join key is (qualified_name, file_path, start_line) so
    overloads keep their own docstring."""
    all_rows = query_rows(project, timeout, METHOD_ALL_QUERY, 6)
    docs = {(q, p, sl): d
            for q, p, sl, el, d
            in query_rows(project, timeout, METHOD_DOC_QUERY, 5) if d}
    out = {}
    for q, p, parent, sl, el, sig in all_rows:
        if q and p and (q, p, sl) not in out:
            out[(q, p, sl)] = (q, p, docs.get((q, p, sl)), sig, parent,
                               sl, el)
    return list(out.values())


def fetch_class_like_rows(project, timeout, label):
    """All Class (label='Class') or Interface rows as
    (qname, path, doc, base, label, start_line, end_line)."""
    if label == "Interface":
        all_q, doc_q, base_q = (INTERFACE_ALL_QUERY, INTERFACE_DOC_QUERY,
                                INTERFACE_BASE_QUERY)
    else:
        all_q, doc_q, base_q = (CLASS_ALL_QUERY, CLASS_DOC_QUERY,
                                CLASS_BASE_QUERY)
    all_rows = query_rows(project, timeout, all_q, 4)
    docs = {(q, p, sl): d
            for q, p, sl, el, d in query_rows(project, timeout, doc_q, 5)
            if d}
    bases = {}
    for q, p, sl, el, base in query_rows(project, timeout, base_q, 5):
        if q and p and (q, p, sl) not in bases:
            bases[(q, p, sl)] = (base, el)
    seen, out = set(), []
    for q, p, sl, el in all_rows:
        if not q or not p or (q, p, sl) in seen:
            continue
        seen.add((q, p, sl))
        base, base_el = bases.get((q, p, sl), (None, el))
        out.append((q, p, docs.get((q, p, sl)), base, label, sl,
                    base_el if base_el is not None else el))
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

