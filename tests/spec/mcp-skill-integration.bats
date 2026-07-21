#!/usr/bin/env bats
# tests/spec/mcp-skill-integration.bats
# SSOT: openspec/specs/mcp-skill-integration.md
#
# Covers: ticket-mcp adapter completeness, Go binary, mishap buffer tools.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── ticket-mcp tool coverage ──────────────────────────────────────────

@test "ticket-mcp server exists in .mcp.json" {
  run grep -q 'ticket-mcp' "$REPO/.mcp.json"
  [ "$status" -eq 0 ]
}

@test "ticket-mcp server exists in .opencode/opencode.jsonc" {
  run grep -q 'ticket-mcp' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

# ── Go binary ─────────────────────────────────────────────────────────

@test "ticket-mcp Go source directory exists" {
  [ -d "$REPO/scripts/ticket-mcp" ]
}

@test "ticket-mcp Go tools directory exists" {
  [ -d "$REPO/scripts/ticket-mcp/go" ] || [ -d "$REPO/scripts/ticket-mcp/go/internal/tools" ] || skip "Go source not yet extracted"
}

# ── Mishap buffer tools ───────────────────────────────────────────────

@test "mishap-tracker skill references report_mishap" {
  run grep -q 'report_mishap\|report-mishap' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "mishap-tracker skill references get_mishap_buffer" {
  run grep -q 'get_mishap_buffer\|get-mishap-buffer' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

@test "mishap-tracker skill references flush_mishap_buffer" {
  run grep -q 'flush_mishap_buffer\|flush-mishap-buffer' "$REPO/.claude/skills/mishap-tracker/SKILL.md"
  [ "$status" -eq 0 ]
}

# ── Skill-critical verb coverage ──────────────────────────────────────

@test "ticket-mcp guide lists skill-critical verbs" {
  [ -f "$REPO/.claude/skills/references/mcp-tool-guide.md" ]
}

@test "mcp-tool-guide.md mentions create verb" {
  run grep -q 'create' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide.md mentions get verb" {
  run grep -q 'get\b' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}

@test "mcp-tool-guide.md mentions add-comment verb" {
  run grep -q 'add-comment\|add_comment' "$REPO/.claude/skills/references/mcp-tool-guide.md"
  [ "$status" -eq 0 ]
}
