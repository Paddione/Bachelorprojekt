"""Native migration of tests/spec/mcp-task-runner.bats."""

import json
import shutil
import subprocess

import pytest

BINARY = "/usr/local/bin/mcp-task-runner"


@pytest.fixture
def mtr(tmp_path, monkeypatch):
    """BATS setup: Fake-Taskfile, list.json und fake `task` auf PATH."""
    fake = tmp_path
    taskfile = fake / "Taskfile.yml"
    taskfile.write_text("version: '3'\ntasks:\n  noop:\n    desc: \"no-op task for tests\"\n    cmds:\n      - echo ok\n",
                        encoding="utf-8")
    list_json = {"tasks": [
        {"name": "workspace:deploy", "desc": "Deploy", "deps": [], "location": {"taskfile": str(taskfile)}},
        {"name": "workspace:post-setup", "desc": "Post setup", "deps": ["workspace:deploy"],
         "location": {"taskfile": str(taskfile)}},
    ]}
    (fake / "list.json").write_text(json.dumps(list_json), encoding="utf-8")
    (fake / "bin").mkdir()
    task = fake / "bin" / "task"
    task.write_text(
        "#!/bin/bash\n"
        "for arg in \"$@\"; do\n"
        "  if [[ \"$arg\" == \"--json\" ]]; then\n"
        "    cat \"$FAKE_DIR/list.json\"\n"
        "    exit 0\n"
        "  fi\n"
        "done\n"
        "echo \"running: $*\"\n"
        "exit 0\n",
        encoding="utf-8",
    )
    task.chmod(0o755)
    path = f"{fake / 'bin'}:{__import__('os').environ.get('PATH', '')}"
    monkeypatch.setenv("PATH", path)
    monkeypatch.setenv("FAKE_DIR", str(fake))
    return {"taskfile": str(taskfile), "env": {"PATH": path, "FAKE_DIR": str(fake)}}


def _mcp(mtr, message: str):
    """Ein JSON-RPC-Request an den Server; stderr verworfen (2>/dev/null)."""
    completed = subprocess.run(
        [BINARY, "--taskfile", mtr["taskfile"]],
        input=message + "\n", stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        env={**__import__("os").environ, **mtr["env"]}, timeout=60,
    )
    return completed


def test_mcp_task_runner_001_tools_list_returns_all_7_tools(mtr):
    """MCP-TASK-RUNNER-001: tools/list returns all 7 tools (plan_tasks, run_task, execute_plan, get_task_graph, run_task_async, cancel_task, get_task_result)"""
    r = _mcp(mtr, '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
    assert r.returncode == 0
    data = json.loads(r.stdout)
    tools = data["result"]["tools"]
    assert len(tools) == 7
    names = {t["name"] for t in tools}
    assert {"plan_tasks", "run_task", "execute_plan", "get_task_graph", "run_task_async",
            "cancel_task", "get_task_result"} <= names


def test_mcp_task_runner_002_plan_tasks_with_two_same_named_tasks_groups_them_into_one_parallel_group(mtr):
    """MCP-TASK-RUNNER-002: plan_tasks with two same-named tasks (different env) groups them into one parallel group"""
    req = ('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_tasks","arguments":'
           '{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:deploy","env":"korczewski"}]}}}')
    r = _mcp(mtr, req)
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert not data["result"].get("isError", False)
    inner = json.loads(data["result"]["content"][0]["text"])
    assert len(inner["groups"]) == 1
    assert len(inner["groups"][0]["tasks"]) == 2


def test_mcp_task_runner_003_run_task_with_a_fake_task_that_exits_0_returns_exit_code_0_and_a_trace_id(mtr):
    """MCP-TASK-RUNNER-003: run_task with a fake task that exits 0 returns exit_code 0 and a trace_id"""
    req = ('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_task","arguments":'
           '{"task":"workspace:deploy","env":"mentolder"}}}')
    r = _mcp(mtr, req)
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert not data["result"].get("isError", False)
    inner = json.loads(data["result"]["content"][0]["text"])
    assert inner["exit_code"] == 0
    trace_id = inner.get("trace_id") or ""
    assert isinstance(trace_id, str) and trace_id != ""


def test_mcp_task_runner_004_binary_is_on_path_and_help_exits_0(mtr):
    """MCP-TASK-RUNNER-004: binary is on PATH and --help exits 0"""
    found = shutil.which("mcp-task-runner", path=mtr["env"]["PATH"])
    assert found is not None
    assert __import__("os").access(found, __import__("os").X_OK)
    r = subprocess.run(["mcp-task-runner", "--help"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       text=True, env={**__import__("os").environ, **mtr["env"]})
    assert r.returncode == 0
    assert "taskfile" in r.stdout
