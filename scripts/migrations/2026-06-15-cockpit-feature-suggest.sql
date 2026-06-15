-- Cockpit Feature Suggestion Manager: new metadata columns on tickets.tickets.
-- Mirrors tickets-db.ts::initTicketsSchema(). Idempotent (IF NOT EXISTS).
-- MUST be applied to BOTH brand DBs after merge:
--   workspace            (mentolder)
--   workspace-korczewski (korczewski)
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS next_step         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS discarded         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS major_feature     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS suggestion_comment TEXT;
