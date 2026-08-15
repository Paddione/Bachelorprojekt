-- Migration: drop redundant duplicate index on public.customers(email) — T001908 (G-DB10).
-- Applied automatically by website/src/db/migrate.ts (task workspace:deploy runs
-- `pnpm --dir website db:migrate` against the target brand's `website` database).
--
-- G-DB10 baseline scan (.claude/lib/goals.md#G-DB10) found 93 indexes with idx_scan = 0
-- (excluding PKs and formal UNIQUE-constraint indexes). Of those 93, this is the only
-- one confirmed safe to drop without further review: `idx_customers_email` is an exact
-- duplicate of `customers_email_key` — same table, same single column (email), same
-- btree method — created separately from the UNIQUE constraint that already backs
-- `customers_email_key` (idx_scan = 700, actively used). `idx_customers_email` itself
-- has idx_scan = 0, carries no constraint (contype IS NULL) and no FK depends on its
-- name (foreign keys reference constraints, never index names), so dropping it is a
-- pure redundancy cleanup: uniqueness and lookup performance on `email` remain fully
-- covered by `customers_email_key`.
--
-- The remaining 92 candidates from the same scan are NOT touched here — many are
-- partial UNIQUE indexes enforcing business invariants (e.g. "one open poll", "one
-- active ki_config per brand") that are unique via `indisunique` without a formal
-- pg_constraint row, others are recently-added or low-traffic-table indexes whose
-- idx_scan = 0 may simply reflect that the relevant query path hasn't fired yet.
-- See follow-up ticket for the full candidate list and risk assessment.

DO $$
BEGIN
  IF to_regclass('public.idx_customers_email') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_customers_email;
  END IF;
END
$$;
