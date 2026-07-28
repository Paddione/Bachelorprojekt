#!/usr/bin/env bats
# tests/spec/mishap-incident-rollup.bats
# T002407 — Mishap-Incident-Rollup: Incident-Typ, Rollup-Container, Skill-Update

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Incident type accepted ─────────────────────────────────────────────────

@test "T002407: incident is a valid mishap type in Go code" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -E '"incident"' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: incident creates immediate ticket (createIncidentTicket function exists)" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'createIncidentTicket' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: broken and security mapped to incident (isIncidentType)" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'isIncidentType' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

# ── Deprecated aliases accepted ────────────────────────────────────────────

@test "T002407: broken is a valid type (deprecated alias for incident)" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -E '"broken"' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: security is a valid type (deprecated alias for incident)" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -E '"security"' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

# ── Rollup container discovery ─────────────────────────────────────────────

@test "T002407: findOrCreateRollupTicket function exists" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'findOrCreateRollupTicket' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: appendToRollupContainer function exists" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'appendToRollupContainer' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: rollup container title constant ROLLUP_TICKET_TITLE is set" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'ROLLUP_TICKET_TITLE' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

@test "T002407: rollup branch constant ROLLUP_BRANCH is set" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'ROLLUP_BRANCH' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -eq 0 ]
}

# ── Go tests exist ─────────────────────────────────────────────────────────

@test "T002407: isIncidentType test exists" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap_test.go" ]
  run grep -F 'TestIsIncidentType' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap_test.go"
  [ "$status" -eq 0 ]
}

@test "T002407: rollup constants test exists" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap_test.go" ]
  run grep -F 'TestRollupConstants' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap_test.go"
  [ "$status" -eq 0 ]
}

# ── Factory integration ────────────────────────────────────────────────────

@test "T002407: wakeup.sh includes --rollup-mishaps" {
  [ -f "$REPO/scripts/factory/wakeup.sh" ]
  run grep -F -e '--rollup-mishaps' "$REPO/scripts/factory/wakeup.sh"
  [ "$status" -eq 0 ]
}

@test "T002407: wakeup.sh references rollup container" {
  [ -f "$REPO/scripts/factory/wakeup.sh" ]
  run grep -F 'Rollup-Container' "$REPO/scripts/factory/wakeup.sh"
  [ "$status" -eq 0 ]
}

# ── Skill update ───────────────────────────────────────────────────────────

@test "T002407: mishap-tracker SKILL.md references incident type" {
  [ -f "$REPO/.claude/skills/mishap-tracker/SKILL.md" ]
  run grep -E 'incident' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "T002407: mishap-tracker SKILL.md references rollup container" {
  [ -f "$REPO/.claude/skills/mishap-tracker/SKILL.md" ]
  run grep -F 'Rollup-Container' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "T002407: mishap-tracker SKILL.md references classification reference" {
  [ -f "$REPO/.claude/skills/mishap-tracker/SKILL.md" ]
  run grep -F 'mishap-classification.md' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "T002407: classification reference file exists" {
  [ -f "$REPO/.claude/skills/references/mishap-classification.md" ]
}

@test "T002407: classification reference mentions incident type" {
  [ -f "$REPO/.claude/skills/references/mishap-classification.md" ]
  run grep -F 'incident' "$REPO/.claude/skills/references/mishap-classification.md"
  [ "$status" -eq 0 ]
}

@test "T002407: classification reference mentions deprecated aliases" {
  [ -f "$REPO/.claude/skills/references/mishap-classification.md" ]
  run grep -F 'deprecated' "$REPO/.claude/skills/references/mishap-classification.md"
  [ "$status" -eq 0 ]
}

# ── No classifyBundle remaining ────────────────────────────────────────────

@test "T002407: classifyBundle is removed from mishap.go" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'func classifyBundle' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -ne 0 ]
}

@test "T002407: createMishapBundleTicket is removed from mishap.go" {
  [ -f "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go" ]
  run grep -F 'func createMishapBundleTicket' "$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  [ "$status" -ne 0 ]
}
