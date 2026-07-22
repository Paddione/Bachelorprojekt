-- 2026-07-22-slot-count-gang.sql
-- Gang-Scheduling (T002074): Anzahl der Slots, die ein Ticket bekleiden muss.
-- Idempotent; Default 1 = heutiges Single-Slot-Verhalten.
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-slot-count-gang.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-22-slot-count-gang.sql'
ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS slot_count int NOT NULL DEFAULT 1;

-- Vorbedingung für ON CONFLICT (phase) in provider-register-bonsai.sh (Task 10):
CREATE UNIQUE INDEX IF NOT EXISTS factory_model_slots_phase_key
  ON tickets.factory_model_slots(phase);
