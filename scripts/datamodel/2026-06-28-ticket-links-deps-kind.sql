-- Extend tickets.ticket_links kind CHECK constraint to allow 'blocks' and 'relates'.
-- Idempotent: DROP IF EXISTS + ADD is safe to re-run.
-- Apply via: task db:migrate or kubectl exec on shared-db pod.

BEGIN;

ALTER TABLE tickets.ticket_links
  DROP CONSTRAINT IF EXISTS ticket_links_kind_check;

ALTER TABLE tickets.ticket_links
  ADD CONSTRAINT ticket_links_kind_check
    CHECK (kind IN ('pr', 'blocks', 'relates'));

COMMIT;
