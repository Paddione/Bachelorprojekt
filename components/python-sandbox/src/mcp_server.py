"""Model Context Protocol (MCP) Server for Python Sandbox.

Implements JSON-RPC 2.0 over Stdio (MCP protocol) to expose the sandbox directly
to AI agent harnesses (Claude, Codex, Antigravity, OpenCode, Qwen Orchestrator).
"""

from __future__ import annotations

import json
import sys
from typing import Any
from .engine import SandboxEngine


engine = SandboxEngine()

TOOLS = [
    {
        "name": "sandbox_execute_python",
        "description": "Execute Python code inside an isolated, airgapped Bubblewrap sandbox. Filesystem is ephemeral and network is disabled.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The Python source code to execute.",
                },
                "files": {
                    "type": "object",
                    "description": "Optional mapping of relative filenames to file contents placed into the sandbox workspace.",
                    "additionalProperties": {"type": "string"},
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Execution timeout in seconds (default 15, max 120).",
                    "default": 15,
                },
                "memory_limit_mb": {
                    "type": "integer",
                    "description": "Virtual memory limit in MB (default 512).",
                    "default": 512,
                },
            },
            "required": ["code"],
        },
    },
    {
        "name": "sandbox_run_pytest",
        "description": "Run a pytest test suite against source files inside an airgapped Bubblewrap sandbox.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "test_code": {
                    "type": "string",
                    "description": "Pytest test code (test functions and assertions).",
                },
                "source_files": {
                    "type": "object",
                    "description": "Source files to be tested (e.g. {'mymodule.py': 'def add(a, b): return a + b'}).",
                    "additionalProperties": {"type": "string"},
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Timeout in seconds (default 30).",
                    "default": 30,
                },
            },
            "required": ["test_code"],
        },
    },
]


def handle_request(req: dict[str, Any]) -> dict[str, Any] | None:
    method = req.get("method")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "devmesh-python-sandbox-mcp",
                    "version": "1.0.0",
                },
            },
        }

    elif method == "notifications/initialized":
        return None

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        }

    elif method == "tools/call":
        params = req.get("params", {})
        tool_name = params.get("name")
        args = params.get("arguments", {})

        if tool_name == "sandbox_execute_python":
            code = args.get("code", "")
            files = args.get("files", {})
            timeout = args.get("timeout_seconds", 15)
            mem_mb = args.get("memory_limit_mb", 512)

            res = engine.execute(
                code=code,
                files=files,
                timeout_seconds=timeout,
                memory_limit_mb=mem_mb,
            )
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(res.to_dict(), indent=2),
                        }
                    ],
                    "isError": not res.success,
                },
            }

        elif tool_name == "sandbox_run_pytest":
            test_code = args.get("test_code", "")
            source_files = args.get("source_files", {})
            timeout = args.get("timeout_seconds", 30)

            res = engine.run_pytest(
                test_code=test_code,
                source_files=source_files,
                timeout_seconds=timeout,
            )
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(res.to_dict(), indent=2),
                        }
                    ],
                    "isError": not res.success,
                },
            }

        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
            }

    else:
        if req_id is not None:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Unsupported method: {method}"},
            }
        return None


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
            if resp is not None:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except Exception as e:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {str(e)}"},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
