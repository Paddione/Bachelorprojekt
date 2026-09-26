#!/usr/bin/env bats
# tests/spec/llm-local-dev/plan-runner.bats — T900504
# SSOT: openspec/changes/plan-runner/specs/llm-local-dev.md
#   Requirement: Plan Runner Executes OpenSpec Partials With Local Models
#   Requirement: Orchestrator Self-Execution When All Workers Are Busy
#
# PRUEFMODUS: Output-Verifikation. scripts/llm/plan-runner.mjs wird GESTARTET.
# Der Orchestrator (:1919) ist ein Fake-Server mit vorgegebenen Tool-Calls
# (fixtures/plan-runner-fake-orch.mjs), opencode ein Stub, der pro Lauf
# "<agent> <partial>" in ein Log schreibt (fixtures/plan-runner-fake-opencode.sh).
# Keine GPU, kein opencode, kein fester Port.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FIX="$BATS_TEST_DIRNAME/fixtures"
  T="$BATS_TEST_TMPDIR"
  CH="$T/change"
  WT="$T/worktree"
  mkdir -p "$CH/tasks.d" "$WT"
  export PLAN_RUNNER_OPENCODE="$FIX/plan-runner-fake-opencode.sh"
  export FAKE_OPENCODE_LOG="$T/opencode.log"
  export FAKE_SLEEP_4B=0 FAKE_SLEEP_SELF=0
  : > "$FAKE_OPENCODE_LOG"
  : > "$T/requests.log"
}

teardown() {
  [ -f "$T/orch.pid" ] && kill "$(cat "$T/orch.pid")" 2>/dev/null || true
}

# make_change "p1:" "p2:p1" … — Manifest mit Partials und ihren depends_on.
make_change() {
  {
    echo "# Plan"; echo; echo "## Partials"; echo
    echo "| id | plan | role | target_files | depends_on |"
    echo "|----|------|------|--------------|------------|"
    for spec in "$@"; do
      local id="${spec%%:*}" deps="${spec#*:}"
      echo "| $id | tasks.d/$id-work.md | impl | src/$id.txt | $deps |"
      printf '# %s\n\n## Task: write src/%s.txt\n' "$id" "$id" > "$CH/tasks.d/$id-work.md"
    done
    echo; echo "## Verify"
  } > "$CH/tasks.md"
}

# start_orch '<script-json>' — startet den Fake-Orchestrator auf einem freien Port.
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

run_runner() {
  run timeout 60 node "$REPO/scripts/llm/plan-runner.mjs" "$CH" --worktree "$WT" "$@"
}

state_of() { jq -r --arg p "$1" '.partials[$p].status' "$CH/.plan-runner/state.json"; }

@test "Partials run in dependency order" {
  make_change "p1:" "p2:p1"
  start_orch '[
    {"name":"dispatch_4b","args":{"partial_id":"p2","prompt":"too early"}},
    {"name":"dispatch_4b","args":{"partial_id":"p1","prompt":"go"}},
    {"name":"wait_event","args":{}},
    {"name":"mark","args":{"partial_id":"p1","status":"done","note":"ok"}},
    {"name":"dispatch_4b","args":{"partial_id":"p2","prompt":"go"}},
    {"name":"wait_event","args":{}},
    {"name":"mark","args":{"partial_id":"p2","status":"done","note":"ok"}},
    {"name":"finish","args":{"summary":"all done"}}
  ]'
  run_runner --4b-slots 2
  echo "$output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: beide Partials liefen genau einmal.
  [ "$(wc -l < "$FAKE_OPENCODE_LOG")" -eq 2 ]
  [ "$(sed -n 1p "$FAKE_OPENCODE_LOG")" = "qwen35-mtp p1" ]
  [ "$(sed -n 2p "$FAKE_OPENCODE_LOG")" = "qwen35-mtp p2" ]
  # Der verfruehte dispatch_4b p2 wurde abgelehnt, nicht gestartet.
  [ "$(jq -r '.messages[-1].content' <<<"$(sed -n 2p "$T/requests.log")" | grep -c 'not ready')" -eq 1 ]
  [ "$(state_of p1)" = "done" ]
  [ "$(state_of p2)" = "done" ]
}

