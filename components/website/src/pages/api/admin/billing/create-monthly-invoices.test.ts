import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getUnbilledBillableEntriesByCustomer = vi.fn();
const setTimeEntryStripeInvoice = vi.fn();
const createMonthlyDraftInvoices = vi.fn();
vi.mock('../../../../lib/website-db', () => ({
  getUnbilledBillableEntriesByCustomer: (...a: unknown[]) =>
    getUnbilledBillableEntriesByCustomer(...a),
  setTimeEntryStripeInvoice: (...a: unknown[]) => setTimeEntryStripeInvoice(...a),
}));
vi.mock('../../../../lib/stripe-billing', () => ({
  createMonthlyDraftInvoices: (...a: unknown[]) => createMonthlyDraftInvoices(...a),
}));

import { POST } from './create-monthly-invoices';

type RouteContext = Parameters<typeof POST>[0];

const requestLogger = { info: vi.fn(), error: vi.fn() };

const req = () =>
  new Request('https://web.example.test/api/admin/billing/create-monthly-invoices', {
    method: 'POST',
    headers: { 'X-Cron-Secret': 'test-secret' },
  });

const group = (id: string) => ({
  customerId: id,
  customerName: `Customer ${id}`,
  customerEmail: `${id}@example.test`,
  entries: [{ id: `e-${id}`, minutes: 30 }],
});

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  getUnbilledBillableEntriesByCustomer.mockReset();
  setTimeEntryStripeInvoice.mockReset();
  createMonthlyDraftInvoices.mockReset();
  requestLogger.info.mockReset();
  requestLogger.error.mockReset();
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe('POST /api/admin/billing/create-monthly-invoices', () => {
  it('returns 500 with a structured error body when the top-level DB call throws', async () => {
    getUnbilledBillableEntriesByCustomer.mockRejectedValueOnce(new Error('db down'));

    const res = await POST({ request: req(), locals: { requestLogger } } as unknown as RouteContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'monthly_invoices_failed' });
    expect(requestLogger.error).toHaveBeenCalled();
  });

  it('counts per-customer failures as skipped instead of failing the request', async () => {
    getUnbilledBillableEntriesByCustomer.mockResolvedValueOnce([group('c1'), group('c2')]);
    createMonthlyDraftInvoices
      .mockResolvedValueOnce(new Map([['c1', 'inv_1']]))
      .mockRejectedValueOnce(new Error('stripe down'));
    setTimeEntryStripeInvoice.mockResolvedValue(undefined);

    const res = await POST({ request: req(), locals: { requestLogger } } as unknown as RouteContext);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ created: 1, skipped: 1 }));
  });
});
