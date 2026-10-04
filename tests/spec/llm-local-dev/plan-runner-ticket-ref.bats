#!/usr/bin/env bats
# tests/spec/llm-local-dev/plan-runner-ticket-ref.bats — T901015
#   Requirement: plan-runner loest Plan aus DB-Ref auf (--ticket <T-Id>).
#
# PRUEFMODUS: Output-Verifikation. Die DB (ticket.sh get) wird per
# PLAN_RUNNER_TICKET_JSON-Seam gestubbt (kein Cluster noetig); `git worktree
# list` laeuft in einem frischen Temp-Repo (kein Eingriff in echte Worktrees).
# Der Happy-Path startet den Runner end-to-end mit Fake-Orchestrator und
# Fake-opencode (Fixtures aus plan-runner.bats).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FIX="$BATS_TEST_DIRNAME/fixtures"
  T="$BATS_TEST_TMPDIR"
  export PLAN_RUNNER_OPENCODE="$FIX/plan-runner-fake-opencode.sh"
  export FAKE_OPENCODE_LOG="$T/opencode.log"
  export FAKE_SLEEP_4B=0 FAKE_SLEEP_SELF=0
  : > "$FAKE_OPENCODE_LOG"
  : > "$T/requests.log"
  unset PLAN_RUNNER_TICKET_JSON
  # Frisches Temp-Repo mit einem Worktree auf Branch feat/x + Plan darin.
  R="$T/repo"; WT="$T/wt"
  git init -q "$R"
  git -C "$R" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  git -C "$R" worktree add -q "$WT" -b feat/x
  mkdir -p "$WT/plans/demo/tasks.d"
  printf '# p1\n\n## Task: write src/p1.txt\n' > "$WT/plans/demo/tasks.d/p1-work.md"
  {
    echo "# Plan"; echo; echo "## Partials"; echo
    echo "| id | plan | role | target_files | depends_on |"
    echo "|----|------|------|--------------|------------|"
    echo "| p1 | tasks.d/p1-work.md | impl | src/p1.txt | |"
    echo; echo "## Verify"
  } > "$WT/plans/demo/tasks.md"
  PLAN_REF_JSON='{"external_id":"T901015","plan_ref":"FACTORY-PLAN-REF branch=feat/x plan=plans/demo/tasks.md"}'
  export PLAN_REF_JSON
}

teardown() {
  [ -f "$T/orch.pid" ] && kill "$(cat "$T/orch.pid")" 2>/dev/null || true
  unset PLAN_RUNNER_TICKET_JSON
}

start_orch() {
  printf '%s' "$1" > "$T/script.json"
  local port
  port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')"
  node "$FIX/plan-runner-fake-orch.mjs" "$port" "$T/script.json" "$T/requests.log" > "$T/orch.out" 2>&1 &
  echo $! > "$T/orch.pid"
  export PLAN_RUNNER_ORCH_URL="http://127.0.0.1:$port"
  for _ in $(seq 1 50); do
    curl -sf "$PLAN_RUNNER_ORCH_URL/health" >/dev/null && return 0
    sleep 0.1
  done
  echo "fake orchestrator did not start" >&2
  return 1
}

@test "Ref aufloesbar: --ticket leitet changeDir aus Worktree ab" {
  cd "$R"
  export PLAN_RUNNER_TICKET_JSON="$PLAN_REF_JSON"
  start_orch '[
    {"name":"dispatch_4b","args":{"partial_id":"p1","prompt":"go"}},
    {"name":"wait_event","args":{}},
    {"name":"mark","args":{"partial_id":"p1","status":"done","note":"ok"}},
    {"name":"finish","args":{"summary":"all done"}}
  ]'
  run timeout 60 node "$REPO/scripts/llm/plan-runner.mjs" --ticket T901015 --4b-slots 2
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.partials.p1.status' "$WT/plans/demo/.plan-runner/state.json")" = "done" ]
}

@test "Ref fehlend: fail-closed exit 2" {
  cd "$R"
  export PLAN_RUNNER_TICKET_JSON='{"external_id":"T901015","plan_ref":null}'
  run timeout 60 node "$REPO/scripts/llm/plan-runner.mjs" --ticket T901015
  echo "$output"
  [ "$status" -eq 2 ]
  [[ "$output" == *"no FACTORY-PLAN-REF"* ]]
}

@test "Worktree fehlend: fail-closed exit 2" {
  cd "$R"
  export PLAN_RUNNER_TICKET_JSON='{"external_id":"T901015","plan_ref":"FACTORY-PLAN-REF branch=feat/nonexistent plan=plans/demo/tasks.md"}'
  run timeout 60 node "$REPO/scripts/llm/plan-runner.mjs" --ticket T901015
  echo "$output"
  [ "$status" -eq 2 ]
  [[ "$output" == *"not checked out in any worktree"* ]]
}

@test "Ohne Flag: Disk-Verhalten unveraendert (kein Ticket-Lookup)" {
  mkdir -p "$T/empty"
  run timeout 60 node "$REPO/scripts/llm/plan-runner.mjs" "$T/empty" --worktree "$T/empty"
  echo "$output"
  [ "$status" -eq 2 ]
  [[ "$output" == *"no tasks.md"* ]]
}
