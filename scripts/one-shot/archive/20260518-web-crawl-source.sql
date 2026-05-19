-- scripts/one-shot/20260518-web-crawl-source.sql
-- Adds web_crawl as a valid source and crawl_config JSONB column to knowledge.collections.
-- Run on BOTH clusters after deploy:
--   task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260518-web-crawl-source.sql
--   task workspace:psql ENV=korczewski -- website < scripts/one-shot/20260518-web-crawl-source.sql

-- Drop the old CHECK constraint (name matches what PostgreSQL auto-generated).
ALTER TABLE knowledge.collections
  DROP CONSTRAINT IF EXISTS collections_source_check;

-- Re-add with web_crawl included.
ALTER TABLE knowledge.collections
  ADD CONSTRAINT collections_source_check
    CHECK (source IN ('pr_history','specs_plans','claude_md','bug_tickets','custom','web_crawl'));

-- Add crawl_config column (idempotent).
ALTER TABLE knowledge.collections
  ADD COLUMN IF NOT EXISTS crawl_config JSONB;
