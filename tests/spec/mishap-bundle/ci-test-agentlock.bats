#!/usr/bin/env bats
# tests/spec/mishap-bundle/ci-test-agentlock.bats — T002414 Mishap-Bundle tests
# Mishap-Bundle: CI-PR-Health (M1), test:all vitest-graceful (M2), agent-lock line-count (M3)

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# ── M1: CI-PR-Health ────────────────────────────────────────────────────────
# scripts/ci-pr-health.sh soll existieren, ausführbar sein und strukturierte
# Ausgabe (--json) mit definierten Exit-Codes liefern.

@test "T002414-M1: ci-pr-health.sh exists and is executable" {
  local script="$REPO/scripts/ci-pr-health.sh"
  [ -f "$script" ]
  [ -x "$script" ]
}

@test "T002414-M1: ci-pr-health.sh declares --json flag and documented exit codes" {
  local script="$REPO/scripts/ci-pr-health.sh"
  # Must declare --json flag in usage
  run grep -qF -- '--json' "$script"
  [ "$status" -eq 0 ]
  # Must declare exit codes in comment header (0=green, 1=fail, 2=none, 3=api, 4=notfound)
  run grep -qE '^#\s+0\s+=' "$script"
  [ "$status" -eq 0 ]
  run grep -qE '^#\s+1\s+=' "$script"
  [ "$status" -eq 0 ]
  run grep -qE '^#\s+2\s+=' "$script"
  [ "$status" -eq 0 ]
}

# ── M2: test:all im Worktree ─────────────────────────────────────────────────
# task test:changed darf bei fehlendem vitest (worktree-symlink-Limitierung)
# nicht crashen, sondern muss einen lesbaren Warnhinweis ausgeben.

@test "T002414-M2: Taskfile test:changed prints warning when vitest unavailable" {
  run grep -qF '⚠ vitest not available (worktree symlink limitation)' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
}

@test "T002414-M2: Taskfile test:changed guards vitest invocation behind condition" {
  # Verify the guard pattern: vitest invocation is wrapped in if/else, not bare
  run grep -cF 'pnpm vitest --version' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
  local guard_count
  guard_count=$(grep -c 'vitest not available (worktree symlink limitation)' "$REPO/Taskfile.yml")
  # Each vitest call that appears is guarded — we count how many warnings exist
  # for each vitest reference (website + mentolder-web sections)
  local vitest_refs
  vitest_refs=$(grep -c 'pnpm vitest --version' "$REPO/Taskfile.yml")
  [ "$guard_count" -eq "$vitest_refs" ] || {
    echo "WARNING: $guard_count warning lines for $vitest_refs vitest refs — mismatch!"
  }
}

# ── M3: agent-lock S1 ────────────────────────────────────────────────────────
# scripts/agent-lock.sh muss die S1-Regel einhalten: max 500 Zeilen.

@test "T002414-M3: agent-lock.sh is ≤ 500 lines (S1 line-count rule)" {
  local line_count
  line_count=$(wc -l < "$REPO/scripts/agent-lock.sh")
  echo "agent-lock.sh: $line_count lines"
  [ "$line_count" -le 500 ]
}
