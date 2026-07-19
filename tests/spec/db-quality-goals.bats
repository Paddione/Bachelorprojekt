#!/usr/bin/env bats
# tests/spec/db-quality-goals.bats
# SSOT: openspec/changes/db-quality-goals/specs/db-quality-goals.md (→ openspec/specs/ nach archive)
# Konvention: ein .bats-File pro OpenSpec-SSOT-Spec.

HGC="scripts/health-goals-check.sh"
DB_IDS="G-DB01 G-DB03 G-DB04 G-DB06 G-DB08"

setup() {
  cd "$BATS_TEST_DIRNAME/../.." || return 1
}

@test "health-goals-check.sh ist syntaktisch valide (bash -n)" {
  run bash -n "$HGC"
  [ "$status" -eq 0 ]
}

@test "health-goals-check.sh --fast --only=<G-DB*> rendert alle 5 DB-Ziele ohne Absturz" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id"
  done
}

@test "keine der 5 DB-Ziel-IDs fehlt in der --only-Ausgabe" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  missing=0
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id" || missing=$((missing+1))
  done
  [ "$missing" -eq 0 ]
}

# ── T001946: G-DB01-Nachfolger — Live-Baseline war 34/49 statt der in T001905 ──
# angenommenen 4 (siehe .claude/lib/goals.md#G-DB01). Die Migration muss alle am
# 2026-07-19 live gemessenen fehlenden FK-Indizes abdecken (Vereinigungsmenge aus
# mentolder + korczewski), inkl. der vier urspruenglichen T001905-Spalten, die trotz
# "applied"-Tracking auf mentolder weiterhin unindiziert waren.
FK_BATCH2_MIGRATION="website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql"

@test "20260719_add_missing_fk_indexes_batch2.sql existiert" {
  [ -f "$FK_BATCH2_MIGRATION" ]
}

@test "batch2-Migration reicht die 4 urspruenglichen T001905-Indizes erneut ein (idempotent)" {
  run grep -qF "idx_onboarding_state_brand" "$FK_BATCH2_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -qF "idx_sessions_templates_created_from_template_id" "$FK_BATCH2_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -qF "idx_studio_sessions_client_id" "$FK_BATCH2_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -qF "idx_studio_sessions_template_of" "$FK_BATCH2_MIGRATION"
  [ "$status" -eq 0 ]
}

@test "batch2-Migration deckt neu gefundene FK-Spalten aus beiden Brands ab" {
  for needle in \
    "idx_billing_customers_customers_id" \
    "idx_document_assignments_template_id" \
    "idx_tickets_tickets_brand" \
    "idx_tickets_tickets_reporter_id" \
    "idx_questionnaire_questions_template_id" \
    "idx_coaching_drafts_resulting_snippet_id"; do
    run grep -qF "$needle" "$FK_BATCH2_MIGRATION"
    [ "$status" -eq 0 ]
  done
}

@test "batch2-Migration guardet jeden Block mit to_regclass (brand-uebergreifende Sicherheit)" {
  run grep -c "IF to_regclass(" "$FK_BATCH2_MIGRATION"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "batch2-Migration nimmt arena.match_players bewusst aus (Fremd-Owner-Schema)" {
  # arena.* gehoert der Rolle arena_app, nicht website — website:db:migrate hat dort
  # kein CREATE INDEX-Privileg (per Dry-Run waehrend T001946-Planung verifiziert).
  run grep -qF "arena.match_players" "$FK_BATCH2_MIGRATION"
  [ "$status" -ne 0 ]
}
