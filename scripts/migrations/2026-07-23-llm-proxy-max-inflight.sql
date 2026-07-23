-- 2026-07-23-llm-proxy-max-inflight.sql
-- Per-Backend-Concurrency-Limit für die LLM-Proxy-Backend-Registry.
-- Default 1 = heutige strikte Serialisierung (byte-identisch). Pro Backend
-- (z. B. llamacpp-bonsai) hochsetzen erlaubt echte Parallelität OHNE Code-Änderung.
-- Idempotent (ADD COLUMN IF NOT EXISTS). Reversibel: ALTER TABLE … DROP COLUMN max_inflight.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
BEGIN;

ALTER TABLE tickets.llm_proxy_backends
  ADD COLUMN IF NOT EXISTS max_inflight integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN tickets.llm_proxy_backends.max_inflight IS
  'Max gleichzeitig in-flight Requests, die der Proxy pro Backend zulaesst (Semaphor-Limit). 1 = strikte FIFO-Serialisierung (Default).';

COMMIT;
