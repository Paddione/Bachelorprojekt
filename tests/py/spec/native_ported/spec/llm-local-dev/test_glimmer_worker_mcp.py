"""Native migration of tests/spec/llm-local-dev/glimmer-worker-mcp.bats."""

import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

TOKEN = "test-token"

OPENCODE_STUB = """#!/usr/bin/env bash
printf '%s\\n' "$@" > "__T__/argv"
# opencode v2: kein --dir mehr, Arbeitsverzeichnis ist das cwd (T900729).
for a in "$@"; do [ "$a" = "--dir" ] && { echo "Unrecognized flag: --dir" >&2; exit 1; }; done
dir="$PWD"
printf '%s\\n' "$PWD" > "__T__/cwd"
last="${@: -1}"
if [ "$last" = "slow" ]; then
  # Tool-Kindprozess, der nach dem Timeout noch schreiben wuerde (Prozessgruppen-Kill).
  ( sleep 4; echo late > "$dir/late.txt" ) &
  sleep 60
fi
echo edited >> "$dir/worked.txt"
echo "worker done"
"""


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _http(url, body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers or {})
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


class Ctx:
    def __init__(self, gw_dir, t_dir, port):
        self.gw_dir = gw_dir
        self.t_dir = t_dir
        self.port = port

    def rpc(self, method, params=None):
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
        _, text = _http(
            f"http://127.0.0.1:{self.port}/mcp", body, {"Authorization": f"Bearer {TOKEN}"}
        )
        return json.loads(text).get("result")

    def call(self, name, args):
        return self.rpc("tools/call", {"name": name, "arguments": args})


@pytest.fixture(scope="module")
def ctx(repo_root, tmp_path_factory):
    t_dir = tmp_path_factory.mktemp("glimmer-worker")
    gw_dir = repo_root / "scripts" / "glimmer-worker-mcp"
    port = _free_port()
    (t_dir / "bin").mkdir()
    (t_dir / "repo").mkdir()
    (t_dir / "nogit").mkdir()
    stub = t_dir / "bin" / "opencode"
    stub.write_text(OPENCODE_STUB.replace("__T__", str(t_dir)))
    stub.chmod(0o755)
    repo = t_dir / "repo"
    (repo / "README").write_text("base\n")
    git = ["git", "-C", str(repo)]
    subprocess.run(git + ["init", "-q"], check=True)
    subprocess.run(git + ["add", "README"], check=True)
    subprocess.run(git + ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], check=True)

    server = None
    if (gw_dir / "server.mjs").is_file():
        env = dict(os.environ)
        env.update(
            {
                "GLIMMER_WORKER_OPENCODE": str(stub),
                "GLIMMER_WORKER_MCP_PORT": str(port),
                "GLIMMER_WORKER_MCP_TOKEN": TOKEN,
                "GLIMMER_WORKER_LLAMA_URL": "http://127.0.0.1:9",
                "GLIMMER_WORKER_TIMEOUT_FLOOR_S": "1",
            }
        )
        server = subprocess.Popen(
            ["node", str(gw_dir / "server.mjs")],
            env=env,
            stdout=open(t_dir / "server.log", "w"),
            stderr=subprocess.STDOUT,
        )
        for _ in range(50):
            try:
                code, _ = _http(f"http://127.0.0.1:{port}/health", timeout=2)
                if code == 200:
                    break
            except OSError:
                pass
            time.sleep(0.1)

    yield Ctx(gw_dir, t_dir, port)

    if server is not None:
        server.kill()
        server.wait()


def _job_id(result):
    return json.loads(result["content"][0]["text"]).get("job_id")


def test_health_endpoint_answers_positive_anchor(ctx):
    code, text = _http(f"http://127.0.0.1:{ctx.port}/health")
    assert code == 200
    assert json.loads(text).get("ok") is True


