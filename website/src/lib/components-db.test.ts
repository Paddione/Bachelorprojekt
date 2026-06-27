import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { listComponents, createComponent, updateComponent, deleteComponent } from './components-db';

beforeEach(() => query.mockReset());

describe('components-db', () => {
  it('listComponents: no filters → simple SELECT ... ORDER BY', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listComponents();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM bachelorprojekt\.components/);
    expect(sql).toMatch(/ORDER BY kind, area, name/);
    expect(sql).toMatch(/LIMIT \$1 OFFSET \$2/);
    expect(params).toEqual([200, 0]);
  });

  it('listComponents: all filters produce the matching WHERE clauses + ILIKE', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listComponents({ kind: 'physical', cluster: 'mentolder', status: 'active', q: 'k8s', limit: 500, offset: 10 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/kind = \$1/);
    expect(sql).toMatch(/cluster = \$2/);
    expect(sql).toMatch(/status = \$3/);
    expect(sql).toMatch(/ILIKE \$4/);
    expect(params[0]).toBe('physical');
    expect(params[1]).toBe('mentolder');
    expect(params[2]).toBe('active');
    expect(params[3]).toBe('%k8s%');
    expect(params[4]).toBe(500);
    expect(params[5]).toBe(10);
  });

  it('listComponents: clamps limit to [1,1000] and offset to >= 0', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await listComponents({ limit: 99999, offset: -50 });
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(1000); // capped
    expect(params[1]).toBe(0);    // floored
  });

  it('createComponent: returns the inserted row with sensible defaults', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 1, name: 'k8s-cluster', kind: 'physical', area: 'infra', status: 'active',
      cluster: 'both', url: null, hostname: null, notes: null,
      created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
    }] });
    const out = await createComponent({ name: 'k8s-cluster', kind: 'physical', area: 'infra' });
    expect(out.id).toBe(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO bachelorprojekt\.components/);
    expect(params[3]).toBe('active');
    expect(params[4]).toBe('both');
    expect(params[5]).toBeNull();
  });

  it('updateComponent: builds SET only from provided fields, returns null when empty patch', async () => {
    const out = await updateComponent(1, {});
    expect(out).toBeNull();
    expect(query).not.toHaveBeenCalled();

    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'renamed' }] });
    const out2 = await updateComponent(1, { name: 'renamed', notes: 'hello' });
    expect(out2?.name).toBe('renamed');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/name = \$1/);
    expect(sql).toMatch(/notes = \$2/);
    expect(sql).toMatch(/updated_at = now/);
    expect(params).toEqual(['renamed', 'hello', 1]);
  });

  it('updateComponent: returns null when the row is missing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await updateComponent(999, { name: 'x' })).toBeNull();
  });

  it('deleteComponent: soft-deletes by flipping status=deprecated and reports true/false', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    expect(await deleteComponent(5)).toBe(true);

    query.mockResolvedValueOnce({ rows: [] });
    expect(await deleteComponent(999)).toBe(false);
  });
});
