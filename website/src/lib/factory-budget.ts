// website/src/lib/factory-budget.ts
// Data Access Layer (DAL) for token and cost budget tracking.
// Per-brand PostgreSQL access via the central pool.

import { pool } from './website-db';

interface FactoryRunBudget {
  id: string;
  ticketId: string;
  runDate: string;
  provider: string;
  modelId: string;
  phase: string;
  tokensInEst: number | null;
  tokensOutEst: number | null;
  costUsdEst: number | null;
  tokensInAct: number | null;
  tokensOutAct: number | null;
  costUsdAct: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderBudgetSummary {
  provider: string;
  tokensInAct: number;
  tokensOutAct: number;
  costUsdAct: number;
  tokensInEst: number;
  tokensOutEst: number;
  costUsdEst: number;
}

interface DailyBudgetSummary {
  used: number;
  limit: number | null;
  byProvider: ProviderBudgetSummary[];
}

interface RecentRunSummary {
  ticketId: string;
  externalId: string;
  title: string;
  runDate: string;
  totalCostAct: number;
  totalCostEst: number;
}

/** Set daily budget limit in USD (writes key 'budget-limit-daily-usd' in factory_control). */
export async function setBudgetLimit(usd: number): Promise<void> {
  await pool.query(
    `INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
     VALUES ($1, NULL, $2, $3, now())
     ON CONFLICT (key, brand) DO UPDATE SET value = $2, set_by = $3, updated_at = now()`,
    ['budget-limit-daily-usd', usd.toFixed(2), 'admin-ui']
  );
}

/** Get current daily budget limit in USD. */
async function getBudgetLimit(): Promise<number | null> {
  const r = await pool.query(
    `SELECT value FROM tickets.factory_control WHERE key = 'budget-limit-daily-usd' AND brand IS NULL LIMIT 1`
  );
  if (!r.rows[0]) return null;
  const val = parseFloat(r.rows[0].value);
  return isNaN(val) ? null : val;
}

/** Get cost sum and per-provider details for a given day (defaults to today). */
export async function getDailyBudgetSummary(date?: string): Promise<DailyBudgetSummary> {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  
  const [limit, usedRow, providerRow] = await Promise.all([
    getBudgetLimit(),
    pool.query(
      `SELECT COALESCE(SUM(cost_usd_act), 0.0)::float as used
       FROM tickets.factory_run_budget
       WHERE run_date = $1`,
      [targetDate]
    ),
    pool.query(
      `SELECT 
         provider,
         COALESCE(SUM(tokens_in_act), 0)::int as tokens_in_act,
         COALESCE(SUM(tokens_out_act), 0)::int as tokens_out_act,
         COALESCE(SUM(cost_usd_act), 0.0)::float as cost_usd_act,
         COALESCE(SUM(tokens_in_est), 0)::int as tokens_in_est,
         COALESCE(SUM(tokens_out_est), 0)::int as tokens_out_est,
         COALESCE(SUM(cost_usd_est), 0.0)::float as cost_usd_est
       FROM tickets.factory_run_budget
       WHERE run_date = $1
       GROUP BY provider`,
      [targetDate]
    )
  ]);

  const byProvider = providerRow.rows.map(r => ({
    provider: r.provider,
    tokensInAct: r.tokens_in_act,
    tokensOutAct: r.tokens_out_act,
    costUsdAct: r.cost_usd_act,
    tokensInEst: r.tokens_in_est,
    tokensOutEst: r.tokens_out_est,
    costUsdEst: r.cost_usd_est,
  }));

  return {
    used: usedRow.rows[0]?.used ?? 0.0,
    limit,
    byProvider,
  };
}

/** Get detailed cost entries per phase for a ticket (using UUID or external_id). */
export async function getRunBudgetByTicket(ticketId: string): Promise<FactoryRunBudget[]> {
  const r = await pool.query(
    `SELECT b.*
     FROM tickets.factory_run_budget b
     JOIN tickets.tickets t ON b.ticket_id = t.id
     WHERE t.id::text = $1 OR t.external_id = $1
     ORDER BY b.run_date DESC, b.id ASC`,
    [ticketId]
  );
  
  return r.rows.map(row => ({
    id: String(row.id),
    ticketId: row.ticket_id,
    runDate: row.run_date.toISOString().slice(0, 10),
    provider: row.provider,
    modelId: row.model_id,
    phase: row.phase,
    tokensInEst: row.tokens_in_est,
    tokensOutEst: row.tokens_out_est,
    costUsdEst: row.cost_usd_est ? parseFloat(row.cost_usd_est) : null,
    tokensInAct: row.tokens_in_act,
    tokensOutAct: row.tokens_out_act,
    costUsdAct: row.cost_usd_act ? parseFloat(row.cost_usd_act) : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/** Get recent runs that have budget information. */
export async function getRecentRuns(limitCount = 5): Promise<RecentRunSummary[]> {
  const r = await pool.query(
    `SELECT 
       t.id as ticket_id,
       t.external_id,
       t.title,
       MAX(b.run_date) as run_date,
       COALESCE(SUM(b.cost_usd_act), 0.0)::float as total_cost_act,
       COALESCE(SUM(b.cost_usd_est), 0.0)::float as total_cost_est
     FROM tickets.factory_run_budget b
     JOIN tickets.tickets t ON b.ticket_id = t.id
     GROUP BY t.id, t.external_id, t.title
     ORDER BY run_date DESC, ticket_id DESC
     LIMIT $1`,
    [limitCount]
  );

  return r.rows.map(row => ({
    ticketId: row.ticket_id,
    externalId: row.external_id,
    title: row.title,
    runDate: row.run_date ? row.run_date.toISOString().slice(0, 10) : '',
    totalCostAct: row.total_cost_act,
    totalCostEst: row.total_cost_est,
  }));
}
