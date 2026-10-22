// F4: the three /api/meeting/* routes are internal-only (talk-transcriber
// with INTERNAL_API_TOKEN). Unauthenticated callers must get 401, and the
// gate must fail closed when the secret is not configured.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as finalizePOST } from './finalize';
import { POST as saveTranscriptPOST } from './save-transcript';
import { POST as transcribePOST } from './transcribe';

const TOKEN = 'test-internal-token-0123456789';

const locals = { requestLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };

const ctx = (request: Request) => ({ request, locals }) as unknown as Parameters<typeof finalizePOST>[0];

const jsonReq = (body: unknown, token?: string) =>
  new Request('https://web.example.test/api/meeting/x', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const emptyFormReq = (token?: string) => {
  const form = new FormData();
  return new Request('https://web.example.test/api/meeting/transcribe', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
};

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = TOKEN;
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTERNAL_API_TOKEN;
  else process.env.INTERNAL_API_TOKEN = saved;
});

describe('POST /api/meeting/finalize', () => {
  it('returns 401 without a token', async () => {
    const res = await finalizePOST(ctx(jsonReq({})));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with a wrong token', async () => {
    const res = await finalizePOST(ctx(jsonReq({}, 'wrong-token')));
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when INTERNAL_API_TOKEN is not configured', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const res = await finalizePOST(ctx(jsonReq({}, TOKEN)));
    expect(res.status).toBe(401);
  });

  it('passes the gate with a valid token (empty body still 400)', async () => {
    const res = await finalizePOST(ctx(jsonReq({}, TOKEN)));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/meeting/save-transcript', () => {
  it('returns 401 without a token', async () => {
    const res = await saveTranscriptPOST(ctx(jsonReq({})));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with a wrong token', async () => {
    const res = await saveTranscriptPOST(ctx(jsonReq({}, 'wrong-token')));
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when INTERNAL_API_TOKEN is not configured', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const res = await saveTranscriptPOST(ctx(jsonReq({}, TOKEN)));
    expect(res.status).toBe(401);
  });

  it('passes the gate with a valid token (missing roomToken still 400)', async () => {
    const res = await saveTranscriptPOST(ctx(jsonReq({}, TOKEN)));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/meeting/transcribe', () => {
  it('returns 401 without a token', async () => {
    const res = await transcribePOST(ctx(emptyFormReq()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with a wrong token', async () => {
    const res = await transcribePOST(ctx(emptyFormReq('wrong-token')));
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when INTERNAL_API_TOKEN is not configured', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const res = await transcribePOST(ctx(emptyFormReq(TOKEN)));
    expect(res.status).toBe(401);
  });

  it('passes the gate with a valid token (missing file still 400)', async () => {
    const res = await transcribePOST(ctx(emptyFormReq(TOKEN)));
    expect(res.status).toBe(400);
  });
});
