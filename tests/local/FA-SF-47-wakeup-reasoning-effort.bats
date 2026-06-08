#!/usr/bin/env bats
# FA-SF-47: wakeup.sh must NOT set reasoning_effort. [T000519]
# The Workflow harness forces thinking.type=disabled for nested agent() spawns.
# If reasoning_effort is ALSO set (via --effort or CLAUDE_CODE_EFFORT_LEVEL=<level>),
# the Anthropic-compatible endpoint (e.g. DeepSeek) returns:
#   400 thinking options type cannot be disabled when reasoning_effort is set
# which crashes the dispatcher PREP step. The fix is to leave reasoning_effort UNSET
# (not "low"). These cases are pure static greps — offline/CI-safe.
SCRIPT="scripts/factory/wakeup.sh"

@test "FA-SF-47: wakeup.sh exists and is valid bash" {
  [ -f "$SCRIPT" ]
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-47: claude is NOT invoked with --effort" {
  run grep -Eq -- '--effort' "$SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-47: CLAUDE_CODE_EFFORT_LEVEL is never assigned a non-empty level" {
  # Allowed: `unset CLAUDE_CODE_EFFORT_LEVEL` or `CLAUDE_CODE_EFFORT_LEVEL=` (empty).
  # Forbidden: `CLAUDE_CODE_EFFORT_LEVEL=low|medium|high|max|...`.
  run grep -Eq 'CLAUDE_CODE_EFFORT_LEVEL=[A-Za-z]' "$SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-47: wakeup.sh actively neutralizes any inherited effort level" {
  # autopilot.env may set CLAUDE_CODE_EFFORT_LEVEL; wakeup.sh must unset it.
  run grep -Eq 'unset[[:space:]]+CLAUDE_CODE_EFFORT_LEVEL' "$SCRIPT"
  [ "$status" -eq 0 ]
}
