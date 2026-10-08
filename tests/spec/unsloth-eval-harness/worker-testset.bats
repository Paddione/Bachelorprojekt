#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (Command output/Exit-Code), siehe CLAUDE.md
# T002448-M4. T901286: action-only Worker-Testset für Instruct-Modelle
# (Plan-Stufe -> Aktion). Ruft eval_scoring.py als CLI auf — kein Source-Grep.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCORER="$REPO_ROOT/scripts/finetune/eval_scoring.py"
  WORKER_SET="$REPO_ROOT/scripts/finetune/testsets/instruct-worker.jsonl"
  LEGACY_SET="$REPO_ROOT/scripts/finetune/testsets/agent-actions.jsonl"
  TMPDIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "worker testset validates: >=40 action-only cases with full en/de pairing" {
  run python3 "$SCORER" validate-testset "$WORKER_SET"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK:"* ]]

  count=$(wc -l < "$WORKER_SET")
  [ "$count" -ge 40 ]

  action_count=$(grep -c '"class": "action"' "$WORKER_SET")
  [ "$action_count" -eq "$count" ]
}

@test "single-partition worker set is accepted (no missing-partition refusal)" {
  run python3 "$SCORER" validate-testset "$WORKER_SET"
  [ "$status" -eq 0 ]
  [[ "$output" != *"has no cases"* ]]
}

@test "agent-actions.jsonl still validates (three-partition regression guard)" {
  run python3 "$SCORER" validate-testset "$LEGACY_SET"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK:"* ]]
}

@test "multi-action worker case scores full points with the complete set" {
  multi="$TMPDIR/multi.json"
  python3 - "$WORKER_SET" "$multi" <<'EOF'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
cases = [json.loads(l) for l in open(src, encoding="utf-8") if l.strip()]
m = next(c for c in cases if len(c["expected_actions"]) > 1)
json.dump({"case": m, "actual_actions": m["expected_actions"]},
          open(dst, "w", encoding="utf-8"))
EOF
  run python3 "$SCORER" score < "$multi"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"score": 1.0'* ]]
}
