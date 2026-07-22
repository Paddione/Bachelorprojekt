#!/usr/bin/env bash
# tests/spec/fixtures/make-partial-plan.sh <change-dir> <mode>
# Builds a plan-lint-conformant partial-plan fixture inside <change-dir>:
#   tasks.md            — index with frontmatter, File Structure, ## Partials manifest,
#                         and a final verify task listing the three gate commands.
#   tasks.d/p1-impl.md  — impl partial (its own target_files)
#   tasks.d/p2-tests.md — tests partial (carries the STRUCT2 failing-test step)
# mode=ok        → disjoint target_files (should PASS plan-lint partial mode)
# mode=duplicate → the same file in both partials (should HARD-FAIL D1)
set -euo pipefail
CHG="${1:?usage: make-partial-plan.sh <change-dir> <mode>}"
MODE="${2:?usage: make-partial-plan.sh <change-dir> <mode>}"
mkdir -p "$CHG/tasks.d"

# In duplicate mode both partials claim a.sh; in ok mode they are disjoint.
case "$MODE" in
  duplicate) P1_FILES="a.sh"; P1_ROW="a.sh" ;;
  ok)        P1_FILES="a.sh"; P1_ROW="a.sh" ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac
case "$MODE" in
  duplicate) P2_FILES="a.sh, a.test.bats"; P2_ROW="a.sh, a.test.bats" ;;
  ok)        P2_FILES="b.sh, a.test.bats"; P2_ROW="b.sh, a.test.bats" ;;
esac

cat > "$CHG/tasks.md" <<EOF
---
title: "fixture — Implementation Plan"
ticket_id: T000000
domains: [test]
status: active
---

# fixture — Implementation Plan

## File Structure

\`\`\`
a.sh          impl
b.sh          impl
a.test.bats   tests
\`\`\`

## Partials

| id | file | role | target_files |
|----|------|------|--------------|
| p1 | tasks.d/p1-impl.md | impl | ${P1_ROW} |
| p2 | tasks.d/p2-tests.md | tests | ${P2_ROW} |

### Task: Verify

Final gate:

\`\`\`bash
task test:changed
task freshness:regenerate
task freshness:check
\`\`\`
EOF

cat > "$CHG/tasks.d/p1-impl.md" <<EOF
# p1 — impl

### Task: implement a.sh

Target files: ${P1_FILES}. Implement the behaviour.
EOF

cat > "$CHG/tasks.d/p2-tests.md" <<EOF
# p2 — tests

### Task: failing test first

Write a bats test in \`a.test.bats\` and run it — expected: FAIL (red) before impl.

\`\`\`bash
bats a.test.bats
\`\`\`

Target files: ${P2_FILES}.
EOF
