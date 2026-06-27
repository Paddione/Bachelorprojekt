import type { Pool } from 'pg';

type ActionStatus = 'in_progress' | 'success' | 'failed' | 'partial_success';

interface StartActionInput {
  actor: string;
  action: string;
  target?: string;
  cluster?: string;
  payload?: unknown;
}

interface FinishActionInput {
  status: 'success' | 'failed' | 'partial_success';
  payload?: unknown;
  error?: string;
}

export class ConcurrentActionError extends Error {
  constructor(public existing_id: number, public created_at: Date) {
    super(`Concurrent action in progress (id=${existing_id})`);
    this.name = 'ConcurrentActionError';
  }
}

const CONCURRENT_WINDOW = '10 minutes';

export async function checkConcurrent(pool: Pool, action: string, target?: string): Promise<void> {
  const result = await pool.query(
    `SELECT id, created_at FROM public.admin_actions
     WHERE action = $1 AND COALESCE(target, '') = COALESCE($2, '')
       AND status = 'in_progress' AND created_at > now() - interval '${CONCURRENT_WINDOW}'
     LIMIT 1`,
    [action, target ?? null]
  );
  if (result.rows.length > 0) {
    throw new ConcurrentActionError(result.rows[0].id, result.rows[0].created_at);
  }
}

export async function startAction(pool: Pool, input: StartActionInput): Promise<number> {
  await checkConcurrent(pool, input.action, input.target);
  const result = await pool.query(
    `INSERT INTO public.admin_actions (actor, action, target, cluster, payload, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'in_progress') RETURNING id`,
    [input.actor, input.action, input.target ?? null, input.cluster ?? null, JSON.stringify(input.payload ?? null)]
  );
  return result.rows[0].id as number;
}

export async function finishAction(pool: Pool, id: number, input: FinishActionInput): Promise<void> {
  await pool.query(
    `UPDATE public.admin_actions
     SET status = $2, completed_at = now(), payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb, error = $4
     WHERE id = $1`,
    [id, input.status, JSON.stringify(input.payload ?? null), input.error ?? null]
  );
}

export async function listActions(pool: Pool, opts: { actionFilter?: string; limit?: number } = {}): Promise<any[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const result = await pool.query(
    `SELECT id, actor, action, target, cluster, status, error, created_at, completed_at, payload
     FROM public.admin_actions
     WHERE ($1::text IS NULL OR action = $1)
     ORDER BY created_at DESC LIMIT $2`,
    [opts.actionFilter ?? null, limit]
  );
  return result.rows;
}
