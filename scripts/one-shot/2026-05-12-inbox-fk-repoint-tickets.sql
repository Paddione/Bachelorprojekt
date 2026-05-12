-- 2026-05-12 — Migration: repoint inbox_items.bug_ticket_id FK to tickets.tickets.
--
-- Background
-- ----------
-- Before the tickets sunset (PR1–3 → scripts/tickets-sunset.mjs), the
-- canonical bug ticket store was `bugs.bug_tickets(ticket_id)` and
-- `inbox_items.bug_ticket_id` had a foreign key into it. The sunset
-- migration drops the FK and (eventually) the legacy table, but never
-- added a replacement FK. The new source of truth is
-- `tickets.tickets(external_id)` — the same string format
-- (`T000NNN` / `BR-YYYYMMDD-xxxx` slugs) that already lives in
-- `inbox_items.bug_ticket_id` on the live clusters.
--
-- Symptom: direct deletes from `tickets.tickets` — notably
-- `tickets.fn_purge_test_data()` — don't cascade into inbox_items, so
-- inbox rows with a now-dead bug_ticket_id silently orphan.
--
-- This migration
-- --------------
-- 1. Drops the legacy FK `inbox_items_bug_ticket_id_fkey` if it
--    still exists (idempotent — `tickets-sunset.mjs` already drops it
--    on clusters that ran sunset; this catches any cluster that hasn't).
-- 2. Drops the new FK by name if it already exists (so the migration
--    is safe to re-run).
-- 3. NULLs any inbox_items.bug_ticket_id whose value doesn't match a
--    current tickets.tickets.external_id. Audit-safe default — the
--    payload JSONB still records what was there. On 2026-05-12 both
--    clusters had ZERO such rows; this guard exists for replays /
--    fresh clones that drift back into orphans.
-- 4. Adds the new FK `inbox_items_bug_ticket_fkey` pointing at
--    tickets.tickets(external_id) ON DELETE CASCADE. CASCADE is the
--    chosen behaviour (see PR description / brainstorm) so the
--    fn_purge_test_data() ticket deletes fan out automatically and
--    inbox no longer accrues orphans.
--
-- Idempotent — safe to apply repeatedly.
-- Wrap in a transaction so partial state never leaks.

\set ON_ERROR_STOP on
BEGIN;

-- 1) Drop the legacy FK if still present (older clusters / fresh clones
--    where tickets-sunset never ran with --apply).
ALTER TABLE public.inbox_items
  DROP CONSTRAINT IF EXISTS inbox_items_bug_ticket_id_fkey;

-- 2) Drop the new FK by predictable name so re-runs replace cleanly.
ALTER TABLE public.inbox_items
  DROP CONSTRAINT IF EXISTS inbox_items_bug_ticket_fkey;

-- 3) NULL any orphan refs. Audit-safe — preserves the inbox row + its
--    JSONB payload. Required so the FK in step 4 can be created.
WITH orphaned AS (
  UPDATE public.inbox_items i
     SET bug_ticket_id = NULL
   WHERE i.bug_ticket_id IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM tickets.tickets t
            WHERE t.external_id = i.bug_ticket_id
         )
  RETURNING i.id
)
SELECT 'orphan_inbox_rows_nulled' AS metric, COUNT(*) AS n FROM orphaned;

-- 4) Add the new FK with CASCADE so ticket deletes (incl.
--    tickets.fn_purge_test_data) fan out to inbox_items.
ALTER TABLE public.inbox_items
  ADD CONSTRAINT inbox_items_bug_ticket_fkey
  FOREIGN KEY (bug_ticket_id)
  REFERENCES tickets.tickets(external_id)
  ON DELETE CASCADE;

COMMIT;
