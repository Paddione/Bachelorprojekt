import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { startAction, finishAction, checkConcurrent, ConcurrentActionError } from '../admin-actions';

function mockPool(impl: (q: string, params: unknown[]) => unknown): Pool {
  return { query: vi.fn(impl) } as unknown as Pool;
}

describe('startAction', () => {
  it('inserts and returns action_id', async () => {
    const pool = mockPool((q) => {
      if (q.includes('INSERT')) return { rows: [{ id: 42 }] };
      if (q.includes('SELECT')) return { rows: [] };
      return { rows: [] };
    });
    const id = await startAction(pool, {
      actor: 'gekko', action: 'redeploy_website', target: 'mentolder', cluster: 'mentolder', payload: {}
    });
    expect(id).toBe(42);
  });
});

describe('checkConcurrent', () => {
  it('throws ConcurrentActionError when in-progress action exists within 10 min', async () => {
    const pool = mockPool((q) => {
      if (q.includes('SELECT')) return { rows: [{ id: 7, created_at: new Date() }] };
      return { rows: [] };
    });
    await expect(checkConcurrent(pool, 'redeploy_website', 'mentolder'))
      .rejects.toBeInstanceOf(ConcurrentActionError);
  });

  it('allows when no in-progress', async () => {
    const pool = mockPool(() => ({ rows: [] }));
    await expect(checkConcurrent(pool, 'redeploy_website', 'mentolder')).resolves.toBeUndefined();
  });
});

describe('finishAction', () => {
  it('updates status to success', async () => {
    const queries: string[] = [];
    const pool = mockPool((q, _params) => { queries.push(q); return { rows: [] }; });
    await finishAction(pool, 42, { status: 'success', payload: { ok: true } });
    expect(queries[0]).toMatch(/UPDATE public\.admin_actions/);
  });
});
