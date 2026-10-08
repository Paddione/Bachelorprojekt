"""Native migration of tests/local/MCP-TASK-RUNNER.bats."""
import json
import os
import shlex
import shutil
import stat
from pathlib import Path

import pytest

BINARY = "/usr/local/bin/mcp-task-runner"

FAKE_TASK = """#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == "--json" ]]; then
    echo '{"tasks":[{"name":"workspace:deploy","desc":"Deploy","deps":[]},{"name":"workspace:post-setup","desc":"Post setup","deps":["workspace:deploy"]}]}'
    exit 0
  fi
done
echo "running: $*"
exit 0
"""

TASKFILE = """version: '3'
tasks:
  noop:
    desc: "no-op task for tests"
    cmds:
      - echo ok
"""


@pytest.fixture
def runner_env(tmp_path, monkeypatch):
    """Create a fake Taskfile and a stub `task` binary, prepended to PATH."""
    if not (os.path.isfile(BINARY) and os.access(BINARY, os.X_OK)):
        pytest.skip(f"{BINARY} is not installed")
    fake_dir = tmp_path / "fake"
    bin_dir = fake_dir / "bin"
    bin_dir.mkdir(parents=True)
    taskfile = fake_dir / "Taskfile.yml"
    taskfile.write_text(TASKFILE, encoding="utf-8")
    task_stub = bin_dir / "task"
    task_stub.write_text(FAKE_TASK, encoding="utf-8")
    task_stub.chmod(task_stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    path = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"
    return {"taskfile": str(taskfile), "env": {"PATH": path}}


def _mcp(run_cmd, ctx, payload: str):
    """Send one JSON-RPC line to the server and capture stdout (stderr discarded)."""
    cmd = (
        f"printf '%s\\n' {shlex.quote(payload)} | "
        f"{BINARY} --taskfile {shlex.quote(ctx['taskfile'])} 2>/dev/null"
    )
    return run_cmd(cmd, env=ctx["env"], timeout=60)


def _inner(result):
    """Parse the JSON payload carried in result.content[0].text."""
    envelope = json.loads(result.stdout)
    return json.loads(envelope["result"]["content"][0]["text"])


def test_mcp_task_runner_001_tools_list_returns_exactly_3_tools(runner_env, run_cmd):
    """MCP-TASK-RUNNER-001: tools/list returns exactly 3 tools (plan_tasks, run_task, execute_plan)"""
    result = _mcp(run_cmd, runner_env, '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
    assert result.returncode == 0
    tools = json.loads(result.stdout)["result"]["tools"]
    assert len(tools) == 3
    names = [tool["name"] for tool in tools]
    for expected in ("plan_tasks", "run_task", "execute_plan"):
        assert expected in names


def test_mcp_task_runner_002_plan_tasks_same_named_tasks_group_into_one_parallel_group(
    runner_env, run_cmd
):
    """MCP-TASK-RUNNER-002: plan_tasks with two same-named tasks (different env) groups them into one parallel group"""
    req = (
        '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_tasks",'
        '"arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},'
        '{"task":"workspace:deploy","env":"korczewski"}]}}}'
    )
    result = _mcp(run_cmd, runner_env, req)
    assert result.returncode == 0
    envelope = json.loads(result.stdout)
    assert not envelope["result"].get("isError", False)
    inner = _inner(result)
    assert len(inner["groups"]) == 1
    assert len(inner["groups"][0]["tasks"]) == 2


def test_mcp_task_runner_003_run_task_with_exit_0_returns_exit_code_0_and_trace_id(
    runner_env, run_cmd
):
    """MCP-TASK-RUNNER-003: run_task with a fake task that exits 0 returns exit_code 0 and a trace_id"""
    req = (
        '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_task",'
        '"arguments":{"task":"workspace:deploy","env":"mentolder"}}}'
    )
    result = _mcp(run_cmd, runner_env, req)
    assert result.returncode == 0
    envelope = json.loads(result.stdout)
    assert not envelope["result"].get("isError", False)
    inner = _inner(result)
    assert inner["exit_code"] == 0
    trace_id = inner.get("trace_id") or ""
    assert isinstance(trace_id, str) and trace_id != ""


def test_mcp_task_runner_004_binary_is_on_path_and_help_exits_0(run_cmd):
    """MCP-TASK-RUNNER-004: binary is on PATH and --help exits 0"""
    found = shutil.which("mcp-task-runner")
    if found is None:
        pytest.skip("mcp-task-runner is not on PATH")
    assert os.access(found, os.X_OK)
    result = run_cmd(["mcp-task-runner", "--help"], timeout=60)
    assert result.returncode == 0
    assert "taskfile" in result.output
