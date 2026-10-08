import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runDunningDetection = vi.fn();
const listPendingDunnings = vi.fn();
vi.mock('../../../../../lib/invoice-dunning', () => ({
  runDunningDetection: (...a: unknown[]) => runDunningDetection(...a),
  listPendingDunnings: (...a: unknown[]) => listPendingDunnings(...a),
}));

import { POST } from './run';

type RouteContext = Parameters<typeof POST>[0];

const requestLogger = { info: vi.fn(), error: vi.fn() };

const req = () =>
  new Request('https://web.example.test/api/admin/billing/dunning/run', {
    method: 'POST',
    headers: { 'X-Cron-Secret': 'test-secret' },
  });

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  runDunningDetection.mockReset();
  listPendingDunnings.mockReset();
  requestLogger.info.mockReset();
  requestLogger.error.mockReset();
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe('POST /api/admin/billing/dunning/run', () => {
  it('returns 500 with a structured error body when detection throws', async () => {
    runDunningDetection.mockRejectedValueOnce(new Error('db down'));

    const res = await POST({ request: req(), locals: { requestLogger } } as unknown as RouteContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'dunning_run_failed' });
    expect(requestLogger.error).toHaveBeenCalled();
  });

  it('returns the detection result with pending count on success', async () => {
    runDunningDetection.mockResolvedValueOnce({ generated: 2, skipped: 1 });
    listPendingDunnings.mockResolvedValueOnce([{ id: 'd1' }]);

    const res = await POST({ request: req(), locals: { requestLogger } } as unknown as RouteContext);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generated: 2, skipped: 1, pending: 1 });
  });
});