def test_tools_list_requires_the_bearer_token_and_lists_exactly_three_tools(ctx):
    code, _ = _http(
        f"http://127.0.0.1:{ctx.port}/mcp",
        {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
    )
    assert code == 401
    names = sorted(t["name"] for t in ctx.rpc("tools/list")["tools"])
    assert ",".join(names) == "glimmer_worker_result,glimmer_worker_start,glimmer_worker_status"


def test_a_job_runs_bp_build_in_the_repo_and_reports_the_diff(ctx):
    repo = ctx.t_dir / "repo"
    start = ctx.call("glimmer_worker_start", {"task": "fix it", "cwd": str(repo)})
    assert not start.get("isError", False)
    job = _job_id(start)
    assert job

    res = ctx.call("glimmer_worker_result", {"job_id": job, "wait_s": 20})
    result = json.loads(res["content"][0]["text"])
    assert result.get("status") == "done"
    assert str(result.get("exit_code")) == "0"
    git_status = result.get("git_status")
    git_text = "\n".join(git_status) if isinstance(git_status, list) else str(git_status)
    assert "worked.txt" in git_text
    assert "worker done" in str(result.get("summary"))

    argv = (ctx.t_dir / "argv").read_text().splitlines()
    assert "--agent" in argv
    assert "bp-build" in argv
    assert "--dir" not in argv
    assert (ctx.t_dir / "cwd").read_text().strip() == str(repo)


def test_a_timeout_ends_the_whole_process_group_including_tool_children(ctx):
    slow = ctx.t_dir / "slowrepo"
    slow.mkdir()
    subprocess.run(["git", "-C", str(slow), "init", "-q"], check=True)
    start = ctx.call("glimmer_worker_start", {"task": "slow", "cwd": str(slow), "timeout_s": 2})
    job = _job_id(start)
    assert job
    res = ctx.call("glimmer_worker_result", {"job_id": job, "wait_s": 20})
    assert json.loads(res["content"][0]["text"]).get("status") == "timeout"
    # Das Kind haette nach 4 s geschrieben; der Gruppen-Kill nach 2 s verhindert das.
    time.sleep(4)
    assert not (slow / "late.txt").exists()


def test_a_cwd_outside_a_git_working_tree_is_refused(ctx):
    out = ctx.call("glimmer_worker_start", {"task": "x", "cwd": str(ctx.t_dir / "nogit")})
    assert out.get("isError") is True


def test_windows_and_unc_paths_map_to_wsl_paths(ctx, run_cmd):
    script = (
        "\n    import { toWslPath } from '" + str(ctx.gw_dir / "lib.mjs") + "';\n"
        "    for (const p of ['C:\\\\Users\\\\x\\\\repo', '\\\\\\\\wsl.localhost\\\\k3d-dev\\\\home\\\\x\\\\repo', '/home/x/repo']) console.log(toWslPath(p));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0
    lines = res.output.splitlines()
    assert lines[0] == "/mnt/c/Users/x/repo"
    assert lines[1] == "/home/x/repo"
    assert lines[2] == "/home/x/repo"


def test_status_reports_an_unreachable_llama_server_without_failing(ctx):
    out = ctx.call("glimmer_worker_status", {})
    assert not out.get("isError", False)
    assert json.loads(out["content"][0]["text"])["llama"]["ok"] is False


def test_installer_registers_the_worker_in_muse_settings_without_losing_entries(ctx, run_cmd):
    a = ctx.t_dir / "muse-a.json"
    b = ctx.t_dir / "muse-b.json"
    a.write_text('{"schema_version":1,"mcpServers":{"mcp-postgres":{"type":"http","url":"http://localhost:13001/mcp"}}}\n')
    b.write_text('{"schema_version":1,"provider":"meta"}\n')
    (ctx.t_dir / "cfg").mkdir()
    env_file = ctx.t_dir / "cfg" / "server.env"
    env_file.write_text("GLIMMER_WORKER_MCP_TOKEN=tok123\n")
    res = run_cmd(
        ["bash", str(ctx.gw_dir / "install.sh"), "--register-only"],
        env={"GLIMMER_WORKER_MUSE_SETTINGS": f"{a} {b}", "GLIMMER_WORKER_ENV_FILE": str(env_file)},
    )
    assert res.returncode == 0, res.output
    for f in (a, b):
        data = json.loads(f.read_text())
        assert data["mcpServers"]["glimmer-worker"]["url"] == "http://127.0.0.1:13007/mcp"
        assert data["mcpServers"]["glimmer-worker"]["headers"]["Authorization"] == "Bearer tok123"
        assert (ctx.t_dir / (f.name + ".bak")).is_file()
    assert json.loads(a.read_text())["mcpServers"]["mcp-postgres"]["url"] == "http://localhost:13001/mcp"
    assert json.loads(b.read_text())["provider"] == "meta"
    # Das Token erscheint nie in der Ausgabe des Installers.
    assert "tok123" not in res.output


def test_the_mcp_registry_does_not_list_the_worker(repo_root):
    registry = (repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml").read_text()
    assert "mcp-kubernetes" in registry
    assert "glimmer-worker" not in registry
