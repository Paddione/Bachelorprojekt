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
});

it('binds measurement values and records unknown without fabricated zero', async () => {
  mocks.scan.mockResolvedValue([{ id: 'G-RH01', measurable: false }]);
  const response = await POST(context());
  expect(response.status).toBe(200);
  const [sql, values] = mocks.query.mock.calls[0];
  expect(sql).toContain('$1');
  expect(values.slice(0, 3)).toEqual(['G-RH01', null, 'unknown']);
});

it('rejects unauthorized requests before scanning or writing measurements', async () => {
  mocks.session.mockResolvedValue(null);
  const response = await POST(context());
  expect(response.status).toBe(401);
  expect(mocks.scan).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
