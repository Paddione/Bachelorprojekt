-- Rollback:
-- DROP SCHEMA IF EXISTS model_registry CASCADE;

CREATE SCHEMA IF NOT EXISTS model_registry;

CREATE TABLE IF NOT EXISTS model_registry.adapters (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  base_model    TEXT NOT NULL,          -- z.B. "gemma-4-9b-it"
  quantization  TEXT,                    -- "Q8_0", "IQ4_XS"
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_registry.eval_scores (
  adapter_id    INT REFERENCES model_registry.adapters(id),
  role          TEXT NOT NULL,           -- "scout", "review-lens", "commit-msg", "triage"
  score         FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),  -- 0..1 (T004445)
  harness_version TEXT,
  evaluated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (adapter_id, role)
);

CREATE TABLE IF NOT EXISTS model_registry.stat_requirements (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  vram_mb       INT,
  max_context   INT,
  throughput_toks  FLOAT,
  load_time_ms  INT
);

CREATE TABLE IF NOT EXISTS model_registry.provenance (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  training_corpus TEXT,
  lora_rank     INT,
  lora_alpha    INT,
  git_commit    TEXT,
  training_config JSONB
);

CREATE TABLE IF NOT EXISTS model_registry.deployment_config (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  chat_template TEXT,
  stop_tokens   TEXT[],
  temperature   FLOAT,
  top_p         FLOAT,
  loadout_json  JSONB
);

-- Index-Name OHNE Schema-Praefix: PostgreSQL verbietet schema-qualifizierte
-- Namen zusammen mit IF NOT EXISTS (syntax error at or near "."). Der Index
-- landet automatisch im Schema der Tabelle (model_registry).
CREATE INDEX IF NOT EXISTS eval_scores_role_idx ON model_registry.eval_scores(role);

-- CHECK 0..1 auf score: bei bereits existierender Tabelle greift CREATE TABLE
-- IF NOT EXISTS nicht nach — der Constraint wird hier idempotent nachgezogen
-- (T004445 Review-Fix). Benannte Constraints sind pro Tabelle eindeutig, daher
-- ist ADD CONSTRAINT IF NOT EXISTS sicher.
ALTER TABLE model_registry.eval_scores
  DROP CONSTRAINT IF EXISTS eval_scores_score_range_check;
ALTER TABLE model_registry.eval_scores
  ADD CONSTRAINT eval_scores_score_range_check CHECK (score >= 0 AND score <= 1);

-- Zugriff fuer den Website-User (Skripte verbinden als website):
GRANT USAGE ON SCHEMA model_registry TO website;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA model_registry TO website;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA model_registry TO website;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA model_registry TO website;
-- Zukuenftige Tabellen/Funktionen im Schema automatisch mitberechtigen
-- (GRANT ON ALL TABLES wirkt nur auf bereits existierende Objekte; T004445):
ALTER DEFAULT PRIVILEGES IN SCHEMA model_registry
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA model_registry
  GRANT USAGE, SELECT ON SEQUENCES TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA model_registry
  GRANT EXECUTE ON FUNCTIONS TO website;
