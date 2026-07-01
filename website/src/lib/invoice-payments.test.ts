import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQ = vi.fn();
const connect = vi.fn();
const initBillingTables = vi.fn();
const addBooking = vi.fn();
const loggerError = vi.fn();

vi.mock('./website-db', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...a),
  },
  initBillingTables: (...a: unknown[]) => initBillingTables(...a),
}));
vi.mock('./eur-bookkeeping', () => ({
  addBooking: (...a: unknown[]) => addBooking(...a),
}));
vi.mock('./logger', () => ({
  logger: { error: (...a: unknown[]) => loggerError(...a) },
}));

import { recordPayment, listPayments } from './invoice-payments';

beforeEach(() => {
  query.mockReset();
  clientQ.mockReset();
  connect.mockReset();
  initBillingTables.mockReset();
  addBooking.mockReset();
  loggerError.mockReset();
  initBillingTables.mockResolvedValue(undefined);
  addBooking.mockResolvedValue(undefined);
  connect.mockResolvedValue({
    query: (...a: unknown[]) => clientQ(...a),
    release: () => undefined,
  });
});

const baseInvoiceRow = {
  id: 'inv-1', brand: 'mentolder', number: 'R-2026-0001', status: 'open',
  net_amount: '100.00', tax_amount: '0.00', gross_amount: '100.00',
  paid_amount: '0', tax_mode: 'kleinunternehmer',
  currency: 'EUR', currency_rate: null,
};

describe('invoice-payments.recordPayment — validation (no DB)', () => {
  it('rejects amount = 0', async () => {
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 0, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/non-zero/);
    expect(initBillingTables).not.toHaveBeenCalled();
  });

  it('rejects a negative amount without notes', async () => {
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: -10, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/requires notes/);
    expect(initBillingTables).not.toHaveBeenCalled();
  });
});

describe('invoice-payments.recordPayment — transactional error paths', () => {
  it('rolls back and throws when the invoice does not exist', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE -> none found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    await expect(
      recordPayment({ invoiceId: 'missing', paidAt: '2026-02-01', amount: 40, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/invoice not found/);
    expect(clientQ).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rolls back and throws on draft invoice', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 40, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/status=draft/);
  });

  it('rolls back and throws on cancelled invoice', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, status: 'cancelled' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 40, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/status=cancelled/);
  });

  it('rolls back and throws when payment exceeds outstanding', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, paid_amount: '80' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 30, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/exceeds outstanding/);
  });

  it('rolls back and throws when a correction would drive paid_amount negative', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, paid_amount: '10' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      recordPayment({
        invoiceId: 'inv-1', paidAt: '2026-02-01', amount: -20,
        method: 'bank', recordedBy: 'admin', notes: 'Rückbuchung',
      }),
    ).rejects.toThrow(/negative/);
  });

  it('rolls back and rethrows on an unexpected error mid-transaction', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow }] })
      .mockRejectedValueOnce(new Error('insert failed')) // INSERT payment fails
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK (in catch)
    await expect(
      recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 40, method: 'bank', recordedBy: 'admin' }),
    ).rejects.toThrow(/insert failed/);
    expect(clientQ).toHaveBeenCalledWith('ROLLBACK');
  });
});

function mockHappyPath(payRow: Record<string, unknown>) {
  clientQ
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow }] }) // SELECT FOR UPDATE
    .mockResolvedValueOnce({ rows: [payRow] }) // INSERT ... RETURNING *
    .mockResolvedValueOnce({ rows: [] }) // UPDATE billing_invoices
    .mockResolvedValueOnce({ rows: [] }); // COMMIT
}

