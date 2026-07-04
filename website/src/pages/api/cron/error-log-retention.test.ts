import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../lib/logging/error-log-store', () => ({
  getErrorLogPool: () => ({ query: (...a: unknown[]) => query(...a) }),
}));

import { POST } from './error-log-retention';

type RouteContext = Parameters<typeof POST>[0];

const requestLogger = { info: vi.fn(), error: vi.fn() };

const req = (auth?: string) =>
  new Request('https://web.example.test/api/cron/error-log-retention', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  query.mockReset();
  requestLogger.info.mockReset();
  requestLogger.error.mockReset();
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe('POST /api/cron/error-log-retention', () => {
  it('returns 403 without the correct Bearer token', async () => {
    const res = await POST({ request: req('Bearer wrong-token'), locals: { requestLogger } } as unknown as RouteContext);
    expect(res.status).toBe(403);
  });

  it('fails closed (403) when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST({ request: req('Bearer test-secret'), locals: { requestLogger } } as unknown as RouteContext);
    expect(res.status).toBe(403);
  });

  it('deletes errors older than 7 days with correct auth', async () => {
    query.mockResolvedValueOnce({ rowCount: 5 });

    const res = await POST({ request: req('Bearer test-secret'), locals: { requestLogger } } as unknown as RouteContext);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(5);
    expect(query).toHaveBeenCalledWith('DELETE FROM error_log WHERE ts < NOW() - INTERVAL \'7 days\'');
  });
});
