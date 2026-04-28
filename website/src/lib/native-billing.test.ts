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

it('finalize stores hash, persists PDF, writes audit row, populates EÜR fields', async () => {
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

  const eur = await pool.query(
    `SELECT belegnummer, skr_konto FROM eur_bookings WHERE invoice_id=$1`, [inv.id]
  );
  expect(eur.rows[0].belegnummer).toBe(inv.number);
  expect(eur.rows[0].skr_konto).toBe('8195');
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
