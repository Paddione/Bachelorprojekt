#!/usr/bin/env bats
# FA-SF-37-retry — structured ≤2 self-healing retry loop in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"
# T002074: CI retry loop moved to pr-babysit-ticket.sh; deploy prompt to pipeline-partials.cjs.
PARTIALS_MOD="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline-partials.cjs"
PRBABYSIT="$BATS_TEST_DIRNAME/../../scripts/factory/pr-babysit-ticket.sh"

setup() { load 'test_helper.bash'; }

@test "FA-SF-37-retry: pipeline.js lints clean (node --check)" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: old LLM prose is gone" {
  run grep -F 'after 2 fix attempts' "$PJS"
  [ "$status" -ne 0 ]
}

@test "FA-SF-37-retry: CI retry loop is delegated to pr-babysit-ticket.sh (T002074)" {
  run grep -qE 'pr-babysit-ticket\.sh' "$PJS" "$PARTIALS_MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: pr-babysit reuses classify-failure.sh (no duplication)" {
  run grep -qE 'classify-failure\.sh' "$PRBABYSIT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: pr-babysit re-checks before requeue + bounds attempts" {
  run grep -qiE 'Re-check BEFORE requeue' "$PRBABYSIT"
  [ "$status" -eq 0 ]
  run grep -qE 'MAX_CI_ATTEMPTS' "$PRBABYSIT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: attempts exhausted → non-zero exit + PushNotification escalation" {
  run grep -qE 'exit 1' "$PRBABYSIT"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: Verify HIGH/CRITICAL immediate-block stays separate" {
  run grep -qE "reason: 'review-findings'" "$PJS"
  [ "$status" -eq 0 ]
}

# ── build-loop (ralph-wiggum) tests ──
BLS="$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.sh"

@test "FA-SF-37-retry: build-loop.sh sourcet sauber" {
  run bash -n "$BLS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build_loop_sig_hash: Rauschen ändert Hash nicht" {
  source "$BLS"
  local log1; log1=$(mktemp); local log2; log2=$(mktemp)
  printf 'Error: test failed\n/home/user/src/foo.ts\n[500ms]\n' > "$log1"
  printf 'Error: test failed\n/home/other/src/bar.ts\n[200ms]\n' > "$log2"
  local h1; h1=$(build_loop_sig_hash "$log1")
  local h2; h2=$(build_loop_sig_hash "$log2")
  rm -f "$log1" "$log2"
  [ "$h1" = "$h2" ]
}

@test "FA-SF-37-retry: build_loop_sig_hash: identischer Log → gleicher Hash" {
  source "$BLS"
  local log; log=$(mktemp)
  printf 'Error: test failed\n' > "$log"
  local h1; h1=$(build_loop_sig_hash "$log")
  local h2; h2=$(build_loop_sig_hash "$log")
  rm -f "$log"
  [ "$h1" = "$h2" ]
}

@test "FA-SF-37-retry: build_loop_decide: allowed classify → continue" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "test" "" "abc"
  echo "$output" | head -1 | grep -qE '^continue$'
}

@test "FA-SF-37-retry: build_loop_decide: disallowed classify → escalate-gate" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "secret" "" "abc"
  echo "$output" | head -1 | grep -qE '^abort:escalate-gate$'
}

@test "FA-SF-37-retry: build_loop_decide: max iterations → abort" {
  source "$BLS"
  run build_loop_decide "3" "3" "" "test" "" "abc"
  echo "$output" | head -1 | grep -qE '^abort:max-iterations$'
}

@test "FA-SF-37-retry: build_loop_decide: no-progress → abort" {
  source "$BLS"
  run build_loop_decide "1" "3" "deadbeef" "test" "" "deadbeef"
  echo "$output" | head -1 | grep -qE '^abort:no-progress$'
}

@test "FA-SF-37-retry: build_loop_decide: escalate paths → escalate-gate" {
  source "$BLS"
  run build_loop_decide "0" "3" "" "test" "k3d/foo.yaml" "abc"
  echo "$output" | head -1 | grep -qE '^abort:escalate-gate$'
}

@test "FA-SF-37-retry: build_loop.cjs lints clean (node --check)" {
  run node --check "$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.cjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build-loop unit tests pass" {
  run node "$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.test.cjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: pipeline.js inlines its own runTaskVerifyLoop (no require, sandbox mode)" {
  # The Workflow sandbox has no require()/Node API — pipeline.js can no longer
  # `require('./build-loop.cjs')` for BL.resolveAgentModel/runTaskVerifyLoop.
  # It now inlines runTaskVerifyLoop directly and routes every agent() call
  # through the fixed FACTORY_MODEL (local LM Studio) instead of per-call
  # provider-tier routing. build-loop.cjs itself still exports the function
  # for callers that DO have Node API access (e.g. pipeline-runner.js).
  run grep -qE "^async function runTaskVerifyLoop" "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE "require\(" "$PJS"
  [ "$status" -ne 0 ]
}

@test "FA-SF-37-retry: pipeline.js nutzt runTaskVerifyLoop" {
  run grep -qE "runTaskVerifyLoop" "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: build-loop.cjs exportiert runTaskVerifyLoop" {
  run node -e "const m = require('$BATS_TEST_DIRNAME/../../scripts/factory/build-loop.cjs'); console.log(typeof m.runTaskVerifyLoop)"
  [ "$status" -eq 0 ]
  [[ "$output" == "function" ]]
}

# ── precompact-prune tests (was FA-SF-54) ──

@test "FA-SF-37-retry: precompact-prune fehlendes Transcript → exit 0" {
  run bash scripts/hooks/precompact-prune.sh <<< '{}'
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: precompact-prune leeres Transcript → exit 0" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  local f="$t/transcript.jsonl"
  : > "$f"
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: precompact-prune obsoletes tool_result → pruned" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  local f="$t/transcript.jsonl"
  cat > "$f" <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"very long obsolete output","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"newer read","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-3"}
{"type":"tool_result","tool_use_id":"call-3","content":"even newer","metadata":{"original_tool":"Bash"}}
JSON
  run bash -c "echo '{\"script_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh 2>/dev/null || true"
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run jq -r 'select(.type == "tool_result") | select(.content | startswith("[pruned:")) | .content' "$f"
  [ -n "$output" ]
}

@test "FA-SF-37-retry: precompact-prune jüngstes Output unangetastet" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  local f="$t/transcript.jsonl"
  cat > "$f" <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"recent output","metadata":{"original_tool":"Read"}}
{"type":"assistant","content":[{"type":"tool_use","tool_use_id":"call-1"}]}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"other","metadata":{"original_tool":"Bash"}}
JSON
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run jq -r 'select(.type == "tool_result") | select(.tool_use_id == "call-1") | .content' "$f"
  [[ "$output" == "recent output" ]]
}

@test "FA-SF-37-retry: precompact-prune Idempotenz" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  local f="$t/transcript.jsonl"
  cat > "$f" <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"long obsolete read","metadata":{"original_tool":"Grep"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"newer","metadata":{"original_tool":"Read"}}
JSON
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  local h1; h1=$(sha256sum "$f" | cut -d' ' -f1)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  local h2; h2=$(sha256sum "$f" | cut -d' ' -f1)
  [ "$h2" = "$h1" ]
}

@test "FA-SF-37-retry: precompact-prune alle Zeilen valides JSON" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  local f="$t/transcript.jsonl"
  cat > "$f" <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"long content","metadata":{"original_tool":"Bash"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"more","metadata":{"original_tool":"Read"}}
JSON
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run bash -c "jq -e . < '$f' >/dev/null 2>&1"
  [ "$status" -eq 0 ]
}

# ── usage-report tests (was FA-SF-55) ──

@test "FA-SF-37-retry: usage-report fehlende Dirs → Exit 0" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/nonexistent"
  export OPENCLAW_USAGE_DIR="$t/nonexistent"
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: usage-report Fixtures → Summen pro Tag" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/claude"; mkdir "$CLAUDE_USAGE_DIR"
  export OPENCLAW_USAGE_DIR="$t/openclaw"; mkdir "$OPENCLAW_USAGE_DIR"
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-15T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
{"timestamp":"2026-06-15T11:00:00Z","model":"claude-sonnet-4","tokens_in":200,"tokens_out":100,"cost_usd":0.004}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"2026-06-15"* ]]
  [[ "$output" == *"claude-sonnet-4"* ]]
}

