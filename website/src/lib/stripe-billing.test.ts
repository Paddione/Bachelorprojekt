import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock native-billing to avoid hitting the DB. The whole point of this test is
// to verify the createBillingInvoice shim translates SERVICES + ServiceKey into
// the correct native-billing createInvoice call — which used to throw, breaking
// /api/admin/inbox/[id]/action.ts (T000172, T000170).
vi.mock('./native-billing', () => ({
  createCustomer: vi.fn(),
  createInvoice: vi.fn(),
  getCustomerById: vi.fn(),
}));

// website-db's pool is lazy (new Pool() doesn't connect), and initBillingTables
// is only called inside discardDraftInvoice / get*Invoice paths we don't test
// here, so no mock needed for the shim under test.

import { createBillingInvoice, SERVICES } from './stripe-billing';
import * as nativeBilling from './native-billing';

const mockedNative = nativeBilling as unknown as {
  createInvoice: ReturnType<typeof vi.fn>;
  getCustomerById: ReturnType<typeof vi.fn>;
};

describe('createBillingInvoice (booking-confirmation shim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedNative.getCustomerById.mockResolvedValue({
      id: 'cust-1', brand: 'mentolder', name: 'Test', email: 't@e.de', landIso: 'DE',
    });
    mockedNative.createInvoice.mockResolvedValue({
      id: 'inv-1', brand: 'mentolder', number: 'RE-2026-0001', status: 'draft',
      customerId: 'cust-1', issueDate: '2026-05-08', dueDate: '2026-05-22',
      taxMode: 'regelbesteuerung', netAmount: 60, taxRate: 19, taxAmount: 11.4,
      grossAmount: 71.4, locked: false, currency: 'EUR', currencyRate: null,
      netAmountEur: 60, grossAmountEur: 71.4, kind: 'regular',
    });
  });

  it('does not throw — regression for T000172/T000170', async () => {
    const promise = createBillingInvoice({
      customerId: 'cust-1',
      serviceKey: '50plus-digital-einzel',
    });
    await expect(promise).resolves.toBeDefined();
  });

  it('converts SERVICES.cents to euros for the line unitPrice', async () => {
    await createBillingInvoice({
      customerId: 'cust-1',
      serviceKey: '50plus-digital-einzel', // cents: 6000 → €60
    });
    expect(mockedNative.createInvoice).toHaveBeenCalledTimes(1);
    const args = mockedNative.createInvoice.mock.calls[0][0];
    expect(args.lines).toHaveLength(1);
    expect(args.lines[0].unitPrice).toBe(60);
    expect(args.lines[0].description).toBe(SERVICES['50plus-digital-einzel'].name);
    expect(args.lines[0].unit).toBe(SERVICES['50plus-digital-einzel'].unit);
  });

  it('returns a BillingInvoice shape compatible with action.ts callers', async () => {
    const inv = await createBillingInvoice({
      customerId: 'cust-1',
      serviceKey: 'coaching-session',
    });
    // action.ts reads invoice.id, invoice.number, invoice.amountDue.
    expect(inv.id).toBe('inv-1');
    expect(inv.number).toBe('RE-2026-0001');
    expect(inv.amountDue).toBe(71.4);
    expect(inv.status).toBe('draft');
  });

  it('throws a clear error for unknown serviceKey', async () => {
    await expect(
      createBillingInvoice({ customerId: 'cust-1', serviceKey: 'nope' as never }),
    ).rejects.toThrow(/unknown serviceKey/);
  });

  it('throws for free-tier services (cents=0) instead of issuing zero-EUR invoices', async () => {
    await expect(
      createBillingInvoice({ customerId: 'cust-1', serviceKey: 'erstgespraech' }),
    ).rejects.toThrow(/no chargeable price/);
  });

  it('throws if customer is not found in the brand (FK guard)', async () => {
    mockedNative.getCustomerById.mockResolvedValueOnce(null);
    await expect(
      createBillingInvoice({ customerId: 'missing', serviceKey: 'coaching-session' }),
    ).rejects.toThrow(/customer missing not found/);
  });

  it('honours the quantity parameter', async () => {
    await createBillingInvoice({
      customerId: 'cust-1',
      serviceKey: 'coaching-session',
      quantity: 3,
    });
    const args = mockedNative.createInvoice.mock.calls[0][0];
    expect(args.lines[0].quantity).toBe(3);
  });
});
