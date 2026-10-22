-- Migration: FK indexes on customers children with a proven parent delete path.
--
-- Audit F1 found 17 single-column FK constraints without a matching
-- leading-column B-tree; selected here are the 6 whose parent (`customers`)
-- has a proven bulk-delete path (`DELETE FROM customers c` in
-- components/website/src/lib/tickets/purge-fn.ts, plus the test-data purge
-- in pages/sdlc/api/testdata/purge.ts). Each parent delete checks the
-- children per Seq Scan without an index.
--
-- Convention from 20260717_add_missing_fk_indexes.sql: one DO block per
-- table with a to_regclass() guard (this migrations directory is shared by
-- every brand's `db:migrate` run — an unguarded statement against a table
-- that doesn't exist on another brand's database would abort that brand's
-- entire migration run) + CREATE INDEX IF NOT EXISTS.
--
-- Applied automatically by components/website/src/db/migrate.ts
-- (`pnpm --dir components/website db:migrate`).

DO $$
BEGIN
  IF to_regclass('public.chat_message_reads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_message_reads_customer_id
      ON public.chat_message_reads (customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_customer_id
      ON public.chat_messages (sender_customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.chat_room_members') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_room_members_customer_id
      ON public.chat_room_members (customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_direct_customer_id
      ON public.chat_rooms (direct_customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_sender_customer_id
      ON public.messages (sender_customer_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.message_threads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_message_threads_customer_id
      ON public.message_threads (customer_id);
  END IF;
END
$$;
