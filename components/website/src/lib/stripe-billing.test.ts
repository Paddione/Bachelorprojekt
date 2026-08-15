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

const query = vi.fn();
const initBillingTables = vi.fn();
vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  initBillingTables: (...a: unknown[]) => initBillingTables(...a),
}));

const loggerWarn = vi.fn();
vi.mock('./logger', () => ({ logger: { warn: (...a: unknown[]) => loggerWarn(...a) } }));

import {
  createBillingInvoice, SERVICES, getOrCreateCustomer,
  getAllBillingInvoices, getDraftInvoices, getCustomerInvoices,
  getDraftInvoiceDetail, getFullInvoice, createBillingQuote,
  createMonthlyDraftInvoices, updateDraftInvoiceItem, addDraftInvoiceItem,
  deleteDraftInvoiceItem,
} from './stripe-billing';
import * as nativeBilling from './native-billing';

const mockedNative = nativeBilling as unknown as {
  createInvoice: ReturnType<typeof vi.fn>;
  getCustomerById: ReturnType<typeof vi.fn>;
  createCustomer: ReturnType<typeof vi.fn>;
};

describe('createBillingInvoice (booking-confirmation shim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockReset();
    initBillingTables.mockReset();
    initBillingTables.mockResolvedValue(undefined);
    loggerWarn.mockReset();
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

describe('getOrCreateCustomer', () => {
  it('delegates to native-billing createCustomer and maps the returned shape', async () => {
    mockedNative.createCustomer.mockResolvedValueOnce({
      id: 'cust-9', brand: 'mentolder', name: 'Carla', email: 'c@e.de', landIso: 'DE',
    });
    const out = await getOrCreateCustomer({ brand: 'mentolder', name: 'Carla', email: 'c@e.de', company: 'ACME' });
    expect(out).toEqual({ id: 'cust-9', name: 'Carla', email: 'c@e.de' });
    expect(mockedNative.createCustomer).toHaveBeenCalledWith({
      brand: 'mentolder', name: 'Carla', email: 'c@e.de', company: 'ACME',
    });
  });
});

describe('billing invoice reads (pool.query backed)', () => {
  beforeEach(() => {
    query.mockReset();
    initBillingTables.mockReset();
    initBillingTables.mockResolvedValue(undefined);
    loggerWarn.mockReset();
  });

  it('getAllBillingInvoices: defaults perPage=200 and maps admin rows', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'i1', number: 'R-1', status: 'paid', gross_amount: '100', paid_amount: '100',
      issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
      customer_name: 'Alice', customer_email: 'a@b.com',
    }] });
    const out = await getAllBillingInvoices();
    expect(out).toHaveLength(1);
    expect(out[0].customerName).toBe('Alice');
    expect(out[0].amountRemaining).toBe(0);
    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toMatch(/AND i\.status = /);
    expect(params).toEqual(['mentolder', 200]);
  });

  it('getAllBillingInvoices: applies a status filter and custom perPage, escaping quotes', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getAllBillingInvoices({ status: "o'pen", perPage: 5 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/AND i\.status = 'o''pen'/);
    expect(params).toEqual(['mentolder', 5]);
  });

  it('getAllBillingInvoices: maps cancelled status to void and unknown status label', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'i1', number: 'R-1', status: 'cancelled', gross_amount: '10', paid_amount: '0',
      issue_date: null, due_date: null, customer_name: null, customer_email: null,
    }] });
    const out = await getAllBillingInvoices();
    expect(out[0].status).toBe('void');
    expect(out[0].statusLabel).toBe('Storniert');
    expect(out[0].date).toBe('');
    expect(out[0].customerName).toBe('');
  });

  it('getDraftInvoices: filters to status=draft, limit 100', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getDraftInvoices();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/i\.status = 'draft'/);
    expect(sql).toMatch(/LIMIT 100/);
    expect(params).toEqual(['mentolder']);
  });

  it('getCustomerInvoices: filters by customer email and maps rows (no customer name)', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'i1', number: 'R-1', status: 'open', gross_amount: '50', paid_amount: '20',
      issue_date: new Date('2026-02-01'), due_date: new Date('2026-02-15'),
    }] });
    const out = await getCustomerInvoices('a@b.com');
    expect(out).toHaveLength(1);
    expect(out[0].amountRemaining).toBe(30);
    expect((out[0] as unknown as { customerName?: string }).customerName).toBeUndefined();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/c\.email = \$2/);
    expect(params).toEqual(['mentolder', 'a@b.com']);
  });

  it('getDraftInvoiceDetail: returns null when the invoice is not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const out = await getDraftInvoiceDetail('missing');
    expect(out).toBeNull();
    expect(query).toHaveBeenCalledTimes(1); // no second (line items) query
  });

  it('getDraftInvoiceDetail: assembles items + tax breakdown when found', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'i1', number: 'R-1', status: 'draft', gross_amount: '119', paid_amount: '0',
        issue_date: new Date('2026-03-01'), due_date: new Date('2026-03-15'),
        customer_name: 'Bob', customer_email: 'b@b.com',
        net_amount: '100', tax_amount: '19', tax_rate: '19',
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'li1', description: 'Coaching', quantity: '1', unit_price: '100', net_amount: '100',
      }] });
    const out = await getDraftInvoiceDetail('i1');
    expect(out).not.toBeNull();
    expect(out!.items).toHaveLength(1);
    expect(out!.items[0].amount).toBe(100);
    expect(out!.subtotalExclTax).toBe(100);
    expect(out!.taxAmount).toBe(19);
    expect(out!.taxPercent).toBe(19);
    expect(out!.currency).toBe('EUR');
    const [lineSql, lineParams] = query.mock.calls[1];
    expect(lineSql).toMatch(/FROM billing_invoice_line_items WHERE invoice_id = \$1/);
    expect(lineParams).toEqual(['i1']);
  });

  it('getFullInvoice: delegates to getDraftInvoiceDetail', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const out = await getFullInvoice('missing');
    expect(out).toBeNull();
  });
});

describe('deprecated / native-billing-only shims', () => {
  it('createBillingQuote: always throws, pointing callers at native billing', async () => {
    await expect(createBillingQuote({})).rejects.toThrow(/use native billing instead/);
  });

  it('createMonthlyDraftInvoices: warns and returns an empty array', async () => {
    const out = await createMonthlyDraftInvoices({});
    expect(out).toEqual([]);
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringMatching(/createMonthlyDraftInvoices/));
  });

  it('updateDraftInvoiceItem: warns, does not throw', async () => {
    await expect(updateDraftInvoiceItem('item-1', {})).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringMatching(/updateDraftInvoiceItem/));
  });

  it('addDraftInvoiceItem: always throws, pointing callers at native billing item routes', async () => {
    await expect(addDraftInvoiceItem('inv-1', {})).rejects.toThrow(/use native billing item routes instead/);
  });

  it('deleteDraftInvoiceItem: warns, does not throw', async () => {
    await expect(deleteDraftInvoiceItem('item-1')).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringMatching(/deleteDraftInvoiceItem/));
  });
});
