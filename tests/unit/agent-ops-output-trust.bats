#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# agent-ops-output-trust.bats — Regression guard for T000288
# ═══════════════════════════════════════════════════════════════════
# The bachelorprojekt-ops agent once narrated a confident-but-false
# diagnosis from a corrupted PTY (run_shell_command echoed input;
# `date` returned the literal username instead of real output).
#
# The fixable hazard is the FABRICATION, not the broken shell. These
# tests assert the agent system prompt carries an explicit
# output-trust / shell-session-integrity discipline so the guidance
# cannot be silently dropped by a future edit.
# ═══════════════════════════════════════════════════════════════════

load test_helper

AGENT_FILE="${PROJECT_DIR}/.claude/agents/bachelorprojekt-ops.md"

@test "bachelorprojekt-ops agent file exists" {
  [ -f "$AGENT_FILE" ]
}

@test "ops agent has an output-trust / shell-integrity section" {
  run grep -qiE '^##[[:space:]].*(output[- ]trust|shell[- ]session|session[- ]integrity)' "$AGENT_FILE"
  [ "$status" -eq 0 ]
}

@test "ops agent warns about echoed input / stale PTY buffer" {
  run grep -qiE '(echo(es|ed|ing)?[[:space:]].*(input|command)|stale[[:space:]].*(buffer|prompt|pty)|desync)' "$AGENT_FILE"
  [ "$status" -eq 0 ]
}

@test "ops agent forbids fabricating a diagnosis from unverified output" {
  run grep -qiE '(never|do not|don.t)[[:space:]].*(fabricat|conclu|diagnos|narrat|trust)' "$AGENT_FILE"
  [ "$status" -eq 0 ]
}

@test "ops agent prescribes the trivial verifiable probe" {
  run grep -qF 'kubectl get nodes --context fleet' "$AGENT_FILE"
  [ "$status" -eq 0 ]
}

@test "ops agent tells the agent to report the broken environment instead" {
  run grep -qiE '(report|surface|stop|abort|bail).*(broken|corrupt|unreliable|environment|session)' "$AGENT_FILE"
  [ "$status" -eq 0 ]
}
