import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock('../../../../../lib/invoice-payments', () => ({
  listPayments: vi.fn().mockResolvedValue([{ id: 'p1', amount: 100 }]),
  recordPayment: vi.fn().mockResolvedValue({ id: 'p2', amount: 50 }),
}));

import { getSession, isAdmin } from '../../../../../lib/auth';
import { listPayments, recordPayment } from '../../../../../lib/invoice-payments';
import { GET, POST } from './payments';

const mockSession = { user: { id: 'admin1', email: 'admin@test.de' } };

describe('GET /api/admin/billing/[id]/payments', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('returns 403 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(403);
  });

  it('returns payments list', async () => {
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payments).toEqual([{ id: 'p1', amount: 100 }]);
    expect(vi.mocked(listPayments)).toHaveBeenCalledWith('inv1');
  });
});

describe('POST /api/admin/billing/[id]/payments', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(recordPayment).mockClear();
  });

  it('returns 403 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when missing fields', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ paidAt: '2026-01-01' }), // missing amount and method
    });
    const res = await POST({ request: req, params: { id: 'inv1' } } as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when invalid method', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ paidAt: '2026-01-01', amount: 100, method: 'invalid' }),
    });
    const res = await POST({ request: req, params: { id: 'inv1' } } as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when negative amount without notes', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ paidAt: '2026-01-01', amount: -10, method: 'sepa' }),
    });
    const res = await POST({ request: req, params: { id: 'inv1' } } as any);
    expect(res.status).toBe(400);
  });

  it('records payment and returns 201', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ paidAt: '2026-01-01', amount: 100, method: 'bank', reference: 'ref1' }),
    });
    const res = await POST({ request: req, params: { id: 'inv1' } } as any);
    expect(res.status).toBe(201);
    expect(vi.mocked(recordPayment)).toHaveBeenCalledWith({
      invoiceId: 'inv1',
      paidAt: '2026-01-01',
      amount: 100,
      method: 'bank',
      reference: 'ref1',
      notes: undefined,
      recordedBy: 'admin@test.de',
    });
    const data = await res.json();
    expect(data.payment).toEqual({ id: 'p2', amount: 50 });
  });

  it('handles recordPayment errors (400)', async () => {
    vi.mocked(recordPayment).mockRejectedValueOnce(new Error('cannot exceed gross amount'));
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ paidAt: '2026-01-01', amount: 100, method: 'bank' }),
    });
    const res = await POST({ request: req, params: { id: 'inv1' } } as any);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('cannot exceed gross amount');
  });
});
