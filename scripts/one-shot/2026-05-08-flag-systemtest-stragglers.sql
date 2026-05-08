-- 2026-05-08 — Flag systemtest "stragglers" as is_test_data=true.
--
-- Symptom: ~13–36 tickets matching '^(System-?Test|Systemtest:|\[TEST\])'
-- never picked up the is_test_data flag (the failure-bridge bug that left
-- earlier batches unflagged was already fixed by
-- 2026-05-08-tickets-dedup-and-group.sql, but a residue of older auto-tickets
-- was either created before the flag column existed or under conditions
-- where the source assignment couldn't be looked up).
--
-- Idempotent. Wraps in a transaction; RETURNING the affected external_ids
-- so an operator can paste the result back as evidence.
--
-- Run with:
--   task workspace:psql ENV=mentolder -- website \
--     < scripts/one-shot/2026-05-08-flag-systemtest-stragglers.sql

\set ON_ERROR_STOP on
BEGIN;

UPDATE tickets.tickets
   SET is_test_data = true,
       updated_at   = now()
 WHERE is_test_data = false
   AND title ~* '^(System-?Test|Systemtest:|\[TEST\])'
RETURNING external_id, type, status, title;

COMMIT;
