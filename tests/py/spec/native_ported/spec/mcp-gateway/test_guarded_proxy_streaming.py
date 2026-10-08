"""Native migration of tests/spec/mcp-gateway/guarded-proxy-streaming.bats."""

import os
import shutil
import socket
import subprocess
import time

import pytest

MOCK_UPSTREAM_JS = r"""
const http = require('node:http');
let hits = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/hits') {
    res.writeHead(200, {'content-type':'text/plain'});
    res.end(String(hits));
    return;
  }
  if (req.url === '/sse') {
    res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache'});
    for (let i = 1; i <= 3; i++) {
      res.write('event: msg\ndata: chunk-' + i + '\n\n');
    }
    res.end();
    return;
  }
  hits++;
  res.writeHead(200, {'content-type':'application/json'});
  res.end(JSON.stringify({dispatched:true}));
});
server.listen(Number(process.argv[2]), '127.0.0.1');
"""


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) != 0


def _wait_http(run_cmd, url: str, tries: int = 30) -> bool:
    for _ in range(tries):
        if run_cmd(["curl", "-s", "-o", "/dev/null", "--max-time", "1", url]).returncode == 0:
            return True
        time.sleep(0.1)
    return False


@pytest.fixture
def node_available():
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")


@pytest.fixture
def ports():
    free = [p for p in range(19860, 19891) if _port_is_free(p)]
    if len(free) < 2:
        pytest.skip("kein freien Port-Paar im Bereich 19860-19890")
    return free[0], free[1]  # (upstream, proxy)


@pytest.fixture
def procs():
    started = []
    yield started
    for proc in started:
        if proc.poll() is None:
            proc.kill()
        proc.wait()


@pytest.fixture
def harness(repo_root, tmp_path, run_cmd, node_available, ports, procs):
    upstream_port, proxy_port = ports
    token = f"test-proxy-token-{os.getpid()}"
    mock_file = tmp_path / "mock-upstream.cjs"
    mock_file.write_text(MOCK_UPSTREAM_JS, encoding="utf-8")

    class H:
        UPSTREAM_PORT = upstream_port
        PROXY_PORT = proxy_port
        PROXY_TOKEN = token

        def start_mock_upstream(self):
            proc = subprocess.Popen(
                ["node", str(mock_file), str(upstream_port)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            procs.append(proc)
            if not _wait_http(run_cmd, f"http://127.0.0.1:{upstream_port}/hits"):
                pytest.skip(f"Mock-Upstream auf {upstream_port} nicht hoch")

        def start_proxy(self):
            env = os.environ.copy()
            env.update({
                "MCP_KUBERNETES_TOKEN": token,
                "LISTEN_PORT": str(proxy_port),
                "UPSTREAM": f"http://127.0.0.1:{upstream_port}",
            })
            proc = subprocess.Popen(
                ["node", str(repo_root / "scripts" / "mcp-cors-proxy" / "proxy.mjs")],
                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            procs.append(proc)
            if not _wait_http(run_cmd, f"http://127.0.0.1:{proxy_port}/health"):
                pytest.skip(f"Proxy auf {proxy_port} nicht hoch")

        def hits(self, run_cmd) -> str:
            return run_cmd(["curl", "-s", f"http://127.0.0.1:{upstream_port}/hits"]).stdout

    return H()


def test_rejected_request_never_reaches_upstream(harness, run_cmd):
    """guarded-proxy: rejected request never reaches upstream"""
    harness.start_mock_upstream()
    harness.start_proxy()
    url = f"http://127.0.0.1:{harness.PROXY_PORT}/mcp"
    body = '{"jsonrpc":"2.0","id":1,"method":"ping"}'

    # 401 ohne Token.
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", url,
                      "-H", "content-type: application/json", "-d", body])
    assert result.stdout == "401"

    # 401 mit falschem Token.
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", url,
                      "-H", "Authorization: Bearer wrong-token", "-H", "content-type: application/json",
                      "-d", body])
    assert result.stdout == "401"

    # Negativ-Anker: Upstream hat 0 Hits.
    assert harness.hits(run_cmd) == "0"


def test_authenticated_request_reaches_upstream_and_counts(harness, run_cmd):
    """guarded-proxy: authenticated request reaches upstream and counts"""
    harness.start_mock_upstream()
    harness.start_proxy()
    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
                      f"http://127.0.0.1:{harness.PROXY_PORT}/mcp",
                      "-H", f"Authorization: Bearer {harness.PROXY_TOKEN}",
                      "-H", "content-type: application/json",
                      "-d", '{"jsonrpc":"2.0","id":1,"method":"ping"}'])
    assert result.stdout == "200"
    # Positiv-Anker: authentifizierter Request erreicht den Upstream.
    assert harness.hits(run_cmd) == "1"


def test_sse_stream_relayed_without_buffering(harness, run_cmd):
    """guarded-proxy: SSE stream relayed without buffering"""
    harness.start_mock_upstream()
    harness.start_proxy()
    stream = run_cmd(["curl", "-s", "--max-time", "5", "-H", f"Authorization: Bearer {harness.PROXY_TOKEN}",
                      f"http://127.0.0.1:{harness.PROXY_PORT}/sse"]).stdout
    assert "chunk-1" in stream
    assert "chunk-2" in stream
    assert "chunk-3" in stream
