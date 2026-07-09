-- 2026-07-09-factory-model-slots.sql
-- Per-phase model slots configuration (T001733).
-- Idempotent. Authoritative idempotent DDL lives in website/src/lib/tickets/tables/factory-model-slots.ts
-- applyFactoryModelSlotsSchema(); this file mirrors it for manual bring-up via factory_psql:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-09-factory-model-slots.sql'
-- Apply to BOTH brands (workspace AND workspace-korczewski) — separate per-brand DBs.
BEGIN;

CREATE TABLE IF NOT EXISTS tickets.factory_model_slots (
  phase      TEXT PRIMARY KEY CHECK (phase IN ('scout','plan','implement','verify','deploy')),
  provider   TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  base_url   TEXT,
  set_by     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
