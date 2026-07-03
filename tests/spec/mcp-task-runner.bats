#!/usr/bin/env bats
# tests/spec/mcp-task-runner.bats
# SSOT: openspec/changes/mcp-task-runner/proposal.md
#
# Integration tests for the mcp-task-runner MCP server.
# Binary must be installed at /usr/local/bin/mcp-task-runner.
# Tests use a fake `task` binary via PATH prepend — no real cluster or Taskfile needed.

# ── Setup / Teardown ──────────────────────────────────────────────────────────
setup() {
  load 'test_helper.bash'

  # Resolve absolute paths (BATS_TEST_DIRNAME is not available at file scope)
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BINARY="/usr/local/bin/mcp-task-runner"

  # Create a minimal Taskfile so --taskfile flag is satisfied
  FAKE_DIR="$(mktemp -d)"
  cat > "${FAKE_DIR}/Taskfile.yml" <<'YAML'
version: '3'
tasks:
  noop:
    desc: "no-op task for tests"
    cmds:
      - echo ok
YAML

  # Create a fake `task` binary: returns valid JSON for --json, echoes args otherwise
  mkdir -p "${FAKE_DIR}/bin"
  cat > "${FAKE_DIR}/bin/task" <<'FAKESCRIPT'
#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == "--json" ]]; then
    echo '{"tasks":[{"name":"workspace:deploy","desc":"Deploy","deps":[]},{"name":"workspace:post-setup","desc":"Post setup","deps":["workspace:deploy"]}]}'
    exit 0
  fi
done
echo "running: $*"
exit 0
FAKESCRIPT
  chmod +x "${FAKE_DIR}/bin/task"

  # Prepend fake bin to PATH so the server uses our stub
  export PATH="${FAKE_DIR}/bin:${PATH}"
  FAKE_TASKFILE="${FAKE_DIR}/Taskfile.yml"
}

teardown() {
  if [[ -n "${FAKE_DIR:-}" && -d "${FAKE_DIR}" ]]; then
    rm -rf "${FAKE_DIR}"
  fi
}

# ── Helper: send a single JSON-RPC message and capture stdout ─────────────────
_mcp() {
  local json="$1"
  printf '%s\n' "$json" | "${BINARY}" --taskfile "${FAKE_TASKFILE}" 2>/dev/null
}

# ── Tests ─────────────────────────────────────────────────────────────────────

@test "MCP-TASK-RUNNER-001: tools/list returns all 7 tools (plan_tasks, run_task, execute_plan, get_task_graph, run_task_async, cancel_task, get_task_result)" {
  run _mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  [ "$status" -eq 0 ]
  # Validate JSON is well-formed and contains all 7 expected tool names.
  # Tool count grew from 3 to 7 with the archived 2026-06-28
  # mcp-server-capabilities change (async lifecycle + graph tools); this
  # assertion tracks the current shipped surface, not the original 3. [T001533]
  echo "$output" | jq -e '.result.tools | length == 7' > /dev/null
  echo "$output" | jq -e '[.result.tools[].name] | contains(["plan_tasks","run_task","execute_plan","get_task_graph","run_task_async","cancel_task","get_task_result"])' > /dev/null
}

@test "MCP-TASK-RUNNER-002: plan_tasks with two same-named tasks (different env) groups them into one parallel group" {
  local req
  req='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:deploy","env":"korczewski"}]}}}'
  run _mcp "$req"
  [ "$status" -eq 0 ]
  # Response must not be an error
  echo "$output" | jq -e '.result.isError // false | not' > /dev/null
  # Inner content is JSON-encoded; parse groups
  local groups
  groups=$(echo "$output" | jq -r '.result.content[0].text' | jq '.groups | length')
  [ "$groups" -eq 1 ]
  # Both tasks are inside that single group
  local task_count
  task_count=$(echo "$output" | jq -r '.result.content[0].text' | jq '.groups[0].tasks | length')
  [ "$task_count" -eq 2 ]
}

@test "MCP-TASK-RUNNER-003: run_task with a fake task that exits 0 returns exit_code 0 and a trace_id" {
  local req
  req='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"run_task","arguments":{"task":"workspace:deploy","env":"mentolder"}}}'
  run _mcp "$req"
  [ "$status" -eq 0 ]
  # Response must not carry isError
  echo "$output" | jq -e '.result.isError // false | not' > /dev/null
  # Inner payload: exit_code == 0
  local exit_code
  exit_code=$(echo "$output" | jq -r '.result.content[0].text' | jq '.exit_code')
  [ "$exit_code" -eq 0 ]
  # trace_id must be a non-empty string
  local trace_id
  trace_id=$(echo "$output" | jq -r '.result.content[0].text' | jq -r '.trace_id // ""')
  [ -n "$trace_id" ]
}

@test "MCP-TASK-RUNNER-004: binary is on PATH and --help exits 0" {
  run command -v mcp-task-runner
  [ "$status" -eq 0 ]
  [ -x "$output" ]
  run mcp-task-runner --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "taskfile" ]]
}
