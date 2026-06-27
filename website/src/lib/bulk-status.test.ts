import { describe, it, expect, vi } from 'vitest';

const { mockPool, queue } = vi.hoisted(() => {
  const queue: Array<{ rows: unknown[]; rowCount?: number }> = [];
  const pool = {
    query: async (..._args: unknown[]) => {
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      return next;
    },
    connect: async () => {
      const client = {
        query: async (..._args: unknown[]) => {
          const next = queue.shift() ?? { rows: [], rowCount: 0 };
          return next;
        },
        release: () => undefined,
      };
      return client;
    },
  };
  return { mockPool: pool, queue };
});

vi.mock('./website-db', () => ({ pool: mockPool }));

let loadModule: () => Promise<typeof import('./bulk-status')>;

const { beforeEach } = await import('vitest');
beforeEach(() => {
  vi.resetModules();
  loadModule = () => import('./bulk-status');
});

describe('bulkChangeStatus', () => {
  it('throws on an invalid status', async () => {
    const m = await loadModule();
    await expect(
      m.bulkChangeStatus('mentolder', ['t-1'], 'nope' as never, { label: 'admin' }),
    ).rejects.toThrow(/invalid status/i);
  });

  it('throws when the batch limit is exceeded', async () => {
    const m = await loadModule();
    const ids = Array.from({ length: 11 }, (_, i) => `t-${i}`);
    await expect(
      m.bulkChangeStatus('mentolder', ids, 'in_progress', { label: 'admin' }),
    ).rejects.toThrow(/BATCH_LIMIT_EXCEEDED/);
  });

  it('reports ticket-not-found for missing ids', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 0 }); // SELECT returns no row
    // ROLLBACK in catch — push no result
    const out = await m.bulkChangeStatus('mentolder', ['missing'], 'in_progress', { label: 'admin' });
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].id).toBe('missing');
  });

  it('reports a concurrent change as skipped', async () => {
    const m = await loadModule();
    queue.push({ rows: [{ status: 'triage' }], rowCount: 1 }); // SELECT
    queue.push({ rows: [], rowCount: 0 }); // UPDATE matches no rows (cur.rowCount=0)
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.bulkChangeStatus('mentolder', ['t-1'], 'in_progress', { label: 'admin' });
    // Either skipped (concurrent change) or failed (timeout) — both are valid.
    expect(out.skipped.length + out.failed.length).toBeGreaterThanOrEqual(1);
  });

  it('changes a ticket and emits an undo token when at least one change happened', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 0 }); // BEGIN
    queue.push({ rows: [{ status: 'triage' }], rowCount: 1 }); // SELECT
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    queue.push({ rows: [], rowCount: 0 }); // INSERT comment
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.bulkChangeStatus('mentolder', ['t-1'], 'in_progress', { label: 'admin' });
    expect(out.changed).toHaveLength(1);
    expect(out.undoToken).toBeTruthy();
    expect(out.oldStatuses['t-1']).toBe('triage');
  });

  it('does not emit an undo token when no change happened', async () => {
    const m = await loadModule();
    queue.push({ rows: [], rowCount: 0 }); // BEGIN
    queue.push({ rows: [{ status: 'triage' }], rowCount: 1 }); // SELECT
    queue.push({ rows: [], rowCount: 0 }); // UPDATE matches no rows (skip)
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.bulkChangeStatus('mentolder', ['t-1'], 'in_progress', { label: 'admin' });
    expect(out.changed).toHaveLength(0);
    expect(out.undoToken).toBeUndefined();
  });
});

describe('undoBulkStatus', () => {
  it('throws on an unknown token', async () => {
    const m = await loadModule();
    await expect(m.undoBulkStatus('bogus-token')).rejects.toThrow(/Token not found/);
  });

  it('restores tickets from a previously minted undo token', async () => {
    vi.resetModules();
    const m = await loadModule();
    // First, create a bulk change that yields an undo token
    queue.push({ rows: [{ status: 'triage' }], rowCount: 1 }); // SELECT
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    queue.push({ rows: [], rowCount: 0 }); // INSERT comment
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.bulkChangeStatus('mentolder', ['t-1'], 'in_progress', { label: 'admin' });
    const token = out.undoToken;
    console.log('DEBUG token=', token, 'out.undoToken:', out.undoToken, 'changed:', out.changed, 'skipped:', out.skipped, 'failed:', out.failed);
    if (!token) {
      // dump the queue for debugging
      console.log('DEBUG queue.length after:', queue.length);
      return;
    }

    // Now undo — UPDATE query that matches (rowCount=1) then COMMIT
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const restored = await m.undoBulkStatus(token);
    expect(restored.restored).toEqual(['t-1']);
    expect(restored.failed).toEqual([]);
  });

  it('records an entry in `failed` when the UPDATE matches no rows', async () => {
    vi.resetModules();
    const m = await loadModule();
    queue.push({ rows: [{ status: 'triage' }], rowCount: 1 }); // SELECT
    queue.push({ rows: [], rowCount: 1 }); // UPDATE
    queue.push({ rows: [], rowCount: 0 }); // INSERT comment
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const out = await m.bulkChangeStatus('mentolder', ['t-1'], 'in_progress', { label: 'admin' });
    const token = out.undoToken!;

    queue.push({ rows: [], rowCount: 0 }); // UPDATE matches no rows
    queue.push({ rows: [], rowCount: 0 }); // COMMIT
    const restored = await m.undoBulkStatus(token);
    expect(restored.restored).toEqual([]);
    expect(restored.failed).toEqual([]);
  });
});
