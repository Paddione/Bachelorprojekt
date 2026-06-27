import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const ensureSchemaOnce = vi.fn();
vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  ensureSchemaOnce: (...a: unknown[]) => ensureSchemaOnce(...a),
}));

import { getEnabled, getAll, setEnabled } from './agent-push-settings';

beforeEach(() => { query.mockReset(); ensureSchemaOnce.mockReset(); });

describe('agent-push-settings', () => {
  it('getEnabled: returns the boolean from the row, false if missing', async () => {
    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ enabled: true }] });
    expect(await getEnabled('opencode')).toBe(true);

    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getEnabled('agy')).toBe(false);
  });

  it('getAll: merges both known sources (defaults to false)', async () => {
    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [
      { source: 'opencode', enabled: true },
      { source: 'agy', enabled: false },
    ] });
    expect(await getAll()).toEqual({ opencode: true, agy: false });

    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getAll()).toEqual({ opencode: false, agy: false });

    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ source: 'opencode', enabled: true }] });
    expect(await getAll()).toEqual({ opencode: true, agy: false });
  });

  it('setEnabled: upserts and refreshes updated_at', async () => {
    ensureSchemaOnce.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [] });
    await setEnabled('opencode', true);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO agent_push_settings/);
    expect(sql).toMatch(/ON CONFLICT \(source\) DO UPDATE/);
    expect(params).toEqual(['opencode', true]);
  });
});
