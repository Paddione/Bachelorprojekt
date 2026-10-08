#!/usr/bin/env bats
# tests/spec/workspace-staging-db-tables.bats
# workspace-staging: fehlende Website-DB-Tabellen + admin-API-500s [T900819].
#
# Pruefmodus: Source-Grep — die Zusicherung manifestiert sich im Schema- und
# Routen-Quelltext (Staging-DB und Cluster sind in CI nicht erreichbar).
# Belegt am 2026-10-07 per kubectl (lesend): alle vier Tabellen existieren heute
# live (post-manuellem `db:migrate` am 2026-09-28 20:00Z, genau die zwei
# migrate-scope Tabellen), aber `schema_migrations` trackt nur 2 von 25
# Migrationsdateien — `runMigrations` laeuft nie automatisch beim Website-Boot
# (Dockerfile-CMD ohne migrate-Hook), und die ConfigMap-Ensure-Skripte decken
# `admin_actions`/`error_log` nicht ab.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCHEMA_CM="$REPO_ROOT/k3d/website-schema.yaml"
  MIGRATIONS="$REPO_ROOT/components/website/src/db/migrations"
  DUNNING_RUN="$REPO_ROOT/components/website/src/pages/api/admin/billing/dunning/run.ts"
  MONTHLY="$REPO_ROOT/components/website/src/pages/api/admin/billing/create-monthly-invoices.ts"
}

# RC-A: admin_actions lebt nur im migrate-Scope (20260525_admin_actions.sql).
# Ohne Ensure-Abdeckung bleibt jede frische/restaurierte Staging-DB ohne Tabelle,
# bis jemand manuell `pnpm db:migrate` ausfuehrt — dann faellt der
# admin-actions-cleanup-CronJob (UPDATE/DELETE auf public.admin_actions) durch.
@test "ensure-Skripte decken public.admin_actions idempotent ab" {
  run grep -E 'CREATE TABLE IF NOT EXISTS (public\.)?admin_actions' "$SCHEMA_CM"
  [ "$status" -eq 0 ] || { echo "kein admin_actions-Ensure in $SCHEMA_CM"; return 1; }
}

# RC-B: error_log lebt nur im migrate-Scope (20260703_create_error_log.sql).
# Ohne Ensure-Abdeckung schluckt persistError() jeden Insert (catch-all) und die
# error-log-Pipeline steht auf 0 Zeilen.
@test "ensure-Skripte decken error_log idempotent ab" {
  run grep -E 'CREATE TABLE IF NOT EXISTS (public\.)?error_log' "$SCHEMA_CM"
  [ "$status" -eq 0 ] || { echo "kein error_log-Ensure in $SCHEMA_CM"; return 1; }
}

# RC-C: POST /api/admin/billing/dunning/run hat keinerlei Fehlerbehandlung —
# jeder DB-Fehler (fehlende Billing-Tabelle, View weg) wird ein unbehandelter
# 500 statt einer geloggten, strukturierten Antwort (Vergleich: purge.ts fängt
# mit requestLogger + purge_failed ab).
@test "dunning/run faengt DB-Fehler strukturiert ab" {
  run grep -E 'catch' "$DUNNING_RUN"
  [ "$status" -eq 0 ] || { echo "kein catch in $DUNNING_RUN"; return 1; }
}

# RC-D: POST /api/admin/billing/create-monthly-invoices sichert nur die
# Pro-Kunde-Schleife ab; die Top-Level-DB-Calls (getUnbilledBillableEntries-…)
# davor werfen unbehandelt → 500 ohne Log-Kontext und ohne strukturierte
# Fehlerantwort (kein `status: 500`-Pfad in der Datei).
@test "create-monthly-invoices antwortet bei DB-Fehlern strukturiert (500 + Log)" {
  run grep -E 'status: 500' "$MONTHLY"
  [ "$status" -eq 0 ] || { echo "kein strukturierter 500-Pfad in $MONTHLY"; return 1; }
}

# Anker (muessen VOR und NACH dem Fix gruen sein — kein vakuoser Rewrite):
# messages + knowledge.collections sind ensure-abgedeckt (Heilungspfad intakt).
@test "Anker: messages und knowledge.collections bleiben ensure-abgedeckt" {
  run grep -E 'CREATE TABLE IF NOT EXISTS messages' "$SCHEMA_CM"
  [ "$status" -eq 0 ] || { echo "messages-Ensure verloren in $SCHEMA_CM"; return 1; }
  run grep -E 'CREATE TABLE IF NOT EXISTS knowledge\.collections' "$SCHEMA_CM"
  [ "$status" -eq 0 ] || { echo "collections-Ensure verloren in $SCHEMA_CM"; return 1; }
}

# Anker: die Migrationsdateien als DDL-Quelle bleiben bestehen.
@test "Anker: admin_actions- und error_log-Migrationen existieren" {
  [ -f "$MIGRATIONS/20260525_admin_actions.sql" ] || { echo "admin_actions-Migration fehlt"; return 1; }
  [ -f "$MIGRATIONS/20260703_create_error_log.sql" ] || { echo "error_log-Migration fehlt"; return 1; }
}
