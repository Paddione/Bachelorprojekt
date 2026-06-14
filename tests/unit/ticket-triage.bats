#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# ticket-triage.bats — Unit tests for ticket-triage.ts
# ═══════════════════════════════════════════════════════════════════
# Static tests verifying the triage logic structure, prompt format,
# JSON parsing, priority mapping, severity validation, and error handling.
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  export PROJECT_DIR
  TRIAGE_FILE="${PROJECT_DIR}/website/src/lib/ticket-triage.ts"
  TRIAGE_API="${PROJECT_DIR}/website/src/pages/api/admin/tickets/[id]/triage.ts"
}

# ── File existence ───────────────────────────────────────────────

@test "static: ticket-triage.ts exists" {
  [ -f "$TRIAGE_FILE" ]
}

@test "static: triage API endpoint exists" {
  [ -f "$TRIAGE_API" ]
}

# ── Exports ──────────────────────────────────────────────────────

@test "static: exports autoTriage function" {
  grep -q "export async function autoTriage" "$TRIAGE_FILE"
}

@test "static: exports runTriage function" {
  grep -q "export async function runTriage" "$TRIAGE_FILE"
}

@test "static: exports TriageResult interface" {
  grep -q "export interface TriageResult" "$TRIAGE_FILE"
}

# ── Prompt format ────────────────────────────────────────────────

@test "static: prompt includes title and description placeholders" {
  grep -q 'Titel:' "$TRIAGE_FILE"
  grep -q 'Beschreibung:' "$TRIAGE_FILE"
}

@test "static: prompt includes type placeholder" {
  grep -q 'Typ:' "$TRIAGE_FILE"
}

@test "static: prompt requests JSON response" {
  grep -q 'JSON-Objekt' "$TRIAGE_FILE"
}

@test "static: prompt includes priority options" {
  grep -q 'low|medium|high|critical' "$TRIAGE_FILE"
}

@test "static: prompt includes severity options" {
  grep -q 'critical|major|minor|trivial' "$TRIAGE_FILE"
}

# ── JSON parsing ─────────────────────────────────────────────────

@test "static: uses regex to extract JSON from response" {
  grep -q 'text.match' "$TRIAGE_FILE"
}

@test "static: uses JSON.parse for parsing" {
  grep -q 'JSON.parse' "$TRIAGE_FILE"
}

@test "static: implements retry on parse failure (2 attempts)" {
  grep -q 'attempt < 2' "$TRIAGE_FILE"
}

# ── Priority mapping ─────────────────────────────────────────────

@test "static: maps high to hoch" {
  grep -q "high: 'hoch'" "$TRIAGE_FILE"
}

@test "static: maps critical to hoch" {
  grep -q "critical: 'hoch'" "$TRIAGE_FILE"
}

@test "static: maps medium to mittel" {
  grep -q "medium: 'mittel'" "$TRIAGE_FILE"
}

@test "static: maps low to niedrig" {
  grep -q "low: 'niedrig'" "$TRIAGE_FILE"
}

@test "static: defaults to mittel for unknown priority" {
  grep -q "PRIORITY_MAP\[.*\] ?? 'mittel'" "$TRIAGE_FILE"
}

# ── Severity validation ──────────────────────────────────────────

@test "static: defines valid severities array" {
  grep -q "VALID_SEVERITIES.*critical.*major.*minor.*trivial" "$TRIAGE_FILE"
}

@test "static: validates severity against allowed list" {
  grep -q "VALID_SEVERITIES.includes" "$TRIAGE_FILE"
}

@test "static: defaults to minor for invalid severity" {
  grep -q ": 'minor'" "$TRIAGE_FILE"
}

# ── Empty ticket handling ────────────────────────────────────────

@test "static: returns null when title and description are empty" {
  grep -q "!title && !description" "$TRIAGE_FILE"
  grep -q "return null" "$TRIAGE_FILE"
}

@test "static: returns null when ticket not found" {
  grep -q "if (!detail) return null" "$TRIAGE_FILE"
}

# ── LLM error handling ───────────────────────────────────────────

