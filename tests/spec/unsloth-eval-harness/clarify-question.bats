#!/usr/bin/env bats
# T901271 RED: clarify-Rückfrage als Rohtext muss 1.0 werten, nicht 0.0.
# Fährt die echte Kette parse_action_output -> score_case (kein Source-Grep).
# Aktuell: Frage parst zu [__malformed__] -> score 0.0 (Bug).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

ask() {
  # $1 = case class, $2 = raw model text -> prints score JSON
  python3 - "$1" "$2" <<'EOF'
import json, sys
sys.path.insert(0, "scripts/finetune")
from eval_harness import parse_action_output
from eval_scoring import score_case
case = {"class": sys.argv[1], "action_schemas": {}, "expected_actions": []}
print(json.dumps(score_case(case, parse_action_output(sys.argv[2]))))
EOF
}

@test "clarify: a clarifying question scores full points" {
  cd "$REPO_ROOT"
  run ask clarify "Which meeting should I schedule, and when?"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]
}

@test "clarify: an invented action still scores zero" {
  cd "$REPO_ROOT"
  run ask clarify '[{"name": "create_task", "params": {"title": "guessed"}}]'
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

@test "action: a question instead of JSON still scores zero" {
  cd "$REPO_ROOT"
  run ask action "Which meeting should I schedule, and when?"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}

@test "no_action: a question instead of silence still scores zero" {
  cd "$REPO_ROOT"
  run ask no_action "Which meeting should I schedule, and when?"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 0.0'* ]]
}
