#!/usr/bin/env python3
"""
brain-mcp-server.py — MCP stdio server for Brain Wiki retrieval (T002679, D6).

Provides brain_search(query, top_k) with BM25 ranking and brain_read(slug) for
full page retrieval. Communicates via JSON-RPC over stdin/stdout, one message
per line. Standard library only — no `mcp` SDK dependency.

Env:
    BRAIN_WIKI_DIR — Path to the wiki directory (default: ~/brain/wiki)

Reference: scripts/bge-mcp/server.mjs (ok()/fail() pattern, tools/list template)

Ticket: T002679
"""
import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "brain-mcp"
SERVER_VERSION = "1.0.0"

# ── Utility functions (modeled after bge-mcp's ok()/fail() pattern) ────────

def ok(req_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}

def fail(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

def write_msg(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()

# ── Brain Wiki index ────────────────────────────────────────────────────────

class BrainIndex:
    """In-memory index of all wiki pages with BM25 support."""

    def __init__(self, wiki_dir: Path):
        self.wiki_dir = wiki_dir
        self.pages: dict[str, dict] = {}  # slug -> {frontmatter, body, path, title, tags}
        self._built = False  # True after a successful build (see _ensure_fresh)
        self._mtimes: dict[str, int] = {}  # page path -> mtime_ns snapshot (staleness check)
        self._build_index()

    def _parse_frontmatter(self, content: str) -> tuple[dict, str]:
        """Split frontmatter and body from markdown content."""
        parts = content.split("---", 2)
        fm = {}
        if len(parts) >= 3:
            for line in parts[1].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    k = k.strip()
                    v = v.strip()
                    # Handle YAML list: tags: [a, b, c]
                    if v.startswith("[") and v.endswith("]"):
                        v = [t.strip().strip("'\"") for t in v[1:-1].split(",") if t.strip()]
                    fm[k] = v
            body = parts[2].strip()
        else:
            body = content.strip()
        return fm, body

    def _build_index(self) -> None:
        """Scan wiki directory and index all .md files."""
        wiki = Path(self.wiki_dir).expanduser()
        if not wiki.is_dir():
            sys.stderr.write(f"[brain-mcp] WARNING: wiki dir not found: {wiki}\n")
            sys.stderr.flush()
            return

        self._mtimes = {}
        for fpath in sorted(wiki.rglob("*.md")):
            slug = fpath.stem
            try:
                content = fpath.read_text()
            except Exception:
                continue
            fm, body = self._parse_frontmatter(content)
            title = fm.get("title", slug)
            tags = fm.get("tags", [])
            if isinstance(tags, str):
                tags = [tags]

            self.pages[slug] = {
                "frontmatter": fm,
                "body": body,
                "path": str(fpath),
                "title": title,
                "tags": tags,
            }
            try:
                self._mtimes[str(fpath)] = fpath.stat().st_mtime_ns
            except OSError:
                pass

        self._built = True
        sys.stderr.write(f"[brain-mcp] indexed {len(self.pages)} pages from {wiki}\n")
        sys.stderr.flush()

    def _wiki_changed(self) -> bool:
        """True if the wiki content changed since the last build (mtime snapshot)."""
        wiki = Path(self.wiki_dir).expanduser()
        if not wiki.is_dir():
            return False
        current = {str(p): p.stat().st_mtime_ns for p in wiki.rglob("*.md")}
        return current != self._mtimes

    def _ensure_fresh(self) -> None:
        """Rebuild the index if the wiki appeared or changed after startup.

        The index is built once in __init__; a server started before the wiki
        clone (or before an auto-ingest run) would otherwise serve an empty or
        stale index until restart. Rebuild lazily on the next request instead.
        """
        wiki = Path(self.wiki_dir).expanduser()
        if not wiki.is_dir():
            return
        if self._built and not self._wiki_changed():
            return
        self._build_index()

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """BM25-ranked search over indexed pages."""
        self._ensure_fresh()
        if not self.pages:
            return []

        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        # Build document-term index
        k1, b = 1.5, 0.75
        doc_terms: dict[str, dict[str, int]] = {}  # slug -> {term: tf}
        doc_lengths: dict[str, int] = {}
        df: dict[str, int] = defaultdict(int)  # document frequency

        for slug, page in self.pages.items():
            # Tokenize title, tags, and body together (title/tags carry extra weight
            # naturally through higher token frequency in short fields)
            text = page["title"] + " " + " ".join(page.get("tags", [])) + " " + page["body"]
            tokens = self._tokenize(text)
            doc_lengths[slug] = len(tokens)

            tf = defaultdict(int)
            for t in tokens:
                tf[t] += 1
            doc_terms[slug] = dict(tf)
            for t in set(tokens):
                df[t] += 1

        N = len(self.pages)
        avg_dl = sum(doc_lengths.values()) / max(N, 1)

        scores = {}
        for slug in self.pages:
            score = 0.0
            dl = doc_lengths.get(slug, 0)
            for term in query_terms:
                tf_td = doc_terms.get(slug, {}).get(term, 0)
                if tf_td == 0:
                    continue
                idf = math.log((N - df.get(term, 0) + 0.5) / (df.get(term, 0) + 0.5) + 1.0)
                numerator = tf_td * (k1 + 1)
                denominator = tf_td + k1 * (1 - b + b * dl / max(avg_dl, 1))
                score += idf * numerator / max(denominator, 0.001)
            if score > 0:
                scores[slug] = score

        # Sort by score descending
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        results = []
        for slug, score in ranked:
            page = self.pages[slug]
            snippet = self._extract_snippet(page["body"], query_terms)
            results.append({
                "slug": slug,
                "score": round(score, 4),
                "title": page["title"],
                "snippet": snippet,
            })

        return results

    def _extract_snippet(self, body: str, query_terms: list[str], radius: int = 100) -> str:
        """Extract a snippet around the best query term match."""
        body_lower = body.lower()
        best_pos = -1
        for term in query_terms:
            pos = body_lower.find(term)
            if pos >= 0 and (best_pos < 0 or pos < best_pos):
                best_pos = pos

        if best_pos < 0:
            # No term found — return first ~200 chars
            return body[:200] + ("..." if len(body) > 200 else "")

        start = max(0, best_pos - radius)
        end = min(len(body), best_pos + radius)

        snippet = body[start:end]
        # Trim to word boundaries
        if start > 0:
            snippet = "…" + snippet
            # Find first word boundary
            space = snippet.find(" ", 1)
            if space > 0 and space < 20:
                snippet = snippet[space + 1:]
        if end < len(body):
            snippet = snippet + "…"

        return snippet

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Tokenize text to lowercase word tokens."""
        return [t.lower() for t in re.findall(r'\w+', text) if len(t) > 1]

    def read_page(self, slug: str) -> dict | None:
        """Return full page data for a slug."""
        self._ensure_fresh()
        if slug not in self.pages:
            return None
        page = self.pages[slug]
        return {
            "slug": slug,
            "frontmatter": page["frontmatter"],
            "body": page["body"],
            "path": page["path"],
        }


# ── Tool definitions ────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "brain_search",
        "description": (
            "Search the Brain Wiki with BM25 ranking. Returns up to top_k results with "
            "slug, score, title, and a snippet around the best match."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (natural language or keywords).",
                },
                "top_k": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Maximum number of results to return (default: 5).",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "brain_read",
        "description": (
            "Read a Brain Wiki page by slug. Returns frontmatter, body, and file path."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": "Page slug (filename without .md extension).",
                },
            },
            "required": ["slug"],
        },
    },
]

# ── Main RPC loop ───────────────────────────────────────────────────────────

def main() -> None:
    wiki_dir = Path("~/brain/wiki").expanduser()
    if "BRAIN_WIKI_DIR" in os.environ:
        wiki_dir = Path(os.environ["BRAIN_WIKI_DIR"])

    index = BrainIndex(wiki_dir)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            write_msg(fail(None, -32700, "Parse error"))
            continue

        req_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params", {})

        try:
            if method == "initialize":
                result = {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": SERVER_NAME,
                        "version": SERVER_VERSION,
                    },
                }
                write_msg(ok(req_id, result))

            elif method == "notifications/initialized":
                # No response
                pass

            elif method == "notifications/cancelled":
                # No response
                pass

            elif method == "ping":
                write_msg(ok(req_id, {}))

            elif method == "tools/list":
                write_msg(ok(req_id, {"tools": TOOLS}))

            elif method == "tools/call":
                tool_name = params.get("name", "")
                tool_args = params.get("arguments", {})

                if tool_name == "brain_search":
                    query = tool_args.get("query", "")
                    top_k = tool_args.get("top_k", 5)
                    results = index.search(query, top_k)
                    content = json.dumps({"results": results}, ensure_ascii=False)
                    write_msg(ok(req_id, {
                        "content": [{"type": "text", "text": content}],
                    }))

                elif tool_name == "brain_read":
                    slug = tool_args.get("slug", "")
                    page = index.read_page(slug)
                    if page is None:
                        write_msg(fail(req_id, -32000,
                            f"Page not found: '{slug}' (searched in {wiki_dir})"))
                    else:
                        content = json.dumps(page, ensure_ascii=False)
                        write_msg(ok(req_id, {
                            "content": [{"type": "text", "text": content}],
                        }))

                else:
                    write_msg(fail(req_id, -32601,
                        f"Tool not found: {tool_name}"))

            else:
                write_msg(fail(req_id, -32601,
                    f"Method not found: {method}"))

        except Exception as e:
            write_msg(fail(req_id, -32603, f"Internal error: {e}"))


if __name__ == "__main__":
    main()
