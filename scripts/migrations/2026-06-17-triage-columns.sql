-- scripts/migrations/2026-06-17-triage-columns.sql
-- Idempotente Lücken-Migration: Triage-Spalten für T000933 (Ticket-Auto-Triage)
-- Safety-Net: Spalten existieren i.d.R. schon via tickets-db.ts ensureSchema();
-- ADD COLUMN IF NOT EXISTS ist idempotent und no-op auf bestehenden Spalten.
-- 
-- Ausführung (pro Brand-DB, beide anwenden):
--   mentolder:  kubectl exec -it deploy/shared-db -n workspace          --context fleet -c postgres -- psql -U website -d website -f -
--   korczewski: kubectl exec -it deploy/shared-db -n workspace-korczewski --context fleet -c postgres -- psql -U website -d website -f -
--

ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_meta JSONB;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS areas TEXT[];
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS component TEXT;

-- Kein Trigger-/Enum-Change. Keine Status-/Constraint-Änderung.
-- Spalten sind bereits im Schema via tickets-db.ts ensureSchema registriert.
