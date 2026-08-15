import { it, expect, beforeEach, describe, vi, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────
// Mocked-pool tests (T-VITEST-COVERAGE): run without a real Postgres.
// Split out of native-billing.test.ts (S1 file-size CI gate, 600-line limit)
// alongside native-billing-mocked-customers.test.ts. Together with
// native-billing.test.ts's `native-billing (live DB)` block (gated by a live
// DB and skipped in DB-less sandboxes) these files mock `./website-db` (and
// downstream modules that reach for a live DB) so native-billing.ts's own
// branching logic gets exercised in every environment.
//
// This file covers: finalizeInvoice (incl. e-invoice generation via
// opts.invoiceInput), markInvoicePaid, getInvoiceForEInvoice.
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
