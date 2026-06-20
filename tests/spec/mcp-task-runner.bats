#!/usr/bin/env bats
# tests/spec/mcp-task-runner.bats
# SSOT: openspec/changes/mcp-task-runner/proposal.md

# ── Helpers ───────────────────────────────────────────────────────────────────

# BATS cd's into BATS_TEST_DIRNAME for each test, so all paths must be absolute.
REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
BINARY="${REPO_ROOT}/mcp-task-runner/bin/mcp-task-runner"
TASKFILE="${REPO_ROOT}/Taskfile.yml"

# Send a single JSON-RPC request to the binary via stdin and capture stdout.
mcp_call() {
  local method="$1"
  local params="$2"
  printf '{"jsonrpc":"2.0","id":1,"method":"%s","params":%s}\n' "$method" "$params" \
    | "$BINARY" --taskfile "$TASKFILE" 2>/dev/null
}

# Write a fake `task` binary into a temp dir and prepend it to PATH.
setup_fake_task() {
  local script="$1"
  FAKE_TASK_DIR="$(mktemp -d)"
  printf '#!/bin/sh\n%s\n' "$script" > "$FAKE_TASK_DIR/task"
  chmod +x "$FAKE_TASK_DIR/task"
  export PATH="$FAKE_TASK_DIR:$PATH"
}

teardown() {
  if [ -n "${FAKE_TASK_DIR:-}" ] && [ -d "${FAKE_TASK_DIR}" ]; then
    rm -rf "${FAKE_TASK_DIR}"
  fi
}

# ── Tests ─────────────────────────────────────────────────────────────────────

@test "binary exists and lists three tools" {
  [ -x "$BINARY" ]
  run bash -c "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | $BINARY 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"plan_tasks"'
  echo "$output" | grep -q '"run_task"'
  echo "$output" | grep -q '"execute_plan"'
}

@test "plan_tasks groups same-brand independent tasks in one parallel group" {
  setup_fake_task "echo '{\"tasks\":[{\"name\":\"workspace:deploy\",\"deps\":[]},{\"name\":\"workspace:validate\",\"deps\":[]}]}'"
  run mcp_call "tools/call" \
    '{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:validate","env":"mentolder"}]}}'
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
content = json.loads(data['result']['content'][0]['text'])
assert len(content['groups']) == 1, f'expected 1 group, got {len(content[\"groups\"])}'
assert len(content['groups'][0]['tasks']) == 2, 'expected 2 tasks in group'
"
}

@test "plan_tasks sequences dependent tasks into separate groups" {
  setup_fake_task "echo '{\"tasks\":[{\"name\":\"workspace:deploy\",\"deps\":[]},{\"name\":\"workspace:post-setup\",\"deps\":[\"workspace:deploy\"]}]}'"
  run mcp_call "tools/call" \
    '{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:post-setup","env":"mentolder"}]}}'
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
content = json.loads(data['result']['content'][0]['text'])
assert len(content['groups']) == 2, f'expected 2 groups, got {len(content[\"groups\"])}'
assert content['groups'][0]['tasks'][0]['task'] == 'workspace:deploy'
assert content['groups'][1]['tasks'][0]['task'] == 'workspace:post-setup'
"
}

@test "run_task returns exit_code and task name" {
  setup_fake_task 'exit 0'
  run mcp_call "tools/call" \
    '{"name":"run_task","arguments":{"task":"workspace:deploy","env":"mentolder"}}'
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
r = json.loads(data['result']['content'][0]['text'])
assert r['exit_code'] == 0
assert r['task'] == 'workspace:deploy'
assert r['env'] == 'mentolder'
"
}

@test "execute_plan aborts serial group after failure in group 1" {
  setup_fake_task 'exit 1'
  PLAN='{"groups":[{"tasks":[{"task":"workspace:deploy","env":"mentolder"}]},{"tasks":[{"task":"workspace:post-setup","env":"mentolder"}]}]}'
  run mcp_call "tools/call" \
    "{\"name\":\"execute_plan\",\"arguments\":{\"plan\":$PLAN}}"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
text = data['result']['content'][0]['text']
results = json.loads(text.split(chr(10))[0])
assert len(results) == 1, f'expected 1 result (fail-fast), got {len(results)}'
assert results[0]['exit_code'] == 1
"
}
