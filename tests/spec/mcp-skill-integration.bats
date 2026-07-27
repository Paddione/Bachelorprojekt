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

# ── T002383: Mishap-Emissionsrate ─────────────────────────────────────
# Gemessen am 2026-07-28: bis zum 25.07. wurde jedes erzeugte Mishap-Bundle am
# selben Tag geschlossen. Am 27.07. entstanden 32 Bundles, 19 blieben offen;
# 17 der 29 triage-Tickets waren Mishap-Bundles.
#
# Der Mechanismus ist selbstverstaerkend: Jeder dev-flow-Zyklus endet mit einem
# mishap-tracker-Aufruf, der bei MISHAP_TRIGGER Eintraegen ein Ticket erzeugt —
# und dieses Ticket braucht seinerseits einen Zyklus. Bei >= 1 Bundle pro Zyklus
# ist der Rueckstand per Konstruktion nicht abbaubar (Eigenmessung: 2 Zyklen,
# 2 Bundles).
#
# Eine hoehere Schwelle senkt die Emissionsrate unter 1 Bundle/Zyklus, ohne
# einen einzigen Mishap zu verlieren.

@test "T002383: MISHAP_TRIGGER is raised above the per-cycle emission rate" {
  local src="$REPO/scripts/ticket-mcp/go/internal/tools/mishap.go"
  run grep -Eq '^const MISHAP_TRIGGER = 10$' "$src"
  [ "$status" -eq 0 ]
}

@test "T002383: the skill no longer forces a session-end flush below the trigger" {
  # Der Buffer liegt in .git/mishap-buffer.json (mishapBufferPath()) — er ist
  # dateibasiert und ueberlebt Sessionwechsel. Die bisherige Begruendung, am
  # Session-Ende ginge sonst etwas verloren, ist damit sachlich falsch; genau
  # dieser erzwungene Flush erzeugte Ein-Eintrag-Bundles wie T002382.
  local skill="$REPO/.claude/skills/mishap-tracker/SKILL.md"
  run grep -q 'am Session-Ende nichts verloren geht' "$skill"
  [ "$status" -ne 0 ]
}

@test "T002383: the skill documents that the buffer survives a session" {
  # Gegenprobe zum Test darueber: Der Flush darf nicht ersatzlos verschwinden,
  # sondern muss durch die Aussage ersetzt sein, dass Liegenbleiben sicher ist.
  # Ohne das laesst der geloeschte Absatz den Leser ratlos zurueck.
  local skill="$REPO/.claude/skills/mishap-tracker/SKILL.md"
  run grep -Eq 'mishap-buffer\.json|ueberlebt|überlebt|persistent' "$skill"
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
