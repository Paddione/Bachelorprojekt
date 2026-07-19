#!/usr/bin/env bats
# tests/spec/background-agents-fallback.bats
# T001978: background-agents empty-output fallback (qwen35-iq4 → qwen35-hq).
# Drift-Guard: source-inspection of the plugin's TypeScript module. The
# runtime path is too heavy to instantiate in a unit test (it depends on
# the live opencode SDK + an actual delegated session), so we assert the
# presence of the Fallback-Code-Surface: type fields, finalizeDelegation
# branch, and the delegation dispatch.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  PLUGIN="$REPO_ROOT/.opencode/skills/dev-flow/background-agents.ts"
}

# 1. RED-Sanity: the new `fallbackFor` and `fallbackTriggered` fields
# are referenced in the DelegationRecord interface. Without the fix, the
# types are missing → fallback branch in finalizeDelegation cannot even
# type-check, let alone run.
@test "T001978: DelegationRecord has fallbackFor and fallbackTriggered fields" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  grep -qE 'fallbackFor\?:' "$PLUGIN" \
    || { echo "MISSING 'fallbackFor?' field in DelegationRecord"; return 1; }
  grep -qE 'fallbackTriggered\?:' "$PLUGIN" \
    || { echo "MISSING 'fallbackTriggered?' field in DelegationRecord"; return 1; }
}

# 2. RED-Sanity: DelegateInput propagates fallbackFor through to the
# registerDelegation call. Without the fix, the type is missing and the
# fallback dispatch cannot link the child to its parent.
@test "T001978: DelegateInput and registerDelegation propagate fallbackFor" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  grep -qE 'fallbackFor\?:.*\/\/.*\[T001978\]' "$PLUGIN" \
    || { echo "MISSING 'fallbackFor?' in DelegateInput (with T001978 tag)"; return 1; }
  grep -qE 'fallbackFor: input\.fallbackFor' "$PLUGIN" \
    || { echo "MISSING 'fallbackFor: input.fallbackFor' in registerDelegation"; return 1; }
}

# 3. RED-Sanity: finalizeDelegation contains the empty-output check that
# dispatches a qwen35-hq fallback when the original agent was qwen35-iq4
# AND the resolved result is empty. Without the fix the delegation is
# marked complete with no output → silent failure.
@test "T001978: finalizeDelegation dispatches qwen35-hq fallback on qwen35-iq4 empty output" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  # The block must be inside finalizeDelegation (right after the result resolve)
  # and must mention the three conditions + the fallback dispatch.
  grep -qE 'qwen35-iq4' "$PLUGIN" \
    || { echo "MISSING 'qwen35-iq4' check in plugin"; return 1; }
  grep -qE 'fallbackTriggered' "$PLUGIN" \
    || { echo "MISSING 'fallbackTriggered' guard in plugin"; return 1; }
  grep -qE 'agent: "qwen35-hq"' "$PLUGIN" \
    || { echo "MISSING 'agent: \"qwen35-hq\"' fallback dispatch"; return 1; }
  grep -qE 'fallbackFor: delegation\.id' "$PLUGIN" \
    || { echo "MISSING 'fallbackFor: delegation.id' link to fallback"; return 1; }
}

# 4. RED-Sanity: when the fallback itself returns empty, the original
# delegation is marked error with reason "empty_output_after_fallback".
# Without the second branch, the parent never gets a notification after
# a double-empty delegation.
@test "T001978: fallback returning empty marks original as error with empty_output_after_fallback" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  grep -qE 'empty_output_after_fallback' "$PLUGIN" \
    || { echo "MISSING 'empty_output_after_fallback' error reason"; return 1; }
}

# 5. Control test: the agent-models.jsonc still defines qwen35-hq as a
# valid subagent. Without this, the fallback dispatch would fail agent
# validation in delegate() and bubble up to the catch block.
@test "T001978: qwen35-hq is registered in agent-models.jsonc (control test)" {
  AGENT_MODELS="$REPO_ROOT/.opencode/agent-models.jsonc"
  [ -f "$AGENT_MODELS" ] || { echo "MISSING: $AGENT_MODELS"; return 1; }
  grep -qE '"qwen35-hq"' "$AGENT_MODELS" \
    || { echo "MISSING 'qwen35-hq' agent definition"; return 1; }
}

# 6. Control test: default timeout is 25 minutes (T001969 baseline). The
# fallback inherits this — no separate timeout config for the fallback
# run, so the default must be at least 25 min to give qwen35-hq room.
@test "T001978: DEFAULT_MAX_RUN_TIME_MS is at least 25 minutes (control test for fallback room)" {
  [ -f "$PLUGIN" ] || { echo "MISSING plugin: $PLUGIN"; return 1; }
  grep -qE 'DEFAULT_MAX_RUN_TIME_MS = 25 \* 60 \* 1000' "$PLUGIN" \
    || { echo "MISSING 25-min DEFAULT_MAX_RUN_TIME_MS (T001969 baseline)"; return 1; }
}
