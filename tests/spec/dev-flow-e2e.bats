#!/usr/bin/env bats
# tests/spec/dev-flow-e2e.bats
# SSOT: .agents/skills/dev-flow-e2e/SKILL.md
#
# Verification and regression tests for the dev-flow-e2e skill:
# - Agent routing (bachelorprojekt-test)
# - Branch naming constraints (no test/* branches, ticketed chore/* for test-only work)
# - Commit scope conventions (test(test): ... not e2e per T002328)
# - Playwright working directory and setup expectations (tests/e2e/ and SKIP_DB_PURGE=1)
# - Tag annotation requirement for scoped PR runs (@tag)
# - Optional headed verification specification (T002467)
# - Closure handoff to mishap-tracker and operations-management

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SKILL="$REPO_ROOT/.agents/skills/dev-flow-e2e/SKILL.md"
  PWCONF="$REPO_ROOT/tests/e2e/playwright.config.ts"
}

# ── 1. Frontmatter and Agent Routing ──────────────────────────────────────────

@test "dev-flow-e2e: frontmatter assigns bachelorprojekt-test agent" {
  run grep -n "^agent:[[:space:]]*bachelorprojekt-test" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: frontmatter description mentions post-merge E2E execution" {
  run grep -n "AFTER dev-flow-execute has merged and deployed" "$SKILL"
  [ "$status" -eq 0 ]
}

# ── 2. Git & Branching Conventions ────────────────────────────────────────────

@test "dev-flow-e2e: documents that test/* branches are forbidden by pre-commit" {
  run grep -nE "(\`test/\*\`|test/\*)-Branches sind nicht erlaubt" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: enforces ticketed chore/* branch prefix for E2E changes" {
  run grep -nE "E2E-Branches nutzen.*\`chore/\`|ticketed.*\`chore/\`" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: enforces commit scope 'test' instead of deprecated 'e2e'" {
  run grep -n "Scope 'test' verwenden — 'e2e' lehnt validate-commit-msg ab" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "test(test): add E2E tests for" "$SKILL"
  [ "$status" -eq 0 ]
}

# ── 3. Execution Working Directory and Environment Setup ──────────────────────

@test "dev-flow-e2e: specifies tests/e2e/ as execution working directory" {
  run grep -n "cd tests/e2e/" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: specifies node_modules / playwright binary check" {
  run grep -n '\[\[ -x \./node_modules/\.bin/playwright \]\] || npm ci' "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: documents SKIP_DB_PURGE=1 flag requirement" {
  run grep -n "SKIP_DB_PURGE=1" "$SKILL"
  [ "$status" -eq 0 ]
}

# ── 4. Tag Annotations and Test Description ───────────────────────────────────

@test "dev-flow-e2e: requires tag annotation in test describe block for PR workflow" {
  run grep -n "PFLICHT: Tag-Annotation für den PR-E2E-Workflow" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "test\.describe.*tag:" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: documents standard feature tags (@smoke, @website, @content-hub, @admin, @factory)" {
  run grep -n "@smoke @website @content-hub @admin @factory" "$SKILL"
  [ "$status" -eq 0 ]
}

# ── 5. Headed-Verify Specification (T002467) ──────────────────────────────────

@test "dev-flow-e2e: specifies headed-verify as optional and non-blocking" {
  run grep -n "Explizit optional — kein Pflichtschritt, kein CI-Gate" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "k8-headed-verify\.spec\.ts" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: checks vision endpoints on port 8094 and fallback port 8091" {
  run grep -n "8094" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "8091" "$SKILL"
  [ "$status" -eq 0 ]
}

# ── 6. Completion Handoff & Framework Support ─────────────────────────────────

@test "dev-flow-e2e: mandates mishap-tracker report at conclusion" {
  run grep -n "mishap-tracker" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: mandates operations-management transition" {
  run grep -n "operations-management" "$SKILL"
  [ "$status" -eq 0 ]
}

@test "dev-flow-e2e: contains Framework mapping section supporting Claude Code, opencode, agy" {
  run grep -n "## Framework mapping" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "\*\*Claude Code\*\*" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "\*\*opencode\*\*" "$SKILL"
  [ "$status" -eq 0 ]
  run grep -n "\*\*agy\*\*" "$SKILL"
  [ "$status" -eq 0 ]
}
