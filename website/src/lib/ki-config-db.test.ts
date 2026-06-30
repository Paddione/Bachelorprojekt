import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import {
  listProviders, createProvider, updateProvider,
  countEnabledForSource, EMBED_PRIMARY_KEY, EMBED_FALLBACK_KEY,
} from './ki-config-db';

beforeEach(() => query.mockReset());

describe('ki-config-db', () => {
  it('listProviders orders by source, tier, priority', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, source: '*', tier: 'sonnet', priority: 99 }] });
    const rows = await listProviders();
    expect(rows).toHaveLength(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/ORDER BY/i);
    expect(sql).toMatch(/priority/i);
  });

  it('listProviders schließt Coaching-Rows aus', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listProviders();
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/source\s*<>\s*'coaching'/i);
  });

  it('countEnabledForSource returns the integer count', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '2' }] });
    const n = await countEnabledForSource('chat/*', 'sonnet', 5);
    expect(n).toBe(2);
    // excludes the row being deleted/disabled (id param)
    expect(query.mock.calls[0][1]).toContain(5);
  });

  it('createProvider returns the new id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const id = await createProvider({
      source: 'chat/*', tier: 'sonnet', priority: 1, provider: 'anthropic',
      model_id: 'claude-sonnet-4-6', base_url: null, max_concurrent: 3, enabled: true,
    });
    expect(id).toBe(42);
  });

  it('updateProvider builds a dynamic SET clause from provided fields only', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    await updateProvider(7, { priority: 2, enabled: false });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/SET/i);
    expect(sql).toMatch(/priority/);
    expect(sql).toMatch(/enabled/);
    expect(sql).not.toMatch(/provider\s*=/); // not touched
  });

  it('updateProvider with no fields is a no-op (returns false, no query)', async () => {
    const ok = await updateProvider(7, {});
    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('exports embedding setting keys', () => {
    expect(EMBED_PRIMARY_KEY).toBe('ki_embed_primary');
    expect(EMBED_FALLBACK_KEY).toBe('ki_embed_fallback');
  });
});
