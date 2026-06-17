-- Awaiting-deploy query index — ticket_links(from_id, kind, created_at DESC)
-- Supports: LEFT JOIN (SELECT DISTINCT ON (from_id) … WHERE kind = 'pr' ORDER BY from_id, created_at DESC)
-- Idempotent + reversible.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_links_from_kind_created
  ON tickets.ticket_links(from_id, kind, created_at DESC);

COMMIT;
