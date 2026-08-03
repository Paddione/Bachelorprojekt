#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (Command output/Exit-Code), siehe CLAUDE.md
# T002448-M4. Ruft scripts/finetune/eval_scoring.py als CLI auf, prüft
# stdout-JSON und Exit-Code — kein Source-Grep.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCORER="$REPO_ROOT/scripts/finetune/eval_scoring.py"
}

score_case() {
  # $1 = case JSON, $2 = actual_actions JSON array
  python3 "$SCORER" score <<EOF
{"case": $1, "actual_actions": $2}
EOF
}

# --- action class ---

@test "action case: well-formed correct action scores full points" {
  case='{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],"optional":["priority"]}},"expected_actions":[{"name":"create_task"}]}'
  actual='[{"name":"create_task","params":{"title":"Report","due_date":"2026-08-10"}}]'
  run score_case "$case" "$actual"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]
}

@test "action case: missing required param does not score full points" {
  case='{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],"optional":["priority"]}},"expected_actions":[{"name":"create_task"}]}'
  actual='[{"name":"create_task","params":{"title":"Report"}}]'
  run score_case "$case" "$actual"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

@test "action case: unknown param does not score full points" {
  case='{"class":"action","action_schemas":{"create_task":{"required":["title","due_date"],"optional":[]}},"expected_actions":[{"name":"create_task"}]}'
  actual='[{"name":"create_task","params":{"title":"Report","due_date":"2026-08-10","made_up":"x"}}]'
  run score_case "$case" "$actual"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

@test "action case: two expected actions score full points only with the complete set" {
  case='{"class":"action","action_schemas":{"schedule_meeting":{"required":["title","start_time"],"optional":[]},"send_message":{"required":["recipient","body"],"optional":[]}},"expected_actions":[{"name":"schedule_meeting"},{"name":"send_message"}]}'
  full='[{"name":"schedule_meeting","params":{"title":"Sync","start_time":"14:00"}},{"name":"send_message","params":{"recipient":"team","body":"invite sent"}}]'
  partial='[{"name":"schedule_meeting","params":{"title":"Sync","start_time":"14:00"}}]'

  run score_case "$case" "$full"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]

  run score_case "$case" "$partial"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

# --- no_action class ---

@test "no_action case: no emitted action scores full points" {
  case='{"class":"no_action","action_schemas":{},"expected_actions":[]}'
  run score_case "$case" "[]"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]
}

@test "no_action case: an emitted action scores zero" {
  case='{"class":"no_action","action_schemas":{"create_task":{"required":["title"],"optional":[]}},"expected_actions":[]}'
  actual='[{"name":"create_task","params":{"title":"unwanted"}}]'
  run score_case "$case" "$actual"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

# --- clarify class ---

@test "clarify case: no emitted action scores full points" {
  case='{"class":"clarify","action_schemas":{},"expected_actions":[]}'
  run score_case "$case" "[]"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]
}

@test "clarify case: an invented action scores zero" {
  case='{"class":"clarify","action_schemas":{"create_task":{"required":["title","due_date"],"optional":[]}},"expected_actions":[]}'
  actual='[{"name":"create_task","params":{"title":"guessed","due_date":"guessed"}}]'
  run score_case "$case" "$actual"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}
