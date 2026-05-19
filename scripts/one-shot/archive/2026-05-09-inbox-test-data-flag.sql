-- 2026-05-09 — Add is_test_data flag to messaging tables.
--
-- Closes the "purge ignores inbox" gap left by 2026-05-08-purge-test-data.sql:
-- inbox_items / messages / message_threads had no is_test_data column, so
-- tickets.fn_purge_test_data() couldn't reach them and stale [TEST]-bracketed
-- contact-form/booking submissions accumulated across Playwright runs.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS so a
-- re-run on a cluster that already has the column is a no-op (PG raises a
-- NOTICE for existing-column adds, no DDL fires for existing indexes).
--
-- Index strategy: small partial indexes WHERE is_test_data = true. Total
-- expected rows under that predicate are bounded (one Playwright cycle's
-- worth, dropped at the next bracket), so a partial index is the cheapest
-- way to make `DELETE FROM <t> WHERE is_test_data = true` an index scan.

\set ON_ERROR_STOP on
BEGIN;

-- ── inbox_items ─────────────────────────────────────────────────────────────
ALTER TABLE inbox_items
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inbox_items_is_test_data
  ON inbox_items (is_test_data)
  WHERE is_test_data = true;

-- ── message_threads ─────────────────────────────────────────────────────────
ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_message_threads_is_test_data
  ON message_threads (is_test_data)
  WHERE is_test_data = true;

-- ── messages ────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_is_test_data
  ON messages (is_test_data)
  WHERE is_test_data = true;

COMMIT;
