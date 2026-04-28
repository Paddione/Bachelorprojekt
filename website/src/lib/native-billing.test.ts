import { it, expect, beforeAll } from 'vitest';
import { initBillingTables, createCustomer, getCustomerByEmail } from './native-billing';
import { createInvoice, finalizeInvoice, markInvoicePaid } from './native-billing';
import { getBillingAuditLog } from './billing-audit';
import { verifyInvoiceIntegrity } from './invoice-hash';
import { pool } from './website-db';

beforeAll(async () => { await initBillingTables(); });

it('creates and retrieves a customer', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Max Mustermann', email: 'max@test.de' });
  expect(c.id).toBeTruthy();
  const found = await getCustomerByEmail('test', 'max@test.de');
  expect(found?.name).toBe('Max Mustermann');
});

it('finalize stores hash, persists PDF, writes audit row (no EÜR booking yet)', async () => {
  const customer = await createCustomer({
    brand: 'test', name: 'Erika M', email: `erika-${Date.now()}@test.de`,
  });
  const inv = await createInvoice({
    brand: 'test', customerId: customer.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching 1h', quantity: 1, unitPrice: 60 }],
  });
  expect(inv.number).toMatch(/^RE-\d{4}-\d{4}$/);
  expect(inv.status).toBe('draft');

  const fakePdf = Buffer.from('%PDF-1.4 stub');
  const finalized = await finalizeInvoice(inv.id, {
    actor: { userId: 'admin1', email: 'admin@t.de' },
    pdfBlob: fakePdf,
    pdfMime: 'application/pdf',
  });
  expect(finalized).not.toBeNull();
  expect(finalized!.status).toBe('open');
  expect(finalized!.locked).toBe(true);

  const integrity = await verifyInvoiceIntegrity(inv.id);
  expect(integrity!.ok).toBe(true);
  expect(integrity!.storedHash).toMatch(/^[0-9a-f]{64}$/);

  const stored = await pool.query(
    `SELECT pdf_size_bytes, pdf_mime FROM billing_invoices WHERE id=$1`, [inv.id]
  );
  expect(Number(stored.rows[0].pdf_size_bytes)).toBe(fakePdf.length);
  expect(stored.rows[0].pdf_mime).toBe('application/pdf');

  const audit = await getBillingAuditLog(inv.id);
  const fin = audit.find(e => e.action === 'finalize');
  expect(fin).toBeTruthy();
  expect(fin!.actorEmail).toBe('admin@t.de');
  expect(fin!.fromStatus).toBe('draft');
  expect(fin!.toStatus).toBe('open');

  const eurAfterFinalize = await pool.query(
    `SELECT COUNT(*)::int AS n FROM eur_bookings WHERE invoice_id=$1`, [inv.id],
  );
  expect(eurAfterFinalize.rows[0].n).toBe(0);  // PR-A: bookings emit on payment, not finalize
});

import { recordPayment, listPayments } from './invoice-payments';

it('markInvoicePaid records a single full-gross payment', async () => {
  const c = await createCustomer({ brand: 'test', name: 'F', email: `f-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-01-15', dueDays: 14, taxMode: 'kleinunternehmer',
    lines: [{ description: 'Z', quantity: 1, unitPrice: 50 }],
  });
  await finalizeInvoice(inv.id, {
    actor: { userId: 'a', email: 'a@t.de' },
    pdfBlob: Buffer.from('%PDF'), pdfMime: 'application/pdf',
  });
  const paid = await markInvoicePaid(inv.id, { paidAt: '2026-02-01', paidAmount: 50 },
    { userId: 'a', email: 'a@t.de' });
  expect(paid!.status).toBe('paid');

  const list = await listPayments(inv.id);
  expect(list).toHaveLength(1);
  expect(list[0].amount).toBe(50);
  expect(list[0].method).toBe('legacy');
});

it('markInvoicePaid records audit row', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Pay', email: `pay-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
  });
  await finalizeInvoice(inv.id, { actor: { email: 'a@t.de' } });
  const paid = await markInvoicePaid(
    inv.id, { paidAt: '2025-09-15', paidAmount: 10 }, { email: 'a@t.de' }
  );
  expect(paid!.status).toBe('paid');
  const audit = await getBillingAuditLog(inv.id);
  expect(audit.find(e => e.action === 'mark_paid')).toBeTruthy();
});

