-- Migration: add missing FK index on massage_invoices (G-DB01) and brand CHECK constraints (G-DB03)
-- Applied by components/website/src/db/migrate.ts (website runner, tracking: schema_migrations).
-- Mirror: migrations/20261014-fk-indexes-and-brand-checks.sql (root runner, tracking: factory_schema_migrations).
-- The tickets-schema index dedupe lives only in the root-runner mirror (website code must not
-- name that table, see tests/py/spec/native_ported/spec/sdlc-cockpit/test_ki_deck_eine_tabelle.py).

BEGIN;

-- ── 1. G-DB01: Missing FK index on massage_invoices(cancels_invoice_id) ──
DO $$
BEGIN
  IF to_regclass('public.massage_invoices') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'massage_invoices'
        AND indexname = 'massage_invoices_cancels_invoice_idx'
    ) THEN
      CREATE INDEX massage_invoices_cancels_invoice_idx
        ON public.massage_invoices (cancels_invoice_id);
    END IF;
  END IF;
END $$;

-- ── 2. G-DB03: Brand CHECK constraints on tables with brand column ──

-- public.massage_invoices
DO $$
BEGIN
  IF to_regclass('public.massage_invoices') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_massage_invoices'
    ) THEN
      ALTER TABLE public.massage_invoices
        ADD CONSTRAINT chk_brand_massage_invoices
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

-- public.massage_invoice_sequences
DO $$
BEGIN
  IF to_regclass('public.massage_invoice_sequences') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_massage_invoice_sequences'
    ) THEN
      ALTER TABLE public.massage_invoice_sequences
        ADD CONSTRAINT chk_brand_massage_invoice_sequences
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

-- public.business_memberships
DO $$
BEGIN
  IF to_regclass('public.business_memberships') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_business_memberships'
    ) THEN
      ALTER TABLE public.business_memberships
        ADD CONSTRAINT chk_brand_business_memberships
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END $$;

-- public.inbox_items (brand can be null or valid brand)
DO $$
BEGIN
  IF to_regclass('public.inbox_items') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_inbox_items'
    ) THEN
      ALTER TABLE public.inbox_items
        ADD CONSTRAINT chk_brand_inbox_items
        CHECK (brand IS NULL OR brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

-- bugs.bug_tickets (frozen legacy table)
DO $$
BEGIN
  IF to_regclass('bugs.bug_tickets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_bug_tickets'
    ) THEN
      ALTER TABLE bugs.bug_tickets
        ADD CONSTRAINT chk_brand_bug_tickets
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END $$;

-- bachelorprojekt.features (frozen legacy table)
DO $$
BEGIN
  IF to_regclass('bachelorprojekt.features') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_features'
    ) THEN
      ALTER TABLE bachelorprojekt.features
        ADD CONSTRAINT chk_brand_features
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END $$;

COMMIT;
