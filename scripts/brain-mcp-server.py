#!/usr/bin/env python3
"""Standard-library MCP stdio adapter for the shared Brain index."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "brain-mcp"
SERVER_VERSION = "1.1.0"


def load_index_module():
    path = Path(__file__).with_name("brain-index.py")
    spec = importlib.util.spec_from_file_location("brain_index", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load Brain index")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


INDEX_MODULE = load_index_module()
BrainIndex = INDEX_MODULE.BrainIndex


def ok(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def fail(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def write_msg(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


TOOLS = [
    {
        "name": "brain_search",
        "description": "Search Brain pages with BM25 ranking and optional lifecycle filters.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "top_k": {"type": "integer", "minimum": 1, "description": "Maximum results (default 5)."},
                "type": {"type": "string", "description": "Exact page type filter."},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "All required tags."},
                "status": {"type": "string", "description": "Exact status filter."},
                "source_kind": {"type": "string", "description": "Exact source kind filter."},
                "as_of": {"type": "string", "description": "ISO-8601 validity instant."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "brain_read",
        "description": "Read a complete Brain page by slug.",
        "inputSchema": {
            "type": "object",
            "properties": {"slug": {"type": "string", "description": "Filename without .md."}},
            "required": ["slug"],
        },
    },
]


class ArgumentError(ValueError):
    """Invalid MCP tool arguments."""


def search_arguments(arguments: Any) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        raise ArgumentError("arguments must be an object")
    allowed = {"query", "top_k", "type", "tags", "status", "source_kind", "as_of"}
    if set(arguments) - allowed:
        raise ArgumentError("unknown brain_search argument")
    query = arguments.get("query")
    if not isinstance(query, str):
        raise ArgumentError("query must be a string")
    top_k = arguments.get("top_k", 5)
    if isinstance(top_k, bool) or not isinstance(top_k, int) or top_k < 1:
        raise ArgumentError("top_k must be a positive integer")
    tags = arguments.get("tags")
    if tags is not None and (not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags)):
        raise ArgumentError("tags must be a string array")
    for key in ("type", "status", "source_kind", "as_of"):
        if key in arguments and not isinstance(arguments[key], str):
            raise ArgumentError(f"{key} must be a string")
    if arguments.get("as_of") is not None:
        try:
            INDEX_MODULE.parse_datetime(arguments["as_of"])
        except ValueError as exc:
            raise ArgumentError("as_of must be ISO-8601") from exc
    return {"query": query, "top_k": top_k, "page_type": arguments.get("type"),
            "tags": tags, "status": arguments.get("status"),
            "source_kind": arguments.get("source_kind"), "as_of": arguments.get("as_of")}


def handle_tool(request_id: Any, params: Any, index: BrainIndex, wiki_dir: Path) -> dict[str, Any]:
    if not isinstance(params, dict):
        return fail(request_id, -32602, "Invalid params")
    name, arguments = params.get("name"), params.get("arguments", {})
    if name == "brain_search":
        try:
            parsed = search_arguments(arguments)
            results = index.search(**parsed)
        except ArgumentError as exc:
            return fail(request_id, -32602, str(exc))
        content = json.dumps({"results": results}, ensure_ascii=False)
        return ok(request_id, {"content": [{"type": "text", "text": content}]})
    if name == "brain_read":
        if not isinstance(arguments, dict) or not isinstance(arguments.get("slug"), str):
            return fail(request_id, -32602, "slug must be a string")
        page = index.read_page(arguments["slug"])
        if page is None:
            return fail(request_id, -32000, f"Page not found: '{arguments['slug']}' (searched in {wiki_dir})")
        return ok(request_id, {"content": [{"type": "text", "text": json.dumps(page, ensure_ascii=False)}]})
    return fail(request_id, -32601, f"Tool not found: {name}")


def main() -> None:
    wiki_dir = Path(os.environ.get("BRAIN_WIKI_DIR", "~/brain/wiki")).expanduser()
    index = BrainIndex(wiki_dir)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            write_msg(fail(None, -32700, "Parse error"))
            continue
        request_id = message.get("id")
        method = message.get("method", "")
        try:
            if method == "initialize":
                write_msg(ok(request_id, {"protocolVersion": PROTOCOL_VERSION,
                                          "capabilities": {"tools": {}},
                                          "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION}}))
            elif method in {"notifications/initialized", "notifications/cancelled"}:
                continue
            elif method == "ping":
                write_msg(ok(request_id, {}))
            elif method == "tools/list":
                write_msg(ok(request_id, {"tools": TOOLS}))
            elif method == "tools/call":
                write_msg(handle_tool(request_id, message.get("params", {}), index, wiki_dir))
            else:
                write_msg(fail(request_id, -32601, f"Method not found: {method}"))
        except Exception as exc:
            write_msg(fail(request_id, -32603, f"Internal error: {exc}"))


if __name__ == "__main__":
    main()
