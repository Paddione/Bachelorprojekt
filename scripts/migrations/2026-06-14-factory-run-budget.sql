-- 2026-06-14-factory-run-budget.sql
-- DDL-Spiegel für tickets.factory_run_budget zur Erfassung von Token-Budgets pro Factory-Run.
-- Idempotent.
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-factory-run-budget.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-factory-run-budget.sql'

BEGIN;

CREATE TABLE IF NOT EXISTS tickets.factory_run_budget (
  id              bigserial PRIMARY KEY,
  ticket_id       uuid REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  run_date        date NOT NULL DEFAULT CURRENT_DATE,
  provider        text NOT NULL,  -- 'anthropic'|'deepseek'|'gpu'
  model_id        text NOT NULL,
  phase           text,           -- scout/design/plan/implement/verify/deploy
  tokens_in_est   int,            -- pre-run estimate
  tokens_out_est  int,
  cost_usd_est    numeric(10,6),
  tokens_in_act   int,            -- post-run actual (NULL bis phase done)
  tokens_out_act  int,
  cost_usd_act    numeric(10,6),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS factory_run_budget_ticket_date_idx
  ON tickets.factory_run_budget (ticket_id, run_date);

CREATE INDEX IF NOT EXISTS factory_run_budget_date_provider_idx
  ON tickets.factory_run_budget (run_date, provider);

COMMIT;
