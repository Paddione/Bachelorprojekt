import { it, expect, beforeEach, describe, vi, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────
// Mocked-pool tests (T-VITEST-COVERAGE): run without a real Postgres.
// Split out of native-billing.test.ts (S1 file-size CI gate, 600-line limit)
// alongside native-billing-mocked-invoices.test.ts. Together with
// native-billing.test.ts's `native-billing (live DB)` block (gated by a live
// DB and skipped in DB-less sandboxes) these files mock `./website-db` (and
// downstream modules that reach for a live DB) so native-billing.ts's own
// branching logic gets exercised in every environment.
//
// This file covers: createCustomer / mapCustomer, setBillingCustomerLeitwegId,
// getCustomerByEmail / getCustomerById, createInvoice, getInvoice.
//
// Each test resets the module registry and dynamically re-imports
// './native-billing' so the mocked dependencies apply freshly per test
// without leaking state, and without disturbing the real, statically
// imported module used by the DB-backed tests in native-billing.test.ts.
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
});
