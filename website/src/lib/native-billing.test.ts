import { it, expect, beforeAll, beforeEach, describe, vi, afterEach } from 'vitest';
import { initBillingTables, createCustomer, getCustomerByEmail } from './native-billing';
import { createInvoice, finalizeInvoice, markInvoicePaid } from './native-billing';
import { getBillingAuditLog } from './billing-audit';
import { verifyInvoiceIntegrity } from './invoice-hash';
import { pool } from './website-db';
import { listPayments } from './invoice-payments';

describe('native-billing (live DB)', () => {
let dbOk = false;
beforeAll(async () => {
  try {
    await Promise.race([
      initBillingTables(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('db timeout')), 3000)),
    ]);
    dbOk = true;
  } catch { /* DB not available in this environment */ }
}, 5000);
beforeEach((ctx) => { if (!dbOk) ctx.skip(); });

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

describe.skipIf(!process.env.DATABASE_URL)('leitweg_id schema', () => {
  it('hat leitweg_id Spalte (max 46 chars, B2G optional)', async () => {
    await initBillingTables();
    const r = await pool.query(
      `SELECT column_name, character_maximum_length
         FROM information_schema.columns
        WHERE table_name='billing_customers' AND column_name='leitweg_id'`
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].character_maximum_length).toBe(46);
  });
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

it('createInvoice with AE line requires buyer vatNumber on customer', async () => {
  const c = await createCustomer({
    brand: 'test', name: 'EU Corp', email: `eucorp-${Date.now()}@test.eu`,
    // NO vatNumber
  });
  await expect(createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxCategory: 'AE' }],
  })).rejects.toThrow('Reverse charge (AE) requires a VAT ID on the customer');
});

it('createInvoice with AE line sets supplyType eu_b2b_services automatically', async () => {
  const c = await createCustomer({
    brand: 'test', name: 'EU Corp 2', email: `eucorp2-${Date.now()}@test.eu`,
    vatNumber: 'FR12345678901',
  });
  const inv = await createInvoice({
    brand: 'test', customerId: c.id,
    issueDate: '2026-04-28', dueDays: 30,
    taxMode: 'regelbesteuerung', taxRate: 0,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxCategory: 'AE' }],
  });
  expect(inv.supplyType).toBe('eu_b2b_services');
});
});

// ────────────────────────────────────────────────────────────────────────
// Mocked-pool tests (T-VITEST-COVERAGE): run without a real Postgres.
// The tests above are gated by `dbOk` and skip entirely in sandboxes with
// no live DB (see beforeAll above). These tests instead mock `./website-db`
// (and downstream modules that reach for a live DB) so native-billing.ts's
// own branching logic gets exercised in every environment.
//
// Each test resets the module registry and dynamically re-imports
// './native-billing' so the mocked dependencies apply freshly per test
// without leaking state, and without disturbing the real, statically
// imported module used by the DB-backed tests above.
// ────────────────────────────────────────────────────────────────────────