it('rejects mutation of locked invoice line items', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Lock', email: `lock-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'L', quantity: 1, unitPrice: 10 }],
  });
  await finalizeInvoice(inv.id, { actor: { email: 'a@t.de' } });
  await expect(
    pool.query(`UPDATE billing_invoice_line_items SET unit_price=99 WHERE invoice_id=$1`, [inv.id])
  ).rejects.toThrow(/GoBD/);
  await expect(
    pool.query(`UPDATE billing_invoices SET net_amount=999 WHERE id=$1`, [inv.id])
  ).rejects.toThrow(/GoBD/);
  await expect(
    pool.query(`DELETE FROM billing_invoices WHERE id=$1`, [inv.id])
  ).rejects.toThrow(/GoBD/);
});

it('billing-audit returns events newest-first', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Aud', email: `aud-${Date.now()}@t.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2025-09-01', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'A', quantity: 1, unitPrice: 5 }],
  });
  await finalizeInvoice(inv.id, { actor: { email: 'a@t.de' } });
  await markInvoicePaid(inv.id, { paidAt: '2025-09-10', paidAmount: 5 }, { email: 'a@t.de' });
  const log = await getBillingAuditLog(inv.id);
  expect(log[0].action).toBe('mark_paid');
  expect(log[1].action).toBe('finalize');
});

it('billing_invoices has currency, supply_type, EUR amount columns', async () => {
  await initBillingTables();
  const r = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='billing_invoices'
    AND column_name IN ('currency','currency_rate','net_amount_eur','gross_amount_eur','supply_type')
  `);
  const cols = r.rows.map((x: { column_name: string }) => x.column_name).sort();
  expect(cols).toEqual(['currency','currency_rate','gross_amount_eur','net_amount_eur','supply_type'].sort());
});

it('billing_nachweis table exists', async () => {
  await initBillingTables();
  const r = await pool.query(`SELECT to_regclass('billing_nachweis')`);
  expect(r.rows[0].to_regclass).toBe('billing_nachweis');
});

it('vat_id_validations table exists', async () => {
  await initBillingTables();
  const r = await pool.query(`SELECT to_regclass('vat_id_validations')`);
  expect(r.rows[0].to_regclass).toBe('vat_id_validations');
});

import { vi, afterEach } from 'vitest';

afterEach(() => vi.restoreAllMocks());

it('createInvoice with USD stores currency_rate and eur amounts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => `<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-04-28"><Cube currency="USD" rate="1.1398"/></Cube></Cube></gesmes:Envelope>`,
  }));
  const c = await createCustomer({ brand: 'test', name: 'US Corp', email: `uscorp-${Date.now()}@test.com` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 19,
    currency: 'USD',
    lines: [{ description: 'Service', quantity: 1, unitPrice: 1000 }],
  });
  expect(inv.currency).toBe('USD');
  expect(inv.currencyRate).toBeCloseTo(1 / 1.1398, 4);
  // net = 1000 USD, netAmountEur ≈ 877.35 EUR
  expect(inv.netAmountEur).toBeCloseTo(1000 / 1.1398, 1);
  expect(inv.grossAmountEur).toBeCloseTo(1190 / 1.1398, 1);
});

it('createInvoice with EUR sets currencyRate null and eur = net', async () => {
  const c = await createCustomer({ brand: 'test', name: 'Local GmbH', email: `local-${Date.now()}@test.de` });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 14,
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching', quantity: 1, unitPrice: 120 }],
  });
  expect(inv.currency).toBe('EUR');
  expect(inv.currencyRate).toBeNull();
  expect(inv.netAmountEur).toBe(120);
});
