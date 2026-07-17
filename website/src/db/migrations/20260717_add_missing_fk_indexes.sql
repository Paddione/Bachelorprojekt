-- Migration: add missing indexes on single-column FK constraints — T001905 (G-DB01).
-- Applied automatically by website/src/db/migrate.ts (task workspace:deploy runs
-- `pnpm --dir website db:migrate` against the target brand's `website` database).
--
-- Identified via the G-DB01 health-goal query (.claude/lib/goals.md#G-DB01):
-- single-column FK constraints without a matching leading-column index.
-- Baseline 4 → target 0 (T001739 wired the measurement; this migration is the fix).
--
-- Guarded with to_regclass() rather than bare CREATE INDEX IF NOT EXISTS: the
-- `studio.*` and `sessions.*` schemas are mentolder-only (studio-server is
-- "mentolder-only for MVP", see Taskfile.yml website:studio:rollout) and this
-- migrations directory is shared by every brand's `db:migrate` run — an
-- unguarded statement against a table that doesn't exist on another brand's
-- database would abort that brand's entire migration run.

DO $$
BEGIN
  IF to_regclass('public.onboarding_state') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_onboarding_state_brand
      ON public.onboarding_state (brand);
  END IF;

  IF to_regclass('sessions.templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_templates_created_from_template_id
      ON sessions.templates (created_from_template_id);
  END IF;

  IF to_regclass('studio.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_client_id
      ON studio.sessions (client_id);
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_template_of
      ON studio.sessions (template_of);
  END IF;
END
$$;
