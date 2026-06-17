-- Scout-Drift-Ratchet: persist Jaccard drift score per ticket.
-- Idempotent (IF NOT EXISTS). MUST be applied to BOTH brand DBs after merge:
--   workspace            (mentolder)
--   workspace-korczewski (korczewski)
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS scout_drift NUMERIC;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS scout_drift_at TIMESTAMPTZ;
