---
title: "p2 — Decouple platform DB migrations runner and drop factory tables"
ticket_id: T900399
domains: [database-specialist]
status: active
---

# p2 — Decouple platform DB migrations runner and drop factory tables

Files: `scripts/migrate-db.mjs`, `scripts/migrations/2026-09-26-factory-decommission.sql` (target_files dieses Partials; disjunkt zu p1, p3–p5).

## Task 2.1: Entkopplung des Migrations-Runners

1. `scripts/migrate-factory.mjs` nach `scripts/migrate-db.mjs` umbenennen:
   - Logging-Präfixe von `[migrate-factory]` auf `[migrate-db]` aktualisieren.
   - Die Funktion `runFactoryMigrations` als `runMigrations` exportieren (mit Re-Export für Rückwärtskompatibilität).
   - Die Tracking-Tabelle `public.factory_schema_migrations` beibehalten, da bestehende Cluster ihre Migrations-Historie dort halten.
2. Bereitstellung eines Weiterleitungs-Skripts `scripts/migrate-factory.mjs` (oder Symlink / Delegator), der mit Deprecation-Warnung `scripts/migrate-db.mjs` aufruft, falls externe Skripte ihn noch referenzieren.

## Task 2.2: Bereitstellung der Decommission-Migration

Erstellen von `scripts/migrations/2026-09-26-factory-decommission.sql`:
1. Löschen der Factory-Views und Tabellen im Schema `tickets`:
   ```sql
   DROP VIEW IF EXISTS tickets.v_factory_metrics CASCADE;
   DROP TABLE IF EXISTS tickets.factory_phase_events CASCADE;
   DROP TABLE IF EXISTS tickets.factory_run_budget CASCADE;
   DROP TABLE IF EXISTS tickets.factory_model_slots CASCADE;
   DROP TABLE IF EXISTS tickets.factory_control CASCADE;
   ```
2. Bereinigen der Factory-Spalten in `tickets.tickets`:
   ```sql
   ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pipeline_slot CASCADE;
   ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pipeline_slot_meta CASCADE;
   ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS slot_count CASCADE;
   ```
3. Testen der Migration mit `node scripts/migrate-db.mjs` bzw. psql gegen die lokale Dev-DB.
