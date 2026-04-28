import { it, expect, beforeAll, vi, afterEach } from 'vitest';
import { initBillingTables, createCustomer, createInvoice, finalizeInvoice } from './native-billing';
import { recordPayment, listPayments } from './invoice-payments';
import { pool } from './website-db';

beforeAll(async () => { await initBillingTables(); });

async function setupOpenInvoice(gross: number) {
  const c = await createCustomer({
    brand: 'test', name: 'Erika', email: `e-${Date.now()}-${Math.random()}@t.de`,
  });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-01-15', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'X', quantity: 1, unitPrice: gross }],
  });
  const fin = await finalizeInvoice(inv.id, {
    actor: { userId: 'admin', email: 'a@t.de' },
    pdfBlob: Buffer.from('%PDF-stub'),
    pdfMime: 'application/pdf',
  });
  return fin!;
}

it('records partial payment, sets status=partially_paid, paid_amount = sum', async () => {
  const inv = await setupOpenInvoice(100);
  const pay = await recordPayment({
    invoiceId: inv.id, paidAt: '2026-02-01', amount: 40,
    method: 'bank', recordedBy: 'admin', reference: 'STMT-1',
  });
  expect(pay.amount).toBe(40);

  const after = await pool.query(
    `SELECT status, paid_amount FROM billing_invoices WHERE id=$1`, [inv.id],
  );
  expect(after.rows[0].status).toBe('partially_paid');
  expect(Number(after.rows[0].paid_amount)).toBe(40);

  const list = await listPayments(inv.id);
  expect(list).toHaveLength(1);
});

it('flips to paid when cumulative payments reach gross_amount', async () => {
  const inv = await setupOpenInvoice(100);
  await recordPayment({ invoiceId: inv.id, paidAt: '2026-02-01', amount: 30, method: 'bank', recordedBy: 'admin' });
  await recordPayment({ invoiceId: inv.id, paidAt: '2026-02-10', amount: 70, method: 'bank', recordedBy: 'admin' });

  const r = await pool.query(`SELECT status, paid_amount, paid_at FROM billing_invoices WHERE id=$1`, [inv.id]);
  expect(r.rows[0].status).toBe('paid');
  expect(Number(r.rows[0].paid_amount)).toBe(100);
  expect(r.rows[0].paid_at).toBeTruthy();
});

it('rejects payment that overshoots outstanding', async () => {
  const inv = await setupOpenInvoice(100);
  await recordPayment({ invoiceId: inv.id, paidAt: '2026-02-01', amount: 80, method: 'bank', recordedBy: 'admin' });
  await expect(
    recordPayment({ invoiceId: inv.id, paidAt: '2026-02-02', amount: 50, method: 'bank', recordedBy: 'admin' }),
  ).rejects.toThrow(/overshoot|exceeds outstanding/i);
});

it('correction (negative payment) reverts status from paid to partially_paid', async () => {
  const inv = await setupOpenInvoice(100);
  await recordPayment({ invoiceId: inv.id, paidAt: '2026-02-01', amount: 100, method: 'bank', recordedBy: 'admin' });
  await recordPayment({
    invoiceId: inv.id, paidAt: '2026-02-05', amount: -30,
    method: 'bank', recordedBy: 'admin', notes: 'Rückbuchung Bank',
  });
  const r = await pool.query(`SELECT status, paid_amount FROM billing_invoices WHERE id=$1`, [inv.id]);
  expect(r.rows[0].status).toBe('partially_paid');
  expect(Number(r.rows[0].paid_amount)).toBe(70);
});

it('emits proportional EÜR booking on payment', async () => {
  // gross = 119 (100 net + 19 % VAT)
  const c = await createCustomer({ brand: 'test', name: 'V', email: `v-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-01-15', dueDays: 14,
    taxMode: 'regelbesteuerung', taxRate: 19,
    lines: [{ description: 'Y', quantity: 1, unitPrice: 100 }],
  });
  await finalizeInvoice(inv.id, {
    actor: { userId: 'a', email: 'a@t.de' },
    pdfBlob: Buffer.from('%PDF'), pdfMime: 'application/pdf',
  });
  await recordPayment({
    invoiceId: inv.id, paidAt: '2026-02-01', amount: 59.50, method: 'bank', recordedBy: 'admin',
  });
  const e = await pool.query(
    `SELECT net_amount, vat_amount FROM eur_bookings WHERE invoice_id=$1 ORDER BY id`,
    [inv.id],
  );
  expect(e.rows).toHaveLength(1);
  expect(Number(e.rows[0].net_amount)).toBeCloseTo(50, 2);
  expect(Number(e.rows[0].vat_amount)).toBeCloseTo(9.50, 2);
});

afterEach(() => vi.restoreAllMocks());

it('records Kursdifferenz booking when paymentCurrencyRate differs from invoice rate', async () => {
  // Mock ECB for invoice creation at 1 USD = 0.92 EUR
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => `<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-04-28"><Cube currency="USD" rate="1.0870"/></Cube></Cube></gesmes:Envelope>`,
  }));
  const c = await createCustomer({ brand: 'test', name: 'USD Corp', email: `usdcorp-${Date.now()}@test.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'kleinunternehmer', currency: 'USD',
    lines: [{ description: 'License', quantity: 1, unitPrice: 1000 }],
  });
  // invoice rate: 1/1.087 ≈ 0.92 EUR/USD
  await finalizeInvoice(inv.id, { actor: { userId: 'u1', email: 'u@t.de' } });

  // Payment at a different rate: 1 USD = 0.95 EUR → Kursdifferenzgewinn
  const payment = await recordPayment({
    invoiceId: inv.id, paidAt: '2026-05-15', amount: 1000,
    method: 'bank', recordedBy: 'admin',
    paymentCurrencyRate: 0.95,
  });
  expect(payment.id).toBeGreaterThan(0);

  // A Kursdifferenz EUR booking should exist
  const kdBookings = await pool.query(
    `SELECT category, net_amount, skr_konto FROM eur_bookings WHERE invoice_id=$1 AND category LIKE 'kursdifferenz%'`,
    [inv.id],
  );
  expect(kdBookings.rows).toHaveLength(1);
  // 1000 USD * (0.95 - 0.92) = +30 EUR gain
  expect(Number(kdBookings.rows[0].net_amount)).toBeCloseTo(30, 0);
  expect(kdBookings.rows[0].category).toBe('kursdifferenz_gewinn');
  expect(kdBookings.rows[0].skr_konto).toBe('2668');
});
