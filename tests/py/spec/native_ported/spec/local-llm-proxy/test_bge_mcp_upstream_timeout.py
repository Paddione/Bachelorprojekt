"""Native migration of tests/spec/local-llm-proxy/bge-mcp-upstream-timeout.bats."""

import random
import subprocess
import time

import pytest

MCP_HEADERS = [
    "-H", "Accept: application/json, text/event-stream",
    "-H", "Content-Type: application/json",
]

INIT_BODY = (
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18",'
    '"capabilities":{},"clientInfo":{"name":"bats","version":"1"}}}'
)
EMBED_BODY_2 = '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bge_embed","arguments":{"texts":["ping"]}}}'
EMBED_BODY_3 = '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"bge_embed","arguments":{"texts":["ping"]}}}'

STUB_UPSTREAM_JS = """
const fs = require('fs');
const http = require('http');
const out = process.argv[2];
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer proxy-secret') {
    res.writeHead(401); return res.end('unauthorized');
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }));
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(out, String(server.address().port)));
"""


def _wait_for_mcp(run_cmd, port):
    for _ in range(30):
        res = run_cmd(["curl", "-s", "--max-time", "1", "-o", "/dev/null", f"http://127.0.0.1:{port}/mcp"])
        if res.returncode == 0:
            return
        time.sleep(0.2)


def _start_mcp(repo_root, env):
    return subprocess.Popen(
        ["node", str(repo_root / "scripts/bge-mcp/server.mjs")],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _post(run_cmd, port, body, max_time=10):
    return run_cmd(
        ["curl", "-s", "--max-time", str(max_time), "-X", "POST", f"http://127.0.0.1:{port}/mcp",
         "-H", "Authorization: Bearer testtoken", *MCP_HEADERS, "-d", body],
    )


def _kill(*procs):
    for p in procs:
        if p is None:
            continue
        try:
            p.kill()
            p.wait(timeout=5)
        except Exception:
            pass


@pytest.fixture
def hang_upstream(repo_root, run_cmd):
    """Upstream that accepts connections and never answers."""
    port = 20000 + random.randrange(1000)
    proc = subprocess.Popen(
        ["node", "-e", f"require('http').createServer(() => {{}}).listen({port}, '127.0.0.1');"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.5)
    yield port
    _kill(proc)


@pytest.fixture
def mcp_timeout_shim(repo_root, run_cmd, hang_upstream):
    import os

    port = 21000 + random.randrange(1000)
    env = dict(os.environ)
    env.update({
        "BGE_MCP_TOKEN": "testtoken",
        "BGE_MCP_PORT": str(port),
        "BGE_MCP_UPSTREAM_TIMEOUT_MS": "800",
        "LLM_EMBED_URL": f"http://127.0.0.1:{hang_upstream}",
        "LLM_RERANKER_URL": f"http://127.0.0.1:{hang_upstream}",
    })
    proc = _start_mcp(repo_root, env)
    _wait_for_mcp(run_cmd, port)
    yield port
    _kill(proc)


def test_bge_mcp_upstream_timeout_bge_embed_bricht_bei_schweigendem_upstream_ab_statt_zu_haengen(run_cmd, mcp_timeout_shim):
    port = mcp_timeout_shim
    # Positiv-Anker: der Shim muss antworten.
    res = _post(run_cmd, port, INIT_BODY)
    assert res.returncode == 0, res.output
    assert '"serverInfo"' in res.output, f"Shim antwortet nicht auf initialize: {res.output}"

    # Der eigentliche Vorgang: der Aufruf muss innerhalb der curl-Frist zurueckkehren.
    res = _post(run_cmd, port, EMBED_BODY_2)
    assert res.returncode == 0, f"curl lief in den Timeout (status={res.returncode}) — der Shim haengt weiterhin"
    assert "did not answer within" in res.output, f"keine Timeout-Diagnose in der Antwort: {res.output}"


def test_bge_mcp_upstream_timeout_bge_embed_reicht_den_optionalen_llm_proxy_bearer_an_den_upstream_weiter(run_cmd, repo_root, tmp_path):
    import os

    port_file = tmp_path / "port"
    stub = subprocess.Popen(
        ["node", "-", str(port_file)],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    stub.stdin.write(STUB_UPSTREAM_JS)
    stub.stdin.close()
    for _ in range(30):
        if port_file.exists() and port_file.stat().st_size > 0:
            break
        time.sleep(0.1)
    auth_port_upstream = port_file.read_text().strip()

    auth_mcp_port = 22000 + random.randrange(1000)
    env = dict(os.environ)
    env.update({
        "BGE_MCP_TOKEN": "testtoken",
        "BGE_MCP_PORT": str(auth_mcp_port),
        "LLM_PROXY_ADMIN_TOKEN": "proxy-secret",
        "LLM_EMBED_URL": f"http://127.0.0.1:{auth_port_upstream}",
        "LLM_RERANKER_URL": f"http://127.0.0.1:{auth_port_upstream}",
    })
    shim = _start_mcp(repo_root, env)
    try:
        _wait_for_mcp(run_cmd, auth_mcp_port)
        res = _post(run_cmd, auth_mcp_port, EMBED_BODY_3)
    finally:
        _kill(shim, stub)

    assert res.returncode == 0, res.output
    assert 'dimensions\\":2' in res.output, f"Embedding kam nicht mit internem Bearer durch: {res.output}"
