import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/website-db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../../lib/tickets/email-templates', () => ({
  sendBugCloseEmail: vi.fn(),
}));

import { pool } from '../../../../lib/website-db';
import { sendBugCloseEmail } from '../../../../lib/tickets/email-templates';
import { POST } from './notify-close';

type RouteContext = Parameters<typeof POST>[0];

const req = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  new Request('https://web.example.test/api/internal/tickets/notify-close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw ?? JSON.stringify(body),
  });

function makeContext(body: unknown, headers: Record<string, string> = {}, raw?: string): RouteContext {
  return { request: req(body, headers, raw) } as unknown as RouteContext;
}

const TOKEN = { 'x-internal-token': 'test-token' };

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = 'test-token';
  vi.mocked(pool.query).mockReset();
  vi.mocked(sendBugCloseEmail).mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = saved;
});

describe('POST /api/internal/tickets/notify-close (F7)', () => {
  it('rejects request without token with 403', async () => {
    const res = await POST(makeContext({ externalId: 'T000001', resolution: 'done' }));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects request with wrong token with 403', async () => {
    const res = await POST(
      makeContext({ externalId: 'T000001', resolution: 'done' }, { 'x-internal-token': 'wrong' }),
    );
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON instead of 500', async () => {
    const res = await POST(makeContext(null, TOKEN, 'kein-json{{{'));
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown ticket', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const res = await POST(
      makeContext({ externalId: 'T999999', resolution: 'done' }, TOKEN),
    );
    expect(res.status).toBe(404);
  });

  it('sends close mail for known ticket with reporter email', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ external_id: 'T000001', reporter_email: 'a@example.invalid' }],
      rowCount: 1,
    } as never);
    vi.mocked(sendBugCloseEmail).mockResolvedValue(true as never);
    const res = await POST(
      makeContext({ externalId: 'T000001', resolution: 'done' }, TOKEN),
    );
    expect(res.status).toBe(200);
    expect(sendBugCloseEmail).toHaveBeenCalledOnce();
  });
});
