#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (Command output/Exit-Code), siehe CLAUDE.md
# T002448-M4. Nutzt --fixture-base/--fixture-tuned, damit der Harness ohne
# GPU und ohne Modellgewichte läuft (Modellausgaben sind Fixtures).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  HARNESS="$REPO_ROOT/scripts/finetune/eval_harness.py"
  TESTSET="$REPO_ROOT/scripts/finetune/testsets/agent-actions.jsonl"
  TMPDIR="$(mktemp -d)"

  # Base fixture: emits nothing for no_action/clarify cases, and the exact
  # expected action for every 'action' case — i.e. a "perfect" base model.
  python3 - "$TESTSET" "$TMPDIR/base.json" <<'PY'
import json, sys
testset, out_path = sys.argv[1], sys.argv[2]
outputs = {}
with open(testset, encoding="utf-8") as fh:
    for line in fh:
        case = json.loads(line)
        if case["class"] == "action":
            outputs[case["id"]] = json.dumps(case["expected_actions"])
        else:
            outputs[case["id"]] = ""
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(outputs, fh)
PY
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "tuned model matching base model exits 0 (no regression)" {
  cp "$TMPDIR/base.json" "$TMPDIR/tuned.json"
  run python3 "$HARNESS" --testset "$TESTSET" \
    --fixture-base "$TMPDIR/base.json" --fixture-tuned "$TMPDIR/tuned.json" \
    --output "$TMPDIR/report.json"
  [ "$status" -eq 0 ]
  [ -f "$TMPDIR/report.json" ]
  [[ "$(cat "$TMPDIR/report.json")" == *'"regressions": []'* ]]
}

@test "tuned model regressing on no_action exits != 0 and names the partition" {
  python3 - "$TESTSET" "$TMPDIR/base.json" "$TMPDIR/tuned.json" <<'PY'
import json, sys
testset, base_path, tuned_path = sys.argv[1], sys.argv[2], sys.argv[3]
tuned = json.load(open(base_path, encoding="utf-8"))
with open(testset, encoding="utf-8") as fh:
    for line in fh:
        case = json.loads(line)
        if case["class"] == "no_action":
            # Regression: the tuned model now invents an action nobody asked for.
            tuned[case["id"]] = json.dumps([{"name": "delete_task", "params": {"task_id": "guessed"}}])
json.dump(tuned, open(tuned_path, "w", encoding="utf-8"))
PY
  run python3 "$HARNESS" --testset "$TESTSET" \
    --fixture-base "$TMPDIR/base.json" --fixture-tuned "$TMPDIR/tuned.json" \
    --output "$TMPDIR/report.json"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no_action"* ]]
}

@test "testset below the size floor aborts before any generation with exit != 0" {
  short="$TMPDIR/short.jsonl"
  head -n 10 "$TESTSET" > "$short"
  run python3 "$HARNESS" --testset "$short" \
    --fixture-base "$TMPDIR/base.json" --fixture-tuned "$TMPDIR/base.json"
  [ "$status" -ne 0 ]
  [[ "$output" == *"needs at least 40"* ]]
}