describe('native-billing (mocked pool)', () => {
  const query = vi.fn();
  let connectClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let mod: typeof import('./native-billing');

  beforeEach(async () => {
    vi.resetModules();
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    connectClient = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };

    vi.doMock('./website-db', () => ({
      pool: {
        query: (...a: unknown[]) => query(...a),
        connect: vi.fn().mockResolvedValue(connectClient),
      },
      initBillingTables: vi.fn().mockResolvedValue(undefined),
      getNextInvoiceNumber: vi.fn().mockResolvedValue('RE-2026-0001'),
    }));
    vi.doMock('./invoice-payments', () => ({
      recordPayment: vi.fn().mockResolvedValue({ id: 1 }),
    }));
    vi.doMock('./tax-monitor', () => ({
      checkAndApplyTaxModeSwitch: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('./ecb-exchange-rates', () => ({
      fetchEcbRates: vi.fn().mockResolvedValue({ USD: 1.1398 }),
      eurPer: vi.fn().mockReturnValue(0.9),
    }));

    mod = await import('./native-billing');
  });

  afterEach(() => {
    vi.doUnmock('./website-db');
    vi.doUnmock('./invoice-payments');
    vi.doUnmock('./tax-monitor');
    vi.doUnmock('./ecb-exchange-rates');
  });

  describe('createCustomer / mapCustomer', () => {
    it('upserts and maps a Date sepaMandateDate to an ISO date string', async () => {
      query.mockResolvedValueOnce({
        rows: [{
          id: 'c1', brand: 'test', name: 'Max', email: 'max@test.de',
          customer_number: 'K-1', company: 'ACME', address_line1: 'Str 1', city: 'Berlin',
          postal_code: '10115', land_iso: 'DE', vat_number: 'DE123456789',
          sepa_iban: 'DE00', sepa_bic: 'ABC', leitweg_id: '04011000-1234512345-06',
          sepa_mandate_ref: 'M1', sepa_mandate_date: new Date('2026-01-05'),
          default_leitweg_id: '991-1',
        }],
      });
      const c = await mod.createCustomer({ brand: 'test', name: 'Max', email: 'max@test.de' });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), expect.any(Array));
      expect(c.customerNumber).toBe('K-1');
      expect(c.sepaMandateDate).toBe('2026-01-05');
    });

    it('maps a row with a string sepaMandateDate and nullish optional fields', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 'c2', brand: 'test', name: 'A', email: 'a@t.de', land_iso: null, sepa_mandate_date: '2026-02-01' }],
      });
      const c = await mod.createCustomer({ brand: 'test', name: 'A', email: 'a@t.de' });
      expect(c.landIso).toBe('DE');
      expect(c.sepaMandateDate).toBe('2026-02-01');
      expect(c.company).toBeUndefined();
      expect(c.sepaMandateRef).toBeUndefined();
    });

    it('maps a row with no sepaMandateDate at all to undefined', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 'c3', brand: 'test', name: 'B', email: 'b@t.de', land_iso: 'DE', sepa_mandate_date: null }],
      });
      const c = await mod.createCustomer({ brand: 'test', name: 'B', email: 'b@t.de' });
      expect(c.sepaMandateDate).toBeUndefined();
    });
  });

  describe('setBillingCustomerLeitwegId', () => {
    it('clears leitweg_id when raw is null', async () => {
      const r = await mod.setBillingCustomerLeitwegId('c1', null);
      expect(r).toEqual({ ok: true, value: null });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET leitweg_id = NULL'), ['c1']);
    });

    it('clears leitweg_id when raw is an empty string', async () => {
      const r = await mod.setBillingCustomerLeitwegId('c1', '');
      expect(r).toEqual({ ok: true, value: null });
    });

    it('rejects an invalid Leitweg-ID format', async () => {
      const r = await mod.setBillingCustomerLeitwegId('c1', 'not-a-valid-leitweg!!');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBeTruthy();
    });

    it('returns not-found when the update matches zero rows', async () => {
      query.mockResolvedValueOnce({ rowCount: 0 });
      const r = await mod.setBillingCustomerLeitwegId('c1', '04011000-1234512345-06');
      expect(r).toEqual({ ok: false, reason: 'Kunde nicht gefunden' });
    });

    it('updates successfully for a valid Leitweg-ID', async () => {
      query.mockResolvedValueOnce({ rowCount: 1 });
      const r = await mod.setBillingCustomerLeitwegId('c1', '04011000-1234512345-06');
      expect(r).toEqual({ ok: true, value: '04011000-1234512345-06' });
    });
  });

  describe('getCustomerByEmail / getCustomerById', () => {
    it('getCustomerByEmail returns null when not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await mod.getCustomerByEmail('test', 'x@x.de')).toBeNull();
    });

    it('getCustomerById returns the mapped customer when found', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'c9', brand: 'test', name: 'N', email: 'n@t.de', land_iso: 'DE' }] });
      const c = await mod.getCustomerById('test', 'c9');
      expect(c?.id).toBe('c9');
    });

    it('getCustomerById returns null when not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await mod.getCustomerById('test', 'missing')).toBeNull();
    });
  });

  describe('createInvoice', () => {
    it('throws when an AE line is present but the customer has no vatNumber', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'c1', brand: 'test', name: 'N', email: 'n@t.de', land_iso: 'DE' }] });
      await expect(mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'regelbesteuerung', taxRate: 0,
        lines: [{ description: 'x', quantity: 1, unitPrice: 10, taxCategory: 'AE' }],
      })).rejects.toThrow('Reverse charge (AE) requires a VAT ID on the customer');
    });

    it('auto-sets supplyType to eu_b2b_services for AE lines when the customer has a vatNumber', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 'c1', brand: 'test', name: 'N', email: 'n@t.de', land_iso: 'DE', vat_number: 'FR123456789' }],
      });
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO billing_invoices')) {
          return {
            rows: [{
              id: 'inv1', brand: 'test', number: 'RE-2026-0001', status: 'draft', customer_id: 'c1',
              issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
              tax_mode: 'regelbesteuerung', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
              supply_type: 'eu_b2b_services', kind: 'regular',
            }],
          };
        }
        return { rows: [] };
      });
      const inv = await mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'regelbesteuerung', taxRate: 0,
        lines: [{ description: 'x', quantity: 1, unitPrice: 10, taxCategory: 'AE' }],
      });
      expect(inv.supplyType).toBe('eu_b2b_services');
    });

    it('does not override an explicitly provided supplyType for AE lines', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 'c1', brand: 'test', name: 'N', email: 'n@t.de', land_iso: 'DE', vat_number: 'FR123456789' }],
      });
      connectClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO billing_invoices')) {
          return {
            rows: [{
              id: 'inv1b', brand: 'test', number: 'RE-2026-0002', status: 'draft', customer_id: 'c1',
              issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
              tax_mode: 'regelbesteuerung', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
              supply_type: params?.[19], kind: 'regular',
            }],
          };
        }
        return { rows: [] };
      });
      const inv = await mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'regelbesteuerung', taxRate: 0, supplyType: 'export',
        lines: [{ description: 'x', quantity: 1, unitPrice: 10, taxCategory: 'AE' }],
      });
      expect(inv.supplyType).toBe('export');
    });

    it('rejects an invalid currency code', async () => {
      await expect(mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'kleinunternehmer', currency: 'US1',
        lines: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      })).rejects.toThrow('Invalid currency code');
    });

    it('resolves currencyRate via ecb-exchange-rates for non-EUR currencies', async () => {
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO billing_invoices')) {
          return {
            rows: [{
              id: 'inv2', brand: 'test', number: 'RE-2026-0003', status: 'draft', customer_id: 'c1',
              issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
              tax_mode: 'kleinunternehmer', net_amount: 100, tax_rate: 0, tax_amount: 0, gross_amount: 100,
              currency: 'USD', currency_rate: 0.9, net_amount_eur: 90, gross_amount_eur: 90, kind: 'regular',
            }],
          };
        }
        return { rows: [] };
      });
      const inv = await mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'kleinunternehmer', currency: 'usd',
        lines: [{ description: 'x', quantity: 1, unitPrice: 100 }],
      });
      expect(inv.currency).toBe('USD');
      expect(inv.currencyRate).toBe(0.9);
    });

    it('leaves currencyRate null and eur amounts equal to net amounts for EUR invoices', async () => {
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO billing_invoices')) {
          return {
            rows: [{
              id: 'inv3', brand: 'test', number: 'RE-2026-0004', status: 'draft', customer_id: 'c1',
              issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
              tax_mode: 'kleinunternehmer', net_amount: 50, tax_rate: 0, tax_amount: 0, gross_amount: 50,
              currency: 'EUR', currency_rate: null, net_amount_eur: 50, gross_amount_eur: 50, kind: 'regular',
            }],
          };
        }
        return { rows: [] };
      });
      const inv = await mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'kleinunternehmer',
        lines: [{ description: 'x', quantity: 1, unitPrice: 50 }],
      });
      expect(inv.currencyRate).toBeNull();
      expect(inv.netAmountEur).toBe(50);
    });

    it('uses the kleinunternehmer 0% tax rate branch', async () => {
      connectClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO billing_invoices')) {
          return {
            rows: [{
              id: 'inv4', brand: 'test', number: 'RE-2026-0005', status: 'draft', customer_id: 'c1',
              issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
              tax_mode: 'kleinunternehmer', net_amount: 100, tax_rate: params?.[9], tax_amount: 0, gross_amount: 100,
              kind: 'regular',
            }],
          };
        }
        return { rows: [] };
      });
      const inv = await mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'kleinunternehmer', taxRate: 19 /* ignored for kleinunternehmer */,
        lines: [{ description: 'x', quantity: 1, unitPrice: 100 }],
      });
      expect(inv.taxRate).toBe(0);
    });

    it('rolls back and releases the client when the INSERT fails', async () => {
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN') return {};
        if (sql.includes('INSERT INTO billing_invoices')) throw new Error('insert failed');
        return {};
      });
      await expect(mod.createInvoice({
        brand: 'test', customerId: 'c1', issueDate: '2026-01-01', dueDays: 14,
        taxMode: 'kleinunternehmer',
        lines: [{ description: 'x', quantity: 1, unitPrice: 5 }],
      })).rejects.toThrow('insert failed');
      expect(connectClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(connectClient.release).toHaveBeenCalled();
    });
  });

  describe('getInvoice', () => {
    it('returns null when not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await mod.getInvoice('nope')).toBeNull();
    });

    it('returns the mapped invoice when found', async () => {
      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv5', brand: 'test', number: 'RE-2026-0006', status: 'open', customer_id: 'c1',
          issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
          tax_mode: 'kleinunternehmer', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
          kind: 'regular',
        }],
      });
      const inv = await mod.getInvoice('inv5');
      expect(inv?.id).toBe('inv5');
    });
  });

  describe('finalizeInvoice', () => {
    it('returns null and rolls back when the invoice is not in draft status', async () => {
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status='draft'")) return { rows: [] };
        return {};
      });
      const r = await mod.finalizeInvoice('inv-not-draft');
      expect(r).toBeNull();
      expect(connectClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('finalizes without invoiceInput or pdfBlob (minimal happy path)', async () => {
      const row = {
        id: 'inv6', brand: 'test', number: 'RE-2026-0007', status: 'open', locked: true, customer_id: 'c1',
        issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
        tax_mode: 'kleinunternehmer', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
        kind: 'regular',
      };
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status='draft'")) return { rows: [row] };
        if (sql.includes('SELECT id, description')) {
          return { rows: [{ id: 1, description: 'x', quantity: 1, unit_price: 10, net_amount: 10, unit: null }] };
        }
        return {};
      });
      const r = await mod.finalizeInvoice('inv6', { actor: { email: 'a@t.de' } });
      expect(r?.status).toBe('open');
      expect(r?.locked).toBe(true);
      // no PDF documents inserted, no billing-archive call — sanity: COMMIT reached
      expect(connectClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('stores hash and PDF document, and archives the PDF, when pdfBlob is provided', async () => {
      vi.doMock('./billing-archive', () => ({
        archiveBillingPdf: vi.fn().mockResolvedValue('/archive/RE-2026-0008.pdf'),
      }));
      const row = {
        id: 'inv7', brand: 'test', number: 'RE-2026-0008', status: 'open', locked: true, customer_id: 'c1',
        issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
        tax_mode: 'kleinunternehmer', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
        kind: 'regular',
      };
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status='draft'")) return { rows: [row] };
        if (sql.includes('SELECT id, description')) {
          return { rows: [{ id: 1, description: 'x', quantity: 1, unit_price: 10, net_amount: 10, unit: null }] };
        }
        return {};
      });
      const modFresh = await import('./native-billing');
      const r = await modFresh.finalizeInvoice('inv7', {
        actor: { email: 'a@t.de' },
        pdfBlob: Buffer.from('%PDF-stub'),
        pdfMime: 'application/pdf',
      });
      expect(r?.status).toBe('open');
      const calls = connectClient.query.mock.calls.map(c => String(c[0]));
      expect(calls.some(sql => sql.includes("VALUES ($1, 'pdf', $2)"))).toBe(true);
      expect(calls.some(sql => sql.includes('UPDATE billing_invoices SET pdf_path'))).toBe(true);
      vi.doUnmock('./billing-archive');
    });

    it('does not update pdf_path when billing-archive returns no path', async () => {
      vi.doMock('./billing-archive', () => ({
        archiveBillingPdf: vi.fn().mockResolvedValue(null),
      }));
      const row = {
        id: 'inv7b', brand: 'test', number: 'RE-2026-0009', status: 'open', locked: true, customer_id: 'c1',
        issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
        tax_mode: 'kleinunternehmer', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
        kind: 'regular',
      };
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status='draft'")) return { rows: [row] };
        if (sql.includes('SELECT id, description')) return { rows: [] };
        return {};
      });
      const modFresh = await import('./native-billing');
      await modFresh.finalizeInvoice('inv7b', { pdfBlob: Buffer.from('x') });
      const calls = connectClient.query.mock.calls.map(c => String(c[0]));
      expect(calls.some(sql => sql.includes('UPDATE billing_invoices SET pdf_path'))).toBe(false);
      vi.doUnmock('./billing-archive');
    });

    it('rolls back and rethrows when a query inside the transaction fails', async () => {
      connectClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status='draft'")) throw new Error('boom');
        return {};
      });
      await expect(mod.finalizeInvoice('inv-boom')).rejects.toThrow('boom');
      expect(connectClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    describe('with opts.invoiceInput (e-invoice generation)', () => {
      const invoiceInput = {
        number: 'RE-2026-0010', issueDate: '2026-01-01', dueDate: '2026-01-15',
        currency: 'EUR', taxMode: 'kleinunternehmer' as const,
        lines: [{ description: 'x', quantity: 1, unit: 'C62', unitPrice: 10, netAmount: 10, taxRate: 0, taxCategory: 'E' as const }],
        netTotal: 10, taxTotal: 0, grossTotal: 10,
        seller: {
          name: 'Seller GmbH', address: 'Str 1', postalCode: '12345', city: 'Berlin', country: 'DE',
          contactEmail: 'seller@t.de', iban: 'DE00000000000000000000',
        },
        buyer: { name: 'Buyer', email: 'buyer@t.de', country: 'DE' },
      };

      const draftRow = {
        id: 'inv8', brand: 'test', number: 'RE-2026-0010', status: 'open', locked: true, customer_id: 'c1',
        issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
        tax_mode: 'kleinunternehmer', net_amount: 10, tax_rate: 0, tax_amount: 0, gross_amount: 10,
        kind: 'regular',
      };

      it('generates factur-x (and skips xrechnung when buyer has no leitwegId)', async () => {
        connectClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes("status='draft'")) return { rows: [draftRow] };
          if (sql.includes('SELECT id, description')) {
            return { rows: [{ id: 1, description: 'x', quantity: 1, unit_price: 10, net_amount: 10, unit: null }] };
          }
          return {};
        });
        const r = await mod.finalizeInvoice('inv8', { invoiceInput });
        expect(r?.id).toBe('inv8');
        const calls = connectClient.query.mock.calls;
        const docInserts = calls.filter(c => String(c[0]).includes('INSERT INTO billing_invoice_documents'));
        const formats = docInserts.map(c => (c[1] as unknown[])[1]);
        expect(formats).toContain('factur-x');
        expect(formats).not.toContain('xrechnung');
      });

      it('generates xrechnung too when buyer.leitwegId is set', async () => {
        connectClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes("status='draft'")) return { rows: [draftRow] };
          if (sql.includes('SELECT id, description')) {
            return { rows: [{ id: 1, description: 'x', quantity: 1, unit_price: 10, net_amount: 10, unit: null }] };
          }
          return {};
        });
        const r = await mod.finalizeInvoice('inv8', {
          invoiceInput: { ...invoiceInput, buyer: { ...invoiceInput.buyer, leitwegId: '04011000-1234512345-06' } },
        });
        expect(r).not.toBeNull();
        const calls = connectClient.query.mock.calls;
        const docInserts = calls.filter(c => String(c[0]).includes('INSERT INTO billing_invoice_documents'));
        const formats = docInserts.map(c => (c[1] as unknown[])[1]);
        expect(formats).toContain('xrechnung');
      });

      it('embeds and validates via the e-invoice sidecar when enabled, and rethrows a friendly message on SidecarUnavailableError', async () => {
        vi.doMock('./pdf-a3-embed', () => ({
          embedFacturX: vi.fn().mockResolvedValue(Buffer.from('pdfa3')),
        }));
        vi.doMock('./einvoice/sidecar-client', () => {
          class SidecarUnavailableError extends Error {
            status: number;
            constructor(status: number, msg: string) { super(msg); this.name = 'SidecarUnavailableError'; this.status = status; }
          }
          return {
            SidecarUnavailableError,
            sidecarBaseUrlFromEnv: vi.fn().mockReturnValue('http://sidecar'),
            createSidecarClient: vi.fn(() => ({
              validate: vi.fn().mockRejectedValue(new SidecarUnavailableError(503, 'down')),
            })),
          };
        });
        const prev = process.env.EINVOICE_SIDECAR_ENABLED;
        process.env.EINVOICE_SIDECAR_ENABLED = 'true';
        connectClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes("status='draft'")) return { rows: [draftRow] };
          return {};
        });
        const modFresh = await import('./native-billing');
        await expect(modFresh.finalizeInvoice('inv8', {
          invoiceInput, pdfBlob: Buffer.from('%PDF'),
        })).rejects.toThrow('E-invoice sidecar unavailable; finalization aborted.');
        expect(connectClient.query).toHaveBeenCalledWith('ROLLBACK');
        process.env.EINVOICE_SIDECAR_ENABLED = prev;
        vi.doUnmock('./pdf-a3-embed');
        vi.doUnmock('./einvoice/sidecar-client');
      });

      it('throws a validation-failed error when the sidecar reports errors', async () => {
        vi.doMock('./pdf-a3-embed', () => ({
          embedFacturX: vi.fn().mockResolvedValue(Buffer.from('pdfa3')),
        }));
        vi.doMock('./einvoice/sidecar-client', () => ({
          SidecarUnavailableError: class SidecarUnavailableError extends Error {},
          sidecarBaseUrlFromEnv: vi.fn().mockReturnValue('http://sidecar'),
          createSidecarClient: vi.fn(() => ({
            validate: vi.fn().mockResolvedValue({ ok: false, errors: ['XML schema violation'], warnings: [], reportXml: '' }),
          })),
        }));
        const prev = process.env.EINVOICE_SIDECAR_ENABLED;
        process.env.EINVOICE_SIDECAR_ENABLED = 'true';
        connectClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes("status='draft'")) return { rows: [draftRow] };
          return {};
        });
        const modFresh = await import('./native-billing');
        await expect(modFresh.finalizeInvoice('inv8', {
          invoiceInput, pdfBlob: Buffer.from('%PDF'),
        })).rejects.toThrow('E-invoice validation failed: XML schema violation');
        process.env.EINVOICE_SIDECAR_ENABLED = prev;
        vi.doUnmock('./pdf-a3-embed');
        vi.doUnmock('./einvoice/sidecar-client');
      });

      it('rethrows a generic validation error from the sidecar unchanged', async () => {
        vi.doMock('./pdf-a3-embed', () => ({
          embedFacturX: vi.fn().mockResolvedValue(Buffer.from('pdfa3')),
        }));
        vi.doMock('./einvoice/sidecar-client', () => ({
          SidecarUnavailableError: class SidecarUnavailableError extends Error {},
          sidecarBaseUrlFromEnv: vi.fn().mockReturnValue('http://sidecar'),
          createSidecarClient: vi.fn(() => ({
            validate: vi.fn().mockRejectedValue(new Error('network exploded')),
          })),
        }));
        const prev = process.env.EINVOICE_SIDECAR_ENABLED;
        process.env.EINVOICE_SIDECAR_ENABLED = 'true';
        connectClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes("status='draft'")) return { rows: [draftRow] };
          return {};
        });
        const modFresh = await import('./native-billing');
        await expect(modFresh.finalizeInvoice('inv8', {
          invoiceInput, pdfBlob: Buffer.from('%PDF'),
        })).rejects.toThrow('network exploded');
        process.env.EINVOICE_SIDECAR_ENABLED = prev;
        vi.doUnmock('./pdf-a3-embed');
        vi.doUnmock('./einvoice/sidecar-client');
      });
    });
  });

  describe('markInvoicePaid', () => {
    it('returns null when the invoice does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await mod.markInvoicePaid('nope', { paidAt: '2026-01-01', paidAmount: 5 })).toBeNull();
    });

    it('returns the invoice unchanged (no new payment recorded) when already paid', async () => {
      query.mockResolvedValueOnce({ rows: [{ status: 'paid' }] });
      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv9', brand: 'test', number: 'RE-2026-0011', status: 'paid', customer_id: 'c1',
          issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
          tax_mode: 'kleinunternehmer', net_amount: 5, tax_rate: 0, tax_amount: 0, gross_amount: 5,
          kind: 'regular',
        }],
      });
      const r = await mod.markInvoicePaid('inv9', { paidAt: '2026-01-01', paidAmount: 5 });
      expect(r?.status).toBe('paid');
    });

    it('returns null when the invoice is neither open nor partially_paid', async () => {
      query.mockResolvedValueOnce({ rows: [{ status: 'draft' }] });
      expect(await mod.markInvoicePaid('inv10', { paidAt: '2026-01-01', paidAmount: 5 })).toBeNull();
    });

    it('records payment and logs the audit event on the happy path (open -> paid)', async () => {
      query.mockResolvedValueOnce({ rows: [{ status: 'open' }] });
      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv11', brand: 'test', number: 'RE-2026-0012', status: 'paid', customer_id: 'c1',
          issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
          tax_mode: 'kleinunternehmer', net_amount: 5, tax_rate: 0, tax_amount: 0, gross_amount: 5,
          kind: 'regular',
        }],
      });
      const r = await mod.markInvoicePaid('inv11', { paidAt: '2026-01-01', paidAmount: 5 }, { userId: 'u1', email: 'a@t.de' });
      expect(r?.status).toBe('paid');
    });
  });

  describe('getInvoiceForEInvoice', () => {
    it('returns null when the invoice is not found', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await mod.getInvoiceForEInvoice('nope')).toBeNull();
    });

    it('populates seller from process.env.SELLER_* and formats dates from Date objects', async () => {
      const prevEnv = { ...process.env };
      process.env.SELLER_NAME = 'Env Seller';
      process.env.SELLER_ADDRESS = 'Envstr 1';
      process.env.SELLER_POSTAL_CODE = '99999';
      process.env.SELLER_CITY = 'Envstadt';
      process.env.SELLER_COUNTRY = 'DE';
      process.env.SELLER_VAT_ID = 'DE999999999';
      process.env.SELLER_TAX_NUMBER = '12/345/67890';
      process.env.SELLER_IBAN = 'DE00111111111111111111';
      process.env.SELLER_BIC = 'ENVBIC';
      process.env.SELLER_EMAIL = 'seller@env.de';
      process.env.SELLER_PHONE = '+49 30 000';

      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv12', number: 'RE-2026-0013', issue_date: new Date('2026-01-01'), due_date: new Date('2026-01-15'),
          gross_amount: 10, net_amount: 10, tax_amount: 0, tax_mode: 'kleinunternehmer', tax_rate: 0,
          payment_reference: 'RG-1',
          c_name: 'Buyer', c_email: 'buyer@t.de', c_addr: 'Buyerstr', c_zip: '11111', c_city: 'Buyerstadt', c_leitweg: null,
        }],
      });
      query.mockResolvedValueOnce({ rows: [{ description: 'x', quantity: 1, unit_price: 10, unit: null }] });

      const input = await mod.getInvoiceForEInvoice('inv12');
      expect(input?.seller.name).toBe('Env Seller');
      expect(input?.seller.iban).toBe('DE00111111111111111111');
      expect(input?.invoice.issueDate).toBe('2026-01-01');
      expect(input?.lines[0].unit).toBe('C62');

      process.env = prevEnv;
    });

    it('toIsoDate coerces a non-Date, non-string value via String()', async () => {
      const prevEnv = { ...process.env };
      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv14', number: 'RE-2026-0015', issue_date: 20260101, due_date: '2026-01-15',
          gross_amount: 10, net_amount: 10, tax_amount: 0, tax_mode: 'kleinunternehmer', tax_rate: 0,
          payment_reference: null,
          c_name: 'Buyer', c_email: 'buyer@t.de', c_addr: null, c_zip: null, c_city: null, c_leitweg: null,
        }],
      });
      query.mockResolvedValueOnce({ rows: [] });

      const input = await mod.getInvoiceForEInvoice('inv14');
      expect(input?.invoice.issueDate).toBe('20260101');

      process.env = prevEnv;
    });

    it('falls back to BRAND_NAME / empty strings when SELLER_* vars are unset', async () => {
      const prevEnv = { ...process.env };
      delete process.env.SELLER_NAME;
      delete process.env.SELLER_ADDRESS;
      delete process.env.SELLER_POSTAL_CODE;
      delete process.env.SELLER_CITY;
      delete process.env.SELLER_COUNTRY;
      delete process.env.SELLER_VAT_ID;
      process.env.BRAND_NAME = 'FallbackBrand';

      query.mockResolvedValueOnce({
        rows: [{
          id: 'inv13', number: 'RE-2026-0014', issue_date: '2026-01-01', due_date: '2026-01-15',
          gross_amount: 10, net_amount: 10, tax_amount: 0, tax_mode: 'kleinunternehmer', tax_rate: 0,
          payment_reference: null,
          c_name: 'Buyer', c_email: 'buyer@t.de', c_addr: null, c_zip: null, c_city: null, c_leitweg: 'X-01',
        }],
      });
      query.mockResolvedValueOnce({ rows: [] });

      const input = await mod.getInvoiceForEInvoice('inv13');
      expect(input?.seller.name).toBe('FallbackBrand');
      expect(input?.seller.country).toBe('DE');
      expect(input?.seller.address).toBe('');
      expect(input?.invoice.issueDate).toBe('2026-01-01');
      expect(input?.customer.leitwegId).toBe('X-01');

      process.env = prevEnv;
    });
  });
});
