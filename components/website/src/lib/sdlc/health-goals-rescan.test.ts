import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
const mocks = vi.hoisted(() => ({ query: vi.fn(), scan: vi.fn(), session: vi.fn() }));
vi.mock('../db-pool', () => ({ pool: { query: mocks.query } }));
vi.mock('../auth', () => ({ getSession: mocks.session, isAdmin: () => true }));
vi.mock('./health-scan', () => ({ runHealthScan: mocks.scan, HealthScanInputError: class extends Error {} }));
const { POST } = await import('../../pages/sdlc/api/health-goals/rescan');
const context = () => ({ request: new Request('http://localhost/rescan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids: ['G-RH01'] }),
}) }) as APIContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: 'admin' });
  mocks.scan.mockResolvedValue([{ id: 'G-RH01', measurable: true, actual: 5, target: 0, cmp: 'le' }]);
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
});
describe('rescan durable measurements', () => {
  it('writes a successful scan into the measurements database before reporting success', async () => {
    const response = await POST(context());
    expect(response.status).toBe(200);
    const writes = mocks.query.mock.calls.filter(([sql]) => /INSERT\s+INTO\s+quality\.repo_health_measurements/i.test(String(sql)));
    expect(writes.length).toBeGreaterThan(0);
  });
  it('does not report success when recording fails', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'));
    const response = await POST(context());
    expect(response.status).toBe(500);
  });
  it('binds values as parameters and stores unmeasurable goals as unknown without a number', async () => {
    mocks.scan.mockResolvedValue([
      { id: 'G-RH01', measurable: true, actual: 5, target: 0, cmp: 'le' },
      { id: 'G-CQ02', measurable: false },
    ]);
    const response = await POST(context());
    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(String(sql)).not.toContain('G-RH01');
    expect(params[0]).toEqual(['G-RH01', 'G-CQ02']);
    expect(params[1]).toEqual([5, null]);
    expect(params[2][1]).toBe('unknown');
    expect(params[2][0]).not.toBe('achieved');
  });
  it('keeps auth and validation ahead of any database write', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(context())).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
