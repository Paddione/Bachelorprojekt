import type { APIRoute } from 'astro';
import type { Pool } from 'pg';
import { pool as defaultPool } from '../../../lib/db-pool';
import { getSession, isAdmin } from '../../../lib/auth';
import type { AiWorkflow } from '../../../lib/ai-metrics';

const WORKFLOWS: AiWorkflow[] = ['coaching_chat', 'rag_search', 'embedding', 'grilling', 'plan_qa'];

const PRICE_PER_1K_EUR: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.003,   output: 0.015   },
  'claude-haiku-4-5':  { input: 0.00025, output: 0.00125 },
  'bge-m3':            { input: 0,       output: 0       },
};

// Test-only escape hatch: ai-quality.test.ts mocks the pool directly.
// In production this always resolves to `defaultPool` (from db-pool.ts).
let _pool: Pool | undefined;
export function __setPoolForTests(testPool: Pool): void { _pool = testPool; }
function getPool(): Pool { return _pool ?? defaultPool; }

export type Health = 'green' | 'yellow' | 'red';

export function computeHealth(m: { avg_latency_ms: number; error_rate: number; calls: number }): Health {
  if (m.calls === 0) return 'yellow';
  if (m.avg_latency_ms < 800 && m.error_rate < 0.05) return 'green';
  if (m.avg_latency_ms < 2000 && m.error_rate < 0.20) return 'yellow';
  return 'red';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  try {
    const p = getPool();

    const healthRes = await p.query(
      `SELECT workflow,
              COUNT(*)::int                                            AS calls,
              COALESCE(AVG(latency_ms),0)::float                       AS avg_latency_ms,
              COALESCE(AVG((error IS NOT NULL)::int),0)::float         AS error_rate
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '1 hour'
        GROUP BY workflow`,
    );
    const healthByWf = new Map<string, { calls: number; avg_latency_ms: number; error_rate: number }>();
    for (const r of healthRes.rows) healthByWf.set(r.workflow, r);
    const health = Object.fromEntries(
      WORKFLOWS.map((wf) => [wf, computeHealth(healthByWf.get(wf) ?? { calls: 0, avg_latency_ms: 0, error_rate: 0 })]),
    ) as Record<AiWorkflow, Health>;

    const histRes = await p.query(
      `SELECT date_trunc('hour', ts)                       AS hour,
              COUNT(*)::int                                AS calls,
              COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
              COALESCE(AVG(latency_ms),0)::int             AS avg_latency_ms
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '24 hours'
        GROUP BY 1 ORDER BY 1`,
    );
    const last24h = histRes.rows.map((r) => ({
      hour: new Date(r.hour).toISOString(),
      calls: r.calls, errors: r.errors, avg_latency_ms: r.avg_latency_ms,
    }));

    const wfRes = await p.query(
      `SELECT workflow, model,
              COUNT(*)::int                                          AS calls,
              COALESCE(AVG((error IS NOT NULL)::int),0)::float       AS error_rate,
              COALESCE(AVG(latency_ms),0)::int                       AS avg_latency_ms,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p95_latency_ms,
              COALESCE(SUM(prompt_tokens),0)::int                    AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0)::int                AS completion_tokens
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '7 days'
        GROUP BY workflow, model`,
    );
    const wfAgg = new Map<string, {
      calls: number; error_rate_sum: number; lat_sum: number; p95: number;
      total_tokens: number; est_cost_eur: number;
    }>();
    for (const r of wfRes.rows) {
      const price = PRICE_PER_1K_EUR[r.model ?? ''] ?? { input: 0, output: 0 };
      const cost = (r.prompt_tokens / 1000) * price.input + (r.completion_tokens / 1000) * price.output;
      const cur = wfAgg.get(r.workflow) ?? { calls: 0, error_rate_sum: 0, lat_sum: 0, p95: 0, total_tokens: 0, est_cost_eur: 0 };
      cur.calls += r.calls;
      cur.error_rate_sum += r.error_rate * r.calls;
      cur.lat_sum += r.avg_latency_ms * r.calls;
      cur.p95 = Math.max(cur.p95, r.p95_latency_ms);
      cur.total_tokens += r.prompt_tokens + r.completion_tokens;
      cur.est_cost_eur += cost;
      wfAgg.set(r.workflow, cur);
    }
    const byWorkflow = [...wfAgg.entries()].map(([workflow, a]) => ({
      workflow: workflow as AiWorkflow,
      calls: a.calls,
      error_rate: a.calls ? a.error_rate_sum / a.calls : 0,
      avg_latency_ms: a.calls ? Math.round(a.lat_sum / a.calls) : 0,
      p95_latency_ms: a.p95,
      total_tokens: a.total_tokens,
      est_cost_eur: Math.round(a.est_cost_eur * 100) / 100,
    })).sort((x, y) => y.est_cost_eur - x.est_cost_eur);

    const errRes = await p.query(
      `SELECT ts, workflow, model, error
         FROM ai_call_log
        WHERE error IS NOT NULL AND ts > NOW() - INTERVAL '7 days'
        ORDER BY ts DESC LIMIT 5`,
    );
    const recentErrors = errRes.rows.map((r) => ({
      ts: new Date(r.ts).toISOString(),
      workflow: r.workflow as AiWorkflow,
      model: r.model ?? null,
      error: r.error,
    }));

    return json({ health, last24h, byWorkflow, recentErrors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
};
