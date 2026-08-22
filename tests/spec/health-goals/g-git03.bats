#!/usr/bin/env bats
# SSOT: openspec/specs/health-goals.md
# Ticket: T013107 — G-GIT03 Target-Parität zwischen goals.md und health-goals-check.sh

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  GOALS_MD="${REPO_ROOT}/.claude/lib/goals.md"
  CHECK_SH="${REPO_ROOT}/scripts/health-goals-check.sh"
}

@test "G-GIT03 target in health-goals-check.sh matches goals.md target (7)" {
  local target_check target_doc

  # Target aus scripts/health-goals-check.sh extrahieren
  target_check=$(grep -E '\brow +(gate|target) +G-GIT03\b' "$CHECK_SH" | awk '{for(i=1;i<=NF;i++) if($i=="le"||$i=="ge"||$i=="eq") print $(i+1)}')

  # Target aus .claude/lib/goals.md extrahieren
  target_doc=$(grep -E '^\| +\*\*G-GIT03\*\*' "$GOALS_MD" | awk -F'|' '{print $5}' | grep -oE '[0-9]+')

  [ -n "$target_check" ]
  [ -n "$target_doc" ]

  [ "$target_check" -eq 7 ]
  [ "$target_doc" -eq 7 ]
  [ "$target_check" -eq "$target_doc" ]
}
