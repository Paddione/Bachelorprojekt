#!/usr/bin/env bats
# tests/spec/plan-partials-embedding/size-gate.bats
# SSOT: openspec/changes/plan-partials-embedding/
# Verifies plan-lint.sh Größen-Gate >7000 Token.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMP="$(mktemp -d)"
  # Create a minimal plan with tasks.d/ for testing
  PLAN_DIR="$TMP/plan"
  mkdir -p "$PLAN_DIR/tasks.d"
  cat > "$PLAN_DIR/tasks.md" <<'EOF'
---
title: test
ticket_id: T999999
domains: [scripts]
status: planning
---

# Implementation Plan

## File Structure

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-small.md` | impl | `scripts/foo.sh` | |
| p2 | `tasks.d/p2-large.md` | tests | `scripts/bar.bats` | p1 |

## Verify Task (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
EOF
  # Small partial: well under 7000 tokens (~700 chars = ~175 tokens)
  printf '# Small partial\n\n%s\n' "$(printf 'x%.0s' {1..600})" > "$PLAN_DIR/tasks.d/p1-small.md"
  # Large partial: generate enough content to exceed 7000 tokens (28000+ chars)
  printf '# Large partial\n\n%s\n' "$(printf 'word repetition line. %.0s' {1..3000})" > "$PLAN_DIR/tasks.d/p2-large.md"
}

teardown() { rm -rf "$TMP"; }

@test "Groessen-Gate: >7000 Token -> hard fail gelistet" {
  run bash "$REPO/scripts/plan-lint.sh" --json "$PLAN_DIR/tasks.md"
  echo "Output: $output"
  [ "$status" -eq 1 ]
  # Must contain the T002453-C hard fail message for the large partial
  [[ "$output" == *"T002453-C"* ]]
  [[ "$output" == *"FAIL"* ]]
}

@test "Groessen-Gate: 6999 Token passiert (kein Fail)" {
  # Create a partial with exactly 6999 tokens worth of content
  # 6999 tokens * 4 chars/token = 27996 chars target
  # printf('x' * 27975) = 27975, plus prefix "# Just under threshold\n" = 23, plus trailing newline = 1
  # Total = 27975 + 23 + 1 = 27999 bytes → floor((27999+3)/4) = 7000 ≤ 7000 passes
  cat > "$PLAN_DIR/tasks.d/p2-large.md" <<EOF
# Just under threshold
$(printf 'x%.0s' {1..27975})
EOF
  run bash "$REPO/scripts/plan-lint.sh" --json "$PLAN_DIR/tasks.md"
  echo "Output: $output"
  # Should still pass (completely unrelated failures may occur for test plans)
  # But must NOT have the T002453-C message
  [[ "$output" != *"T002453-C"* ]]
}

@test "Groessen-Gate Schwelle 7000 in plan-lint.sh vorhanden" {
  run grep -n '7000' "$REPO/scripts/plan-lint.sh"
  [ "$status" -eq 0 ]
}

@test "Groessen-Gate nur im Partial-Modus aktiv" {
  # Plan ohne tasks.d/ darf nicht fehlschlagen
  mkdir -p "$TMP/plan2"
  cat > "$TMP/plan2/simple.md" <<'EOF'
---
title: simple
ticket_id: T999999
domains: [scripts]
status: planning
---

# Implementation Plan

## File Structure

## Verify Task (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
EOF
  run bash "$REPO/scripts/plan-lint.sh" --json "$TMP/plan2/simple.md"
  echo "Output: $output"
  # Must not contain T002453-C (no tasks.d/ = no size gate)
  [[ "$output" != *"T002453-C"* ]]
}
