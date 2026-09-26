-- T900399 — Software-Factory-Decommission.
-- Drops the factory-only control surfaces. Applied by `task db:migrate`
-- (runner: scripts/migrate-db.mjs), tracked in public.factory_schema_migrations.
--
-- `tickets.factory_phase_events` is deliberately NOT dropped: its `driver` column
-- distinguishes 'factory' from 'devflow' and the dev-flow skills still record
-- phase events there (ticket.sh phase / MCP record_phase_event).

DROP VIEW IF EXISTS tickets.v_factory_metrics CASCADE;
DROP TABLE IF EXISTS tickets.factory_run_budget CASCADE;
DROP TABLE IF EXISTS tickets.factory_model_slots CASCADE;
DROP TABLE IF EXISTS tickets.factory_control CASCADE;

ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pipeline_slot CASCADE;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pipeline_slot_meta CASCADE;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS slot_count CASCADE;
