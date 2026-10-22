import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../lib/e2e-marker', () => ({
  isE2ETestRequest: vi.fn().mockReturnValue(false),
}));
vi.mock('../../../lib/stripe-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/stripe-billing')>();
  return {
    ...actual,
    getOrCreateCustomer: vi.fn(),
    createBillingInvoice: vi.fn(),
  };
});

import { getSession, isAdmin } from '../../../lib/auth';
import type { UserSession } from '../../../lib/auth';
import { getOrCreateCustomer, createBillingInvoice } from '../../../lib/stripe-billing';
import { POST } from './create-invoice';

const mockSession = { userId: 'admin-1', email: 'admin@test.de' } as unknown as UserSession;

function postRequest(body: unknown, cookie: string | null = 'session=test'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/billing/create-invoice', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function ctx(req: Request) {
  return { request: req } as unknown as Parameters<typeof POST>[0];
}

const validBody = {
  name: 'Test Kunde',
  email: 'kunde@example.de',
  serviceKey: 'coaching-session',
  quantity: 1,
};

describe('POST /api/billing/create-invoice (F5 / #6822)', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(getOrCreateCustomer).mockResolvedValue({ id: 'cus-1', name: 'Test Kunde', email: 'kunde@example.de' });
    vi.mocked(createBillingInvoice).mockResolvedValue({
      id: 'inv-1', number: 'RE-1', date: '2026-10-22', dueDate: '2026-11-05',
      amountDue: 178.5, amountPaid: 0, amountRemaining: 178.5,
      status: 'draft', statusLabel: 'Entwurf', hostedUrl: null, pdfUrl: null,
    });
  });

  it('returns 401 when unauthenticated and creates nothing', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(ctx(postRequest(validBody)));
    expect(res.status).toBe(401);
    expect(getOrCreateCustomer).not.toHaveBeenCalled();
    expect(createBillingInvoice).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated but not admin', async () => {
    vi.mocked(isAdmin).mockReturnValue(false);
    const res = await POST(ctx(postRequest(validBody)));
    expect(res.status).toBe(403);
    expect(getOrCreateCustomer).not.toHaveBeenCalled();
    expect(createBillingInvoice).not.toHaveBeenCalled();
  });

  it('returns 200 for admin and creates customer + invoice', async () => {
    const res = await POST(ctx(postRequest(validBody)));
    expect(res.status).toBe(200);
    expect(getOrCreateCustomer).toHaveBeenCalledTimes(1);
    expect(createBillingInvoice).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.type).toBe('invoice');
  });

  it('returns 410 for asQuote instead of 500', async () => {
    const res = await POST(ctx(postRequest({ ...validBody, asQuote: true })));
    expect(res.status).toBe(410);
    expect(createBillingInvoice).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown service', async () => {
    const res = await POST(ctx(postRequest({ ...validBody, serviceKey: 'nope' })));
    expect(res.status).toBe(400);
    expect(createBillingInvoice).not.toHaveBeenCalled();
  });
});