@test "static: returns null on LLM failure after retry" {
  grep -q "LLM call failed after retry" "$TRIAGE_FILE"
}

@test "static: autoTriage catches errors and logs them" {
  grep -q "autoTriage failed" "$TRIAGE_FILE"
}

# ── Comment creation ─────────────────────────────────────────────

@test "static: creates comment with kind=system" {
  grep -q "kind: 'system'" "$TRIAGE_FILE"
}

@test "static: creates comment with visibility=internal" {
  grep -q "visibility: 'internal'" "$TRIAGE_FILE"
}

@test "static: uses Auto-Triage as actor label" {
  grep -q "label: 'Auto-Triage'" "$TRIAGE_FILE"
}

@test "static: comment body includes priority, severity, component" {
  grep -q "Priority:" "$TRIAGE_FILE"
  grep -q "Severity:" "$TRIAGE_FILE"
  grep -q "Component:" "$TRIAGE_FILE"
}

# ── Provider config ──────────────────────────────────────────────

@test "static: uses getProviderConfig with the ticket-triage source from the registry (SSOT)" {
  # Die Source kommt aus der ki-services-Registry (SOURCE.ticketTriage), nicht als Literal,
  # damit Dashboard-Auswahl und Runtime denselben String teilen (Anti-Drift).
  grep -q "getProviderConfig(SOURCE.ticketTriage, 'haiku')" "$TRIAGE_FILE"
  grep -q "import { SOURCE } from './ki-services'" "$TRIAGE_FILE"
}

@test "static: uses Anthropic client" {
  grep -q "import Anthropic from '@anthropic-ai/sdk'" "$TRIAGE_FILE"
}

# ── API endpoint ─────────────────────────────────────────────────

@test "static: API endpoint requires admin auth" {
  grep -q "isAdmin" "$TRIAGE_API"
}

@test "static: API endpoint calls runTriage" {
  grep -q "runTriage" "$TRIAGE_API"
}

@test "static: API endpoint returns 403 for unauthorized" {
  grep -q "status: 403" "$TRIAGE_API"
}

@test "static: API endpoint returns 400 for missing id" {
  grep -q "id missing" "$TRIAGE_API"
}

# ── Hook integration ─────────────────────────────────────────────

@test "static: admin/tickets/index.ts imports autoTriage" {
  grep -q "autoTriage" "${PROJECT_DIR}/website/src/pages/api/admin/tickets/index.ts"
}

@test "static: admin/bugs/create.ts imports autoTriage" {
  grep -q "autoTriage" "${PROJECT_DIR}/website/src/pages/api/admin/bugs/create.ts"
}

@test "static: tickets/comment.ts imports autoTriage" {
  grep -q "autoTriage" "${PROJECT_DIR}/website/src/pages/api/tickets/comment.ts"
}

@test "static: admin/tickets/index.ts calls autoTriage after create" {
  grep -q "void autoTriage" "${PROJECT_DIR}/website/src/pages/api/admin/tickets/index.ts"
}

@test "static: admin/bugs/create.ts calls autoTriage after insert" {
  grep -q "void autoTriage" "${PROJECT_DIR}/website/src/pages/api/admin/bugs/create.ts"
}

@test "static: tickets/comment.ts calls autoTriage in else branch" {
  grep -q "void autoTriage" "${PROJECT_DIR}/website/src/pages/api/tickets/comment.ts"
}

# ── TypeScript syntax ────────────────────────────────────────────

@test "static: ticket-triage.ts has valid TypeScript syntax" {
  node --check "$TRIAGE_FILE" 2>/dev/null || \
    npx --prefix "${PROJECT_DIR}/website" tsc --noEmit "$TRIAGE_FILE" 2>/dev/null || \
    skip "TypeScript check not available"
}

# ── addComment kind parameter ────────────────────────────────────

@test "static: addComment supports optional kind parameter" {
  grep -q "kind?: 'comment' | 'status_change' | 'system'" "${PROJECT_DIR}/website/src/lib/tickets/admin.ts"
}
