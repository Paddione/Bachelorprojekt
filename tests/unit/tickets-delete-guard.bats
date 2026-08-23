#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tickets-delete-guard.bats — T015009
#
# Fall T014936 / Incident T015005: Eine non-test-data-Ticket-Zeile
# verschwand spurlos aus tickets.tickets — kein DELETE-Trigger, kein
# Audit. Diese Tests sichern die drei Schichten des Fixes:
#
#   1. Migration legt tickets.ticket_delete_audit + Audit-/Guard-Trigger an
#   2. Guard blockiert non-test-data ohne app.allow_ticket_hard_delete
#   3. fn_audit_log() trackt external_id und is_test_data (Lückenschluss)
#   4. cleanupEphemeral() gibt den Guard transaktionslokal frei
#
# PRUEFMODUS: statischer Kontrakt-Grep (offline, wie purge-fn-gaps.bats).
# Die Live-DB-Verifikation erfolgte bei der Migration-Anwendung (Ticket-
# kommentar); ein CI-Lauf gegen die Dev-Host-DB ist by-design nicht
# verfügbar (ADR-006: SDLC-Daten liegen auf dem Dev-Host).
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
MIGRATION="$PROJECT_DIR/scripts/migrations/2026-08-23-tickets-delete-guard-audit.sql"

@test "T015009: Migrationsdatei existiert" {
  [ -f "$MIGRATION" ]
}

@test "T015009: Delete-Audit-Tabelle ohne FK angelegt (muss CASCADE überleben)" {
  [ -f "$MIGRATION" ]
  grep -q "CREATE TABLE IF NOT EXISTS tickets.ticket_delete_audit" "$MIGRATION"
  # Kein FOREIGN KEY / REFERENCES in der Tabellendefinition — sonst würde
  # der Audit-Eintrag mit dem Ticket kaskadieren (genau der Vorfall).
  ! grep -A8 "CREATE TABLE IF NOT EXISTS tickets.ticket_delete_audit" "$MIGRATION" | grep -qi "references"
}

@test "T015009: BEFORE DELETE Audit-Trigger schreibt Snapshot vor der Löschung" {
  [ -f "$MIGRATION" ]
  grep -q "BEFORE DELETE ON tickets.tickets" "$MIGRATION"
  grep -q "fn_ticket_delete_audit" "$MIGRATION"
  grep -q "to_jsonb(OLD)" "$MIGRATION"
}

@test "T015009: Guard blockiert non-test-data ohne Freigabe-Flag" {
  [ -f "$MIGRATION" ]
  grep -q "fn_tickets_guard_delete" "$MIGRATION"
  grep -q "app.allow_ticket_hard_delete" "$MIGRATION"
  grep -q "RAISE EXCEPTION" "$MIGRATION"
}

@test "T015009: Guard lässt is_test_data=true immer durch (Purge-Pfade intakt)" {
  [ -f "$MIGRATION" ]
  local guard_fn
  guard_fn=$(awk '/fn_tickets_guard_delete\(\)/,/^\\$\\$/' "$MIGRATION")
  echo "$guard_fn" | grep -q "IF OLD.is_test_data THEN"
}

@test "T015009: fn_audit_log trackt external_id und is_test_data (Lückenschluss)" {
  [ -f "$MIGRATION" ]
  grep -q "'external_id','is_test_data'" "$MIGRATION"
}

@test "T015009: cleanupEphemeral gibt den Guard transaktionslokal frei" {
  local src="$PROJECT_DIR/components/website/src/lib/planning-office.ts"
  [ -f "$src" ]
  grep -q "SET LOCAL app.allow_ticket_hard_delete" "$src"
  # SET LOCAL nur innerhalb BEGIN/COMMIT — sonst leakt das Flag in den Pool
  grep -q "BEGIN" "$src"
  grep -q "COMMIT" "$src"
}