describe('invoice-payments.recordPayment — happy paths', () => {
  it('records a partial payment: status=partially_paid, EÜR booking emitted', async () => {
    mockHappyPath({
      id: 1, invoice_id: 'inv-1', brand: 'mentolder',
      paid_at: new Date('2026-02-01T00:00:00Z'), amount: '40',
      method: 'bank', reference: 'STMT-1', recorded_by: 'admin', notes: null,
    });
    const pay = await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 40,
      method: 'bank', recordedBy: 'admin', reference: 'STMT-1',
    });
    expect(pay.amount).toBe(40);
    expect(pay.paidAt).toBe('2026-02-01');
    expect(pay.reference).toBe('STMT-1');
    expect(pay.notes).toBeUndefined();

    const updateCall = clientQ.mock.calls.find((c) => String(c[0]).includes('UPDATE billing_invoices'));
    expect(updateCall![1]).toEqual(['inv-1', 40, 'partially_paid', null]);

    expect(addBooking).toHaveBeenCalledTimes(1);
    expect(addBooking).toHaveBeenCalledWith(expect.objectContaining({
      category: 'zahlungseingang',
      netAmount: 40,
      vatAmount: 0,
    }));
  });

  it('flips to paid when cumulative payment reaches gross amount', async () => {
    mockHappyPath({
      id: 2, invoice_id: 'inv-1', brand: 'mentolder',
      paid_at: new Date('2026-02-10T00:00:00Z'), amount: '100',
      method: 'bank', reference: null, recorded_by: 'admin', notes: null,
    });
    await recordPayment({ invoiceId: 'inv-1', paidAt: '2026-02-10', amount: 100, method: 'bank', recordedBy: 'admin' });

    const updateCall = clientQ.mock.calls.find((c) => String(c[0]).includes('UPDATE billing_invoices'));
    expect(updateCall![1][2]).toBe('paid');
    expect(updateCall![1][3]).toEqual(new Date('2026-02-10'));
  });

  it('a negative correction uses category zahlungseingang_korrektur', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, paid_amount: '30' }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{
        id: 3, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-02-05T00:00:00Z'), amount: '-30',
        method: 'bank', reference: null, recorded_by: 'admin', notes: 'Rückbuchung',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-02-05', amount: -30,
      method: 'bank', recordedBy: 'admin', notes: 'Rückbuchung',
    });
    expect(addBooking).toHaveBeenCalledWith(expect.objectContaining({
      category: 'zahlungseingang_korrektur',
    }));
  });

  it('status reverts to open when a correction brings cumulative payment exactly to zero', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...baseInvoiceRow, paid_amount: '40' }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{
        id: 4, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-02-05T00:00:00Z'), amount: '-40',
        method: 'bank', reference: null, recorded_by: 'admin', notes: 'Storno',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-02-05', amount: -40,
      method: 'bank', recordedBy: 'admin', notes: 'Storno',
    });
    const updateCall = clientQ.mock.calls.find((c) => String(c[0]).includes('UPDATE billing_invoices'));
    expect(updateCall![1]).toEqual(['inv-1', 0, 'open', null]);
  });

  it('does not swallow the transaction when EÜR booking fails (best-effort, logs error)', async () => {
    mockHappyPath({
      id: 5, invoice_id: 'inv-1', brand: 'mentolder',
      paid_at: new Date('2026-02-01T00:00:00Z'), amount: '40',
      method: 'bank', reference: null, recorded_by: 'admin', notes: null,
    });
    addBooking.mockRejectedValueOnce(new Error('booking down'));
    const pay = await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-02-01', amount: 40, method: 'bank', recordedBy: 'admin',
    });
    expect(pay.id).toBe(5);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('EÜR booking failed'),
    );
  });
});

