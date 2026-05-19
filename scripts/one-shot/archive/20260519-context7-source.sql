-- scripts/one-shot/20260519-context7-source.sql
-- Adds context7_docs as a valid source for knowledge.collections.
-- Run on BOTH clusters after deploy:
--   task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260519-context7-source.sql
--   task workspace:psql ENV=korczewski -- website < scripts/one-shot/20260519-context7-source.sql

-- Drop the old CHECK constraint.
ALTER TABLE knowledge.collections
  DROP CONSTRAINT IF EXISTS collections_source_check;

-- Re-add with context7_docs included.
ALTER TABLE knowledge.collections
  ADD CONSTRAINT collections_source_check
    CHECK (source IN ('pr_history','specs_plans','claude_md','bug_tickets','custom','web_crawl','context7_docs'));
