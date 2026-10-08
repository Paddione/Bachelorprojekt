-- T901440 (Massage-Tenant): Brand-CHECKs um 'massage' erweitern.
-- Genau die fuenf auditierten Tabellen (p1-Schreibpfad-Audit); alle billing_*-
-- CHECKs, invoice_counters, leistungen_config, service_config und SDLC/
-- Workspace-Schemas bleiben un Veraendert. Historische SQL-Dateien unangetastet.
-- Idempotent: to_regclass-Guard (Legacy-Tabellen = No-op), bestehender neuer
-- CHECK wird erkannt, nur der bekannte chk_brand_*-CHECK wird ersetzt.
-- Spiegel: components/website/src/db/migrations/20261008_massage_brand_checks.sql
-- (fachlich identisch; getrennte Runner/Tracking-Tabellen).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.free_time_windows') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_free_time_windows'
        AND pg_get_constraintdef(oid) LIKE '%massage%'
    ) THEN
      ALTER TABLE public.free_time_windows DROP CONSTRAINT IF EXISTS chk_brand_free_time_windows;
      ALTER TABLE public.free_time_windows
        ADD CONSTRAINT chk_brand_free_time_windows
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.legal_pages') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_legal_pages'
        AND pg_get_constraintdef(oid) LIKE '%massage%'
    ) THEN
      ALTER TABLE public.legal_pages DROP CONSTRAINT IF EXISTS chk_brand_legal_pages;
      ALTER TABLE public.legal_pages
        ADD CONSTRAINT chk_brand_legal_pages
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_site_settings'
        AND pg_get_constraintdef(oid) LIKE '%massage%'
    ) THEN
      ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS chk_brand_site_settings;
      ALTER TABLE public.site_settings
        ADD CONSTRAINT chk_brand_site_settings
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.homepage_block_documents') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_homepage_block_documents'
        AND pg_get_constraintdef(oid) LIKE '%massage%'
    ) THEN
      ALTER TABLE public.homepage_block_documents DROP CONSTRAINT IF EXISTS chk_brand_homepage_block_documents;
      ALTER TABLE public.homepage_block_documents
        ADD CONSTRAINT chk_brand_homepage_block_documents
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.homepage_block_versions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_homepage_block_versions'
        AND pg_get_constraintdef(oid) LIKE '%massage%'
    ) THEN
      ALTER TABLE public.homepage_block_versions DROP CONSTRAINT IF EXISTS chk_brand_homepage_block_versions;
      ALTER TABLE public.homepage_block_versions
        ADD CONSTRAINT chk_brand_homepage_block_versions
        CHECK (brand IN ('mentolder', 'korczewski', 'massage'));
    END IF;
  END IF;
END $$;

COMMIT;
