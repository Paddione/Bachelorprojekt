-- 2026-06-15-grilling-answers.sql
-- Fügt grilling_answers JSONB-Spalte zur tickets.tickets-Tabelle hinzu.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-15-grilling-answers.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-15-grilling-answers.sql'

BEGIN;

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS grilling_answers JSONB;

COMMIT;
