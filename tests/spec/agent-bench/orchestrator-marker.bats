# tests/spec/agent-bench/orchestrator-marker.bats — Runner-Summary-Marker (T901311).
# Regression: sauberer Orchestrator-Lauf darf kein protocol_error tragen.
# Der plan-runner schreibt 'PLAN-RUNNER: done=...' nach stdout (kein
# 'PLAN-RUNNER-RESULT:' — das ist der Worker-Ergebnis-Marker).

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/marker-XXXXXX")"
  mkdir -p "$T/base/notes" "$T/plan" "$T/checks" "$T/work" "$T/bin"
  printf 'TODO a\n' > "$T/base/notes/a.txt"
  printf 'TODO b\n' > "$T/base/notes/b.txt"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/checks/run.sh" "$T/checks/run.sh"
  chmod +x "$T/checks/run.sh"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/tasks.md" "$T/plan/tasks.md"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p1.md" "$T/plan/p1.md"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p2.md" "$T/plan/p2.md"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p3.md" "$T/plan/p3.md"
  cat > "$T/bin/opencode.sh" <<'EOF'
#!/usr/bin/env bash
set -u
prompt="${*: -1}"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
files="$(grep -oE 'FILES:[^|]*' <<<"$prompt" | head -1 | cut -d: -f2- || true)"
old_ifs="$IFS"; IFS=','
for f in $files; do
  f="$(echo "$f" | sed 's/^ *//;s/ *$//')"
  [ -z "$f" ] && continue
  [ "$f" = "-" ] && continue
  [ -f "$f" ] && sed -i 's/^TODO /DONE /' "$f" || true
done
IFS="$old_ifs"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake ${partial:-unknown}"
EOF
  chmod +x "$T/bin/opencode.sh"
}

teardown() {
  stop_fake
  rm -rf "$T"
}

@test "Sauberer Dispatch trägt kein protocol_error" {
  start_fake '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p2", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p3", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p3", "status": "done"}}]}, {"tool_calls": [{"name": "finish", "arguments": {"summary": "all dispatched"}}]}]'
  cat > "$T/variant.json" <<EOF
{"checksDir": "$T/checks", "budget": {"tokens": 8000, "turns": 15}}
EOF
  echo "{\"case\": {\"id\": \"marker-clean\", \"base\": \"$T/base\"}, \"planDir\": \"$T/plan\", \"slots4b\": 2, \"opencodeBin\": \"$T/bin/opencode.sh\"}" > "$T/inputs.json"
  run env RECORDER_URL="$FAKE_URL" WORKDIR="$T/work" DRIVE_TIMEOUT_MS=120000 \
    node "$FIX/drive-role.mjs" orchestrator "$T/variant.json" "$T/inputs.json"
  [ "$status" -eq 0 ]
  echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);const kinds=(r.events||[]).map(e=>e.kind);if(kinds.includes('protocol_error')){console.error('unexpected protocol_error: '+JSON.stringify(kinds));process.exit(1)}})"
}