@test "Progress survives a restart" {
  make_change "p1:" "p2:p1"
  mkdir -p "$CH/.plan-runner"
  cat > "$CH/.plan-runner/state.json" <<'EOF'
{"slug":"change","partials":{
 "p1":{"status":"done","owner":"4b","attempts":0,"result":"earlier run"},
 "p2":{"status":"running","owner":"4b","attempts":0,"result":null}},
 "orchestrator":{"notes":"","frozen_at":null}}
EOF
  start_orch '[
    {"name":"dispatch_4b","args":{"partial_id":"p1","prompt":"again"}},
    {"name":"dispatch_4b","args":{"partial_id":"p2","prompt":"go"}},
    {"name":"wait_event","args":{}},
    {"name":"mark","args":{"partial_id":"p2","status":"done","note":"ok"}},
    {"name":"finish","args":{"summary":"resumed"}}
  ]'
  run_runner --4b-slots 1
  echo "$output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: p2 lief nach dem Neustart.
  [ "$(wc -l < "$FAKE_OPENCODE_LOG")" -gt 0 ]
  [ "$(cat "$FAKE_OPENCODE_LOG")" = "qwen35-mtp p2" ]
  # Der erste Request zeigt p2 bereits zurueckgesetzt auf open.
  [ "$(sed -n 1p "$T/requests.log" | jq -r '.messages[1].content' | grep -c '"p2":{"status":"open"')" -eq 1 ]
  [ "$(state_of p1)" = "done" ]
  [ "$(state_of p2)" = "done" ]
  [ "$(jq -r '.partials.p1.result' "$CH/.plan-runner/state.json")" = "earlier run" ]
}

@test "Self-execution is refused while a worker slot is free" {
  make_change "p1:"
  start_orch '[
    {"name":"execute_self","args":{"partial_id":"p1","prompt":"do it","plan_notes":"n"}},
    {"name":"dispatch_4b","args":{"partial_id":"p1","prompt":"go"}},
    {"name":"wait_event","args":{}},
    {"name":"mark","args":{"partial_id":"p1","status":"done","note":"ok"}},
    {"name":"finish","args":{"summary":"done"}}
  ]'
  run_runner --4b-slots 1
  echo "$output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der 4B-Lauf fand statt.
  [ "$(wc -l < "$FAKE_OPENCODE_LOG")" -gt 0 ]
  [ "$(cat "$FAKE_OPENCODE_LOG")" = "qwen35-mtp p1" ]
  # Die Anfrage nach execute_self enthaelt die Ablehnung.
  [ "$(sed -n 2p "$T/requests.log" | jq -r '.messages[-1].content' | grep -c 'use dispatch_4b')" -eq 1 ]
  [ -z "$(grep '^local' "$FAKE_OPENCODE_LOG" || true)" ]
}

@test "Workers keep running while the orchestrator sleeps" {
  make_change "p1:" "p2:" "p3:"
  export FAKE_SLEEP_4B=1 FAKE_SLEEP_SELF=3
  start_orch '[
    {"name":"dispatch_4b","args":{"partial_id":"p1","prompt":"go"}},
    {"name":"execute_self","args":{"partial_id":"p2","prompt":"do it yourself","plan_notes":"p1 on 4b, p2 self"}},
    {"name":"mark","args":{"partial_id":"p1","status":"done","note":"ok"}},
    {"name":"mark","args":{"partial_id":"p2","status":"done","note":"ok"}},
    {"name":"mark","args":{"partial_id":"p3","status":"done","note":"ok"}},
    {"name":"finish","args":{"summary":"done"}}
  ]'
  run_runner --4b-slots 1
  echo "$output"
  cat "$FAKE_OPENCODE_LOG"
  [ "$status" -eq 0 ]
  # Positiv-Anker: alle drei Laeufe fanden statt.
  [ "$(wc -l < "$FAKE_OPENCODE_LOG")" -eq 3 ]
  # p3 wurde waehrend des Selbstaufrufs vergeben und endete vor ihm.
  local p3 self
  p3="$(grep -n '^qwen35-mtp p3$' "$FAKE_OPENCODE_LOG" | cut -d: -f1)"
  self="$(grep -n '^local p2$' "$FAKE_OPENCODE_LOG" | cut -d: -f1)"
  [ -n "$p3" ] && [ -n "$self" ]
  [ "$p3" -lt "$self" ]
  # Das execute_self-Ergebnis meldet die Laeufe aus der Schlafphase.
  local res
  res="$(sed -n 3p "$T/requests.log" | jq -r '.messages[-1].content')"
  echo "$res"
  [ "$(grep -c '^success' <<<"$res")" -eq 1 ]
  [ "$(grep -c 'p3' <<<"$res")" -ge 1 ]
  [ "$(jq -r '.orchestrator.notes' "$CH/.plan-runner/state.json")" = "p1 on 4b, p2 self" ]
  [ "$(state_of p3)" = "done" ]
}
