-- Migration: create public.folder_templates (configurable folder structure templates for new projects).
-- Apply manually (no auto-runner) per brand:
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -v brand=mentolder -f - < website/src/db/migrations/20260617_create_folder_templates.sql
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -v brand=korczewski -f - < website/src/db/migrations/20260617_create_folder_templates.sql

CREATE TABLE IF NOT EXISTS public.folder_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  structure   JSONB NOT NULL DEFAULT '{"folders":[]}',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_templates_brand_name
  ON public.folder_templates (brand, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_templates_default
  ON public.folder_templates (brand) WHERE is_default;

GRANT ALL PRIVILEGES ON public.folder_templates TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO website;

-- Idempotent seed: default template "Standard" per brand.
-- Pass :brand via psql -v brand=mentolder (or korczewski).
-- The DO block uses pg_try_advisory_xact_lock to prevent concurrent seed insertions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.folder_templates WHERE brand = :'brand' AND is_default) THEN
    RETURN;
  END IF;

  INSERT INTO public.folder_templates (brand, name, structure, is_default)
  VALUES (
    :'brand',
    'Standard',
    '{"folders":["01_Vertrag","02_Rechnungen","03_Dokumente","04_Assets","05_Kommunikation"]}',
    true
  )
  ON CONFLICT (brand, name) DO NOTHING;
END
$$;
