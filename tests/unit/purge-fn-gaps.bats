#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# purge-fn-gaps.bats — Static regression tests for the three gaps
#   identified in the test-data purge pipeline (T000213):
#
#   Gap 1: meetings leak from booking-flow seeds
#   Gap 2: questionnaire_templates leak from fa-fragebogen
#   Gap 3: /api/admin/testdata/purge.ts lacks CRON_SECRET auth
#
# Runs entirely offline — no database required.
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

# ── Gap 1: meetings sweep ─────────────────────────────────────────

@test "gap1: latest purge-fn migration sweeps meetings with [TEST]% meeting_type before customers" {
  local latest
  latest=$(ls -1 "$PROJECT_DIR/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)
  [ -n "$latest" ] || fail "no purge-fn-v*.sql found in scripts/one-shot/"
  grep -q "meeting_type LIKE '\[TEST\]%'" "$latest"
}

@test "gap1: meetings sweep appears before customer allowlist sweep in purge function" {
  local latest
  latest=$(ls -1 "$PROJECT_DIR/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)
  [ -n "$latest" ] || fail "no purge-fn-v*.sql found"
  local meetings_line customers_line
  meetings_line=$(grep -n "meeting_type LIKE" "$latest" | head -1 | cut -d: -f1)
  customers_line=$(grep -n "Customer allowlist sweep\|DELETE FROM customers" "$latest" | head -1 | cut -d: -f1)
  [ -n "$meetings_line" ] || fail "meetings sweep line not found"
  [ -n "$customers_line" ] || fail "customers sweep line not found"
  [ "$meetings_line" -lt "$customers_line" ]
}

# ── Gap 2: questionnaire_templates sweep ──────────────────────────

@test "gap2: latest purge-fn migration sweeps questionnaire_templates with e2e-% title" {
  local latest
  latest=$(ls -1 "$PROJECT_DIR/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)
  [ -n "$latest" ] || fail "no purge-fn-v*.sql found"
  grep -q "questionnaire_templates" "$latest"
  grep -q "title LIKE 'e2e-%" "$latest"
}

@test "gap2: questionnaire_templates sweep appears before questionnaire_assignments step" {
  local latest
  latest=$(ls -1 "$PROJECT_DIR/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)
  [ -n "$latest" ] || fail "no purge-fn-v*.sql found"
  local templates_line assignments_line
  templates_line=$(grep -n "DELETE FROM questionnaire_templates" "$latest" | head -1 | cut -d: -f1)
  assignments_line=$(grep -n "DELETE FROM questionnaire_assignments WHERE is_test_data" "$latest" | head -1 | cut -d: -f1)
  [ -n "$templates_line" ] || fail "questionnaire_templates sweep not found"
  [ -n "$assignments_line" ] || fail "questionnaire_assignments sweep not found"
  [ "$templates_line" -lt "$assignments_line" ]
}

# ── Gap 3: CRON_SECRET auth in purge.ts ───────────────────────────

@test "gap3: /api/admin/testdata/purge.ts accepts X-Cron-Secret auth" {
  local f="$PROJECT_DIR/website/src/pages/api/admin/testdata/purge.ts"
  [ -f "$f" ] || fail "purge.ts not found"
  grep -q "X-Cron-Secret" "$f"
}

@test "gap3: purge.ts CRON_SECRET check mirrors pattern from purge-all-test-data.ts" {
  local f="$PROJECT_DIR/website/src/pages/api/admin/testdata/purge.ts"
  [ -f "$f" ] || fail "purge.ts not found"
  grep -q "CRON_SECRET" "$f"
}
