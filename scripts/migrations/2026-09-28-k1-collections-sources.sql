-- scripts/migrations/2026-09-28-k1-collections-sources.sql
-- T900810: k1-embed (scripts/openspec-embed.mjs, eingefuehrt mit #5948) schreibt
-- die Collections specs_ssot + docs — der CHECK wies sie ab (23514
-- collections_source_check), jeder k1-Lauf mit OpenSpec-Anteil starb am INSERT.
-- Muster wie 20260518-web-crawl / 20260519-context7 (Drop + Re-Add mit
-- erweiterter Liste). Bestehende Zeilen sind unberuehrt (reine Erweiterung).
--
-- NUR mentolder anwenden — korczewski ist eingefroren (T002479):
--   task workspace:psql ENV=mentolder -- website -f scripts/migrations/2026-09-28-k1-collections-sources.sql

ALTER TABLE knowledge.collections
  DROP CONSTRAINT IF EXISTS collections_source_check;

ALTER TABLE knowledge.collections
  ADD CONSTRAINT collections_source_check
    CHECK (source IN ('pr_history','specs_plans','claude_md','bug_tickets','custom','web_crawl','context7_docs','specs_ssot','docs'));
