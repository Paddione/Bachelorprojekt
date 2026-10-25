#!/usr/bin/env python3
"""cbm-embed-enrich.py — Source excerpt extraction & candidate enrichment (T900993).

Split out of cbm-embed-sync.py (S1 filesize gate). Reads bounded checkout source
excerpts for span-carrying graph candidates and attaches them to embedding texts.
Standard library only.
"""

from __future__ import annotations

import os

BODY_LINES = 10
CODE_MAX = 500
SECTION_BODY_MAX = 800


def parse_span(value):
    """Graph start/end lines arrive as ints or numeric strings; anything
    else (None, '-', unparseable) is no span."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        v = value.strip().strip('"').strip("'")
        if v.isdigit():
            n = int(v)
            return n if n > 0 else None
    return None


def read_source_slice(root, path, start_line, end_line, max_chars=CODE_MAX,
                      max_lines=BODY_LINES):
    """Bounded source excerpt for a graph span, read from the checkout.

    1-based inclusive [start_line, end_line], truncated to max_lines then
    max_chars. Returns None (fail-safe, no exception) for missing files,
    path traversal outside root, binary content, bad spans or empty excerpts."""
    sl, el = parse_span(start_line), parse_span(end_line)
    if sl is None or el is None or el < sl:
        return None
    if not isinstance(root, str) or not root:
        return None
    if not isinstance(path, str) or not path or path.startswith("<"):
        return None
    norm = os.path.normpath(path.replace("\\", "/")).lstrip("/")
    if norm.startswith("..") or os.path.isabs(norm):
        return None
    try:
        real_root = os.path.realpath(root)
        full = os.path.realpath(os.path.join(real_root, norm))
        if full != real_root and not full.startswith(real_root + os.sep):
            return None
        with open(full, "r", encoding="utf-8", errors="strict") as fh:
            kept = []
            for i, line in enumerate(fh, 1):
                if i > el:
                    break
                if i >= sl:
                    if "\x00" in line:
                        return None
                    kept.append(line.rstrip("\n"))
                    if len(kept) >= max_lines:
                        break
    except (OSError, ValueError, UnicodeDecodeError):
        return None
    if not kept or sl > el:
        return None
    excerpt = "\n".join(kept).strip()
    if not excerpt:
        return None
    return excerpt[:max_chars].strip() or None


def rebuild_candidate_text(cand, body, composers):
    """Rebuild text for an enriched candidate using registered composers."""
    if not composers:
        return cand.get("text", "")
    kind = cand.get("kind")
    if kind == "function" and "function_text" in composers:
        qname = cand.get("symbol", "").split("#")[0]
        return composers["function_text"](qname, cand.get("doc"), cand.get("sig"), body)
    if kind == "method" and "method_text" in composers:
        qname = cand.get("symbol", "").split("#")[0]
        return composers["method_text"](qname, cand.get("doc"), cand.get("sig"),
                                        cand.get("parent"), body)
    if kind in ("class", "interface") and "class_text" in composers:
        symbol = cand.get("symbol", "").split("#")[0]
        qname = symbol
        header = (cand.get("text", "").split("\n") or [""])[0]
        if header.startswith("CLASS ") or header.startswith("INTERFACE "):
            qname = header.split(" ", 1)[1].split("#")[0]
        label = cand.get("label") or ("Interface" if kind == "interface" else "Class")
        return composers["class_text"](qname, cand.get("doc"), cand.get("base"), label, body)
    if kind == "section" and "section_text" in composers:
        qname = cand.get("qname") or cand.get("symbol", "")
        name = cand.get("name") or qname
        path = cand.get("path", "")
        start_line = cand.get("raw_start")
        if start_line is None:
            start_line = cand.get("start_line")
        end_line = cand.get("raw_end")
        if end_line is None:
            end_line = cand.get("end_line")
        return composers["section_text"](qname, name, path, start_line or "",
                                         end_line or "", body)
    if kind == "route" and "route_text" in composers:
        return composers["route_text"](cand.get("path"), cand.get("method"), body)
    return cand.get("text", "")


def enrich_candidates_with_source(root, candidates,
                                  code_chars=CODE_MAX,
                                  section_chars=SECTION_BODY_MAX,
                                  composers=None):
    """Attach checkout source bodies to span-carrying candidates."""
    out = []
    with_body, no_span, read_miss = 0, 0, 0
    for cand in candidates:
        kind, path = cand.get("kind"), cand.get("path")
        sl, el = cand.get("start_line"), cand.get("end_line")
        if sl is None or el is None:
            no_span += 1
            out.append(dict(cand))
            continue
        limit = section_chars if kind == "section" else code_chars
        body = read_source_slice(root, path, sl, el, max_chars=limit)
        if body is None:
            read_miss += 1
            out.append(dict(cand))
            continue
        with_body += 1
        text = rebuild_candidate_text(cand, body, composers)
        enriched = dict(cand)
        enriched["text"] = text
        enriched["body_chars"] = len(body)
        out.append(enriched)
    return out, {"with_body": with_body, "no_span": no_span,
                 "read_miss": read_miss}
