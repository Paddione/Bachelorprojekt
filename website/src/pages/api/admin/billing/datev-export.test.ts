import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../lib/datev-extf', () => ({
  getBookingsForPeriod: vi.fn().mockResolvedValue([]),
  buildExtfCsv: vi.fn().mockReturnValue('"EXTF";700;21;"Buchungsstapel"'),
  periodRange: vi.fn().mockReturnValue({ from: '2026-01-01', to: '2026-01-31', label: 'Januar 2026' }),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './datev-export';

const mockSession = { userId: 'admin', email: 'admin@test.de' };

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/admin/billing/datev-export');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), { headers: { cookie: 'session=test' } });
}

describe('GET /api/admin/billing/datev-export', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: makeRequest({ year: '2026' }), url: new URL('http://localhost?year=2026') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when year is missing', async () => {
    const res = await GET({ request: makeRequest(), url: new URL('http://localhost') } as any);
    expect(res.status).toBe(400);
  });

  it('returns CSV with correct Content-Type', async () => {
    const res = await GET({ request: makeRequest({ year: '2026', month: '1' }), url: new URL('http://localhost?year=2026&month=1') } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
  });

  it('sets Content-Disposition attachment with filename', async () => {
    const res = await GET({ request: makeRequest({ year: '2026', month: '1' }), url: new URL('http://localhost?year=2026&month=1') } as any);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment.*filename/);
    expect(res.headers.get('Content-Disposition')).toContain('datev-');
  });
});

// --- datev-email tests ---
vi.mock('../../../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from './datev-email';
import { sendEmail } from '../../../../lib/email';

describe('POST /api/admin/billing/datev-email', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when year missing', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipient email missing', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1 }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('calls sendEmail with CSV attachment and returns 200', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'stb@example.de',
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: expect.stringMatching(/\.csv$/) }),
        ]),
      }),
    );
  });
});