@test "FA-SF-37-retry: usage-report --json valides JSON" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/claude"; mkdir "$CLAUDE_USAGE_DIR"
  export OPENCLAW_USAGE_DIR="$t/openclaw"; mkdir "$OPENCLAW_USAGE_DIR"
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-14T10:00:00Z","model":"claude-haiku-4","tokens_in":50,"tokens_out":25,"cost_usd":0.001}
JSON
  run bash scripts/factory/usage-report.sh --json
  [ "$status" -eq 0 ]
  run jq -e . <<< "$output"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: usage-report --otel ohne Endpoint → no-op" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/claude"; mkdir "$CLAUDE_USAGE_DIR"
  export OPENCLAW_USAGE_DIR="$t/openclaw"; mkdir "$OPENCLAW_USAGE_DIR"
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-13T10:00:00Z","model":"claude-opus-4","tokens_in":300,"tokens_out":150,"cost_usd":0.015}
JSON
  unset OTEL_EXPORTER_OTLP_ENDPOINT
  run bash scripts/factory/usage-report.sh --otel
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: usage-report unbekannte Felder kein Crash" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/claude"; mkdir "$CLAUDE_USAGE_DIR"
  export OPENCLAW_USAGE_DIR="$t/openclaw"; mkdir "$OPENCLAW_USAGE_DIR"
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"weird_field":true,"unknown":"data"}
{"timestamp":"2026-06-12T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"2026-06-12"* ]]
}

@test "FA-SF-37-retry: usage-report beide Tools gemischt" {
  local t; t=$(mktemp -d); trap "rm -rf '$t'" EXIT
  export CLAUDE_USAGE_DIR="$t/claude"; mkdir "$CLAUDE_USAGE_DIR"
  export OPENCLAW_USAGE_DIR="$t/openclaw"; mkdir "$OPENCLAW_USAGE_DIR"
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-10T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
JSON
  cat > "$OPENCLAW_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-10T11:00:00Z","model":"claude-sonnet-4","tokens_in":50,"tokens_out":25,"cost_usd":0.001}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"claude-code"* ]]
  [[ "$output" == *"openclaw"* ]]
}