describe('invoice-payments.recordPayment — Kursdifferenz (foreign currency)', () => {
  const usdInvoiceRow = {
    ...baseInvoiceRow, currency: 'USD', currency_rate: '0.92',
    net_amount: '1000', tax_amount: '0', gross_amount: '1000', paid_amount: '0',
  };

  it('books a Kursdifferenzgewinn when the payment rate is more favourable', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usdInvoiceRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 6, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-05-15T00:00:00Z'), amount: '1000',
        method: 'bank', reference: null, recorded_by: 'admin', notes: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-05-15', amount: 1000,
      method: 'bank', recordedBy: 'admin', paymentCurrencyRate: 0.95,
    });

    expect(addBooking).toHaveBeenCalledTimes(2);
    const kdCall = addBooking.mock.calls.find((c) => String(c[0].category).startsWith('kursdifferenz'));
    expect(kdCall![0].category).toBe('kursdifferenz_gewinn');
    expect(kdCall![0].type).toBe('income');
    expect(kdCall![0].netAmount).toBeCloseTo(30, 2);
  });

  it('books a Kursdifferenzverlust when the payment rate is less favourable', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usdInvoiceRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 7, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-05-15T00:00:00Z'), amount: '1000',
        method: 'bank', reference: null, recorded_by: 'admin', notes: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-05-15', amount: 1000,
      method: 'bank', recordedBy: 'admin', paymentCurrencyRate: 0.90,
    });

    const kdCall = addBooking.mock.calls.find((c) => String(c[0].category).startsWith('kursdifferenz'));
    expect(kdCall![0].category).toBe('kursdifferenz_verlust');
    expect(kdCall![0].type).toBe('expense');
    expect(kdCall![0].netAmount).toBeCloseTo(20, 2);
  });

  it('skips Kursdifferenz booking when the rate difference is negligible', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usdInvoiceRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 8, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-05-15T00:00:00Z'), amount: '1000',
        method: 'bank', reference: null, recorded_by: 'admin', notes: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-05-15', amount: 1000,
      method: 'bank', recordedBy: 'admin', paymentCurrencyRate: 0.920001,
    });

    expect(addBooking).toHaveBeenCalledTimes(1); // only the main EÜR booking, no Kursdifferenz
  });

  it('skips Kursdifferenz entirely when paymentCurrencyRate is not provided', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usdInvoiceRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 9, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-05-15T00:00:00Z'), amount: '1000',
        method: 'bank', reference: null, recorded_by: 'admin', notes: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-05-15', amount: 1000, method: 'bank', recordedBy: 'admin',
    });
    expect(addBooking).toHaveBeenCalledTimes(1);
  });

  it('logs but does not throw when the Kursdifferenz booking itself fails', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usdInvoiceRow] })
      .mockResolvedValueOnce({ rows: [{
        id: 10, invoice_id: 'inv-1', brand: 'mentolder',
        paid_at: new Date('2026-05-15T00:00:00Z'), amount: '1000',
        method: 'bank', reference: null, recorded_by: 'admin', notes: null,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    addBooking
      .mockResolvedValueOnce(undefined) // main EÜR booking succeeds
      .mockRejectedValueOnce(new Error('kd booking down')); // Kursdifferenz booking fails

    const pay = await recordPayment({
      invoiceId: 'inv-1', paidAt: '2026-05-15', amount: 1000,
      method: 'bank', recordedBy: 'admin', paymentCurrencyRate: 0.95,
    });
    expect(pay.id).toBe(10);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('Kursdifferenz'),
    );
  });
});

describe('invoice-payments.listPayments', () => {
  it('maps rows to InvoicePayment, defaulting reference/notes to undefined', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1, invoice_id: 'inv-1', brand: 'mentolder',
          paid_at: new Date('2026-02-01T00:00:00Z'), amount: '40',
          method: 'bank', reference: null, recorded_by: 'admin', notes: null,
        },
        {
          id: 2, invoice_id: 'inv-1', brand: 'mentolder',
          paid_at: new Date('2026-02-10T00:00:00Z'), amount: '60',
          method: 'cash', reference: 'REF-2', recorded_by: 'admin', notes: 'Bar bezahlt',
        },
      ],
    });
    const list = await listPayments('inv-1');
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      id: 1, invoiceId: 'inv-1', brand: 'mentolder', paidAt: '2026-02-01',
      amount: 40, method: 'bank', reference: undefined, recordedBy: 'admin', notes: undefined,
    });
    expect(list[1].reference).toBe('REF-2');
    expect(list[1].notes).toBe('Bar bezahlt');
    expect(initBillingTables).toHaveBeenCalled();
  });

  it('returns an empty array when there are no payments', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const list = await listPayments('inv-none');
    expect(list).toEqual([]);
  });
});
