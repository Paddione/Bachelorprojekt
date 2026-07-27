#!/usr/bin/env bats
# tests/unit/verification-block-order.bats
# T002262: Verify that verification-block.md documents the correct ordering:
# regenerate → commit artifacts → check (not just regenerate → check).

REF_FILE=".claude/skills/references/verification-block.md"

@test "verification-block.md exists" {
  [ -f "$REF_FILE" ]
}

@test "regenerate comes before check in the four-command list" {
  # The line numbers of 'regenerate' and 'check' in the command block must
  # be in the correct order.
  local reg_line check_line
  reg_line=$(grep -n 'task freshness:regenerate' "$REF_FILE" | head -1 | cut -d: -f1)
  check_line=$(grep -n 'task freshness:check' "$REF_FILE" | head -1 | cut -d: -f1)
  [ -n "$reg_line" ]
  [ -n "$check_line" ]
  [ "$reg_line" -lt "$check_line" ]
}

@test "commit step is documented between regenerate and check" {
  # There must be a mention of committing/git add between regenerate and check
  # in the four-command block area (within 10 lines after regenerate).
  local reg_line
  reg_line=$(grep -n 'task freshness:regenerate' "$REF_FILE" | head -1 | cut -d: -f1)
  [ -n "$reg_line" ]
  # Search the next 15 lines for a commit/artefakte mention
  local region
  region=$(sed -n "$((reg_line + 1)),$((reg_line + 15))p" "$REF_FILE")
  [[ "$region" == *"commit"* ]] || [[ "$region" == *"committ"* ]] || [[ "$region" == *"git add"* ]] || {
    echo "No commit step found between regenerate and check (lines $((reg_line+1))–$((reg_line+15)))"
    echo "Region content:"
    echo "$region"
    return 1
  }
}
