import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const pool = { query: (...a: unknown[]) => query(...a) };
import { purgeAllTestData } from './purge-all';

beforeEach(() => query.mockReset());

describe('systemtest/purge-all', () => {
  it('invokes tickets.fn_purge_test_data() and forwards the JSONB counts', async () => {
    query.mockResolvedValueOnce({
      rows: [{ fn_purge_test_data: { customers: 3, tickets: 9, sessions: 1 } }],
    });
    const out = await purgeAllTestData(pool as never);
    expect(out).toEqual({ customers: 3, tickets: 9, sessions: 1 });
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT tickets\.fn_purge_test_data\(\)/);
  });

  it('returns an empty record when the SQL row is missing the function key', async () => {
    query.mockResolvedValueOnce({ rows: [{}] });
    const out = await purgeAllTestData(pool as never);
    expect(out).toEqual({});
  });

  it('returns an empty record when no row comes back at all', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await purgeAllTestData(pool as never)).toEqual({});
  });
});
