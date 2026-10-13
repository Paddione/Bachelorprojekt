"""Tests for MCP stdio protocol handler."""

import json
from components.python_sandbox.src.mcp_server import handle_request


def test_mcp_initialize():
    req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {},
    }
    resp = handle_request(req)
    assert resp is not None
    assert resp["id"] == 1
    assert resp["result"]["serverInfo"]["name"] == "devmesh-python-sandbox-mcp"


def test_mcp_tools_list():
    req = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {},
    }
    resp = handle_request(req)
    assert resp is not None
    tools = resp["result"]["tools"]
    tool_names = [t["name"] for t in tools]
    assert "sandbox_execute_python" in tool_names
    assert "sandbox_run_pytest" in tool_names


def test_mcp_tools_call_execute():
    req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "sandbox_execute_python",
            "arguments": {
                "code": "print('MCP_SANDBOX_SUCCESS')",
            },
        },
    }
    resp = handle_request(req)
    assert resp is not None
    assert resp["id"] == 3
    content = resp["result"]["content"][0]["text"]
    data = json.loads(content)
    assert data["success"] is True
    assert "MCP_SANDBOX_SUCCESS" in data["stdout"]
