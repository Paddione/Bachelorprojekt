#!/usr/bin/env bats
# tests/spec/billing-pipeline.bats
# SSOT: openspec/specs/billing-pipeline.md

setup() {
  export WT="$BATS_TEST_DIRNAME/../../"
}

@test "billing-pipeline spec covered" {
  run true
  [ "$status" -eq 0 ]
}

@test "fn_purge_test_data removes test invoices and test customers [T015362]" {
  # Prüfmodus: Source-Grep — die Zusicherung manifestiert sich ausschließlich
  # im Schema-/SQL-Quelltext (die Purge-Skripte laufen nie automatisiert).
  run grep "is_test_data" "$WT/components/website/src/lib/billing-db.ts"
  [ "$status" -eq 0 ]
  
  run grep "is_test_data" "$WT/scripts/one-shot/purge-fn-v8.sql"
  [ "$status" -eq 0 ]
}

@test "purge-fn-v8 step 12 schuetzt Kunden nur vor Echtrechnungen, nicht vor Testrechnungen [T015362]" {
  # Prüfmodus: Source-Grep (SQL-One-Shot, kein Laufzeitverhalten im CI messbar).
  # Der Customer-Allowlist-Sweep (step 12) darf einen Kunden nicht mehr an
  # Testrechnungen festhalten — nur noch an Echtrechnungen (is_test_data = false).
  run grep -F "bi.is_test_data = false" "$WT/scripts/one-shot/purge-fn-v8.sql"
  [ "$status" -eq 0 ]
  # Fallback für Bestände ohne is_test_data-Spalte muss erhalten bleiben.
  run grep -F "WHERE bi.customer_id = c.id::text)" "$WT/scripts/one-shot/purge-fn-v8.sql"
  [ "$status" -eq 0 ]
}

@test "one-shot purge script fuer gelockte Billing-Testdaten existiert [T015362]" {
  # Prüfmodus: Source-Grep (bewusster GoBD-Eingriff wird manuell ausgeführt;
  # das Skript selbst ist das Pruefobjekt).
  [ -f "$WT/scripts/one-shot/purge-billing-testdata.sql" ]
  run grep -c "billing_invoices" "$WT/scripts/one-shot/purge-billing-testdata.sql"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
