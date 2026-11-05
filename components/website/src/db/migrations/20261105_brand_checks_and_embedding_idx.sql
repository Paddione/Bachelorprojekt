-- Migration: brand CHECK constraints for 10 remaining tables (G-DB03) + embedding ORDER BY index (G-DB09)
-- Applied by components/website/src/db/migrate.ts (website runner, tracking: schema_migrations).
-- Mirror: migrations/20261105-brand-checks-and-embedding-idx.sql (root runner, tracking: factory_schema_migrations).
--
-- G-DB03: health-goals-check.sh counts DISTINCT brand tables minus tables whose CHECK
-- mentions brand AND mentolder. These 10 tables had brand columns without such a CHECK
-- (live devmesh 2026-11-05: 10). All live values are mentolder/korczewski only, so the
-- two-brand pattern (like business_memberships) applies; knowledge.collections is
-- nullable and follows the inbox_items NULL-tolerant pattern.
-- G-DB09: pg_stat_statements top entry was a 1.6s full scan + sort over
-- public.code_embeddings_gemma_k6gemma768 ORDER BY source_row_id, part_index
-- (no index on those columns). Composite btree removes the sort/scan.

-- ── G-DB03: public.service_config ──
DO $$
BEGIN
  IF to_regclass('public.service_config') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_service_config'
    ) THEN
      ALTER TABLE public.service_config
        ADD CONSTRAINT chk_brand_service_config
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: coaching.ki_config ──
DO $$
BEGIN
  IF to_regclass('coaching.ki_config') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_ki_config'
    ) THEN
      ALTER TABLE coaching.ki_config
        ADD CONSTRAINT chk_brand_ki_config
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: public.onboarding_state ──
DO $$
BEGIN
  IF to_regclass('public.onboarding_state') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_onboarding_state'
    ) THEN
      ALTER TABLE public.onboarding_state
        ADD CONSTRAINT chk_brand_onboarding_state
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: coaching.sessions ──
DO $$
BEGIN
  IF to_regclass('coaching.sessions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_sessions'
    ) THEN
      ALTER TABLE coaching.sessions
        ADD CONSTRAINT chk_brand_sessions
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: public.folder_templates ──
DO $$
BEGIN
  IF to_regclass('public.folder_templates') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_folder_templates'
    ) THEN
      ALTER TABLE public.folder_templates
        ADD CONSTRAINT chk_brand_folder_templates
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: knowledge.collections (nullable brand) ──
DO $$
BEGIN
  IF to_regclass('knowledge.collections') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_collections'
    ) THEN
      ALTER TABLE knowledge.collections
        ADD CONSTRAINT chk_brand_collections
        CHECK (brand IS NULL OR brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: coaching.step_templates ──
DO $$
BEGIN
  IF to_regclass('coaching.step_templates') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_step_templates'
    ) THEN
      ALTER TABLE coaching.step_templates
        ADD CONSTRAINT chk_brand_step_templates
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: public.prompt_library ──
DO $$
BEGIN
  IF to_regclass('public.prompt_library') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_prompt_library'
    ) THEN
      ALTER TABLE public.prompt_library
        ADD CONSTRAINT chk_brand_prompt_library
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: public.leistungen_config ──
DO $$
BEGIN
  IF to_regclass('public.leistungen_config') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_leistungen_config'
    ) THEN
      ALTER TABLE public.leistungen_config
        ADD CONSTRAINT chk_brand_leistungen_config
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB03: public.learning_progress ──
DO $$
BEGIN
  IF to_regclass('public.learning_progress') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_brand_learning_progress'
    ) THEN
      ALTER TABLE public.learning_progress
        ADD CONSTRAINT chk_brand_learning_progress
        CHECK (brand IN ('mentolder', 'korczewski'));
    END IF;
  END IF;
END
$$;

-- ── G-DB09: composite index for ORDER BY source_row_id, part_index ──
DO $$
BEGIN
  IF to_regclass('public.code_embeddings_gemma_k6gemma768') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'code_embeddings_gemma_k6gemma768'
        AND indexname = 'code_embeddings_gemma_k6gemma768_source_row_idx'
    ) THEN
      CREATE INDEX code_embeddings_gemma_k6gemma768_source_row_idx
        ON public.code_embeddings_gemma_k6gemma768 (source_row_id, part_index);
    END IF;
  END IF;
END
$$;
