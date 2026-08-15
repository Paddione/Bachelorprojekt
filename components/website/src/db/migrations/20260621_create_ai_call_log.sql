-- AI Call Log — T001065
-- 2026-06-21 — Records each AI workflow call (coaching_chat, rag_search, embedding,
-- grilling, plan_qa) for the sidekick AI-Quality widget. Fire-and-forget inserts from
-- website/src/lib/ai-metrics.ts; reads aggregated by /api/admin/ai-quality.
-- Retention: 90 days (DELETE WHERE ts < now() - interval '90 days') via
-- task maintenance:ai-log-cleanup.

CREATE TABLE IF NOT EXISTS ai_call_log (
  id                bigserial PRIMARY KEY,
  ts                timestamptz NOT NULL DEFAULT now(),
  workflow          text NOT NULL,
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer NOT NULL,
  error             text,
  user_sub          text,
  metadata          jsonb
);

ALTER TABLE ai_call_log OWNER TO website;

CREATE INDEX IF NOT EXISTS ai_call_log_ts       ON ai_call_log (ts DESC);
CREATE INDEX IF NOT EXISTS ai_call_log_workflow ON ai_call_log (workflow, ts DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_call_log TO website;
GRANT USAGE, SELECT ON SEQUENCE ai_call_log_id_seq TO website;
