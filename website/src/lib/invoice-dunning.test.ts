import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const initBillingTables = vi.fn();
const getSiteSetting = vi.fn();
const getInvoice = vi.fn();
const getCustomerById = vi.fn();
const generateDunningPdf = vi.fn();
const archiveBillingPdf = vi.fn();
const sendEmail = vi.fn();
const logBillingEvent = vi.fn();

vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  initBillingTables: (...a: unknown[]) => initBillingTables(...a),
  getSiteSetting: (...a: unknown[]) => getSiteSetting(...a),
}));
vi.mock('./native-billing', () => ({
  getInvoice: (...a: unknown[]) => getInvoice(...a),
  getCustomerById: (...a: unknown[]) => getCustomerById(...a),
}));
vi.mock('./invoice-pdf', () => ({
  generateDunningPdf: (...a: unknown[]) => generateDunningPdf(...a),
}));
vi.mock('./billing-archive', () => ({
  archiveBillingPdf: (...a: unknown[]) => archiveBillingPdf(...a),
}));
vi.mock('./email', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock('./billing-audit', () => ({
  logBillingEvent: (...a: unknown[]) => logBillingEvent(...a),
}));

import { listPendingDunnings, sendDunning, runDunningDetection } from './invoice-dunning';

beforeEach(() => {
  query.mockReset();
  initBillingTables.mockReset();
  getSiteSetting.mockReset();
  getInvoice.mockReset();
  getCustomerById.mockReset();
  generateDunningPdf.mockReset();
  archiveBillingPdf.mockReset();
  sendEmail.mockReset();
  logBillingEvent.mockReset();
  initBillingTables.mockResolvedValue(undefined);
});

describe('invoice-dunning.listPendingDunnings', () => {
  it('returns mapped rows for the brand', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'd-1', invoice_id: 'inv-1', level: 1,
        outstanding_at_generation: '100.00', fee_amount: '5.00', interest_amount: '1.20',
        pdf_path: 'Billing/m.pdf',
        invoice_number: 'R-1', customer_email: 'a@b.com', customer_name: 'Alice',
      }],
    });
    const out = await listPendingDunnings('mentolder');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: 'd-1', invoiceId: 'inv-1', invoiceNumber: 'R-1', level: 1,
      customerEmail: 'a@b.com', customerName: 'Alice',
      outstanding: 100, feeAmount: 5, interestAmount: 1.2, pdfPath: 'Billing/m.pdf',
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM billing_invoice_dunnings d/);
    expect(sql).toMatch(/d\.brand=\$1 AND d\.sent_at IS NULL/);
    expect(params).toEqual(['mentolder']);
  });
});

describe('invoice-dunning.sendDunning', () => {
  it('returns false when no row is found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await sendDunning('missing', 'admin@example.com')).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends the email and stamps sent_at on success', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'd-1', level: 1, invoice_id: 'inv-1', fee_amount: '5', interest_amount: '1.20', outstanding_at_generation: '100', number: 'R-1', payment_reference: 'R-1', email: 'a@b.com', name: 'Alice' }] })
      .mockResolvedValueOnce({ rows: [] });  // UPDATE
    sendEmail.mockResolvedValueOnce(true);
    expect(await sendDunning('d-1', 'admin@example.com')).toBe(true);
    const [sendArg] = sendEmail.mock.calls[0];
    expect(sendArg.to).toBe('a@b.com');
    expect(sendArg.subject).toBe('Mahnung 1 zu Rechnung R-1');
    expect(sendArg.text).toMatch(/Gesamt: 106,20/);
    const updateSql = query.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/UPDATE billing_invoice_dunnings/);
    expect(updateSql).toMatch(/sent_at=now\(\)/);
    expect(logBillingEvent).toHaveBeenCalledTimes(1);
  });

  it('returns false and does not stamp when sendEmail fails', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'd-1', level: 1, invoice_id: 'inv-1', fee_amount: '5', interest_amount: '1.20', outstanding_at_generation: '100', number: 'R-1', payment_reference: 'R-1', email: 'a@b.com', name: 'Alice' }] });
    sendEmail.mockResolvedValueOnce(false);
    expect(await sendDunning('d-1', 'admin@example.com')).toBe(false);
    expect(logBillingEvent).not.toHaveBeenCalled();
  });
});

describe('invoice-dunning.runDunningDetection (no-op end-to-end)', () => {
  it('reports {generated: 0, skipped: 0} when there are no overdue invoices', async () => {
    query.mockResolvedValueOnce({ rows: [] });  // SELECT candidates
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 0 });
  });

  it('skips a candidate with no outstanding balance', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
      due_date: new Date(Date.now() - 5 * 86_400_000), last_dunning_at: null,
      gross_amount: '100', paid_amount: '100', customer_id: 'cust-1',
    }] });
    getSiteSetting.mockResolvedValue(undefined); // numberSetting falls back to defaults
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 1 });
    expect(getInvoice).not.toHaveBeenCalled();
  });

  it('skips a candidate that is not yet overdue', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
      due_date: new Date(Date.now() + 5 * 86_400_000), last_dunning_at: null,
      gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
    }] });
    getSiteSetting.mockResolvedValue(undefined);
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 1 });
  });

  it('skips a candidate that is not yet eligible by the dunning interval', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'inv-1', number: 'R-1', status: 'dunning_1', dunning_level: 1,
      due_date: new Date(Date.now() - 20 * 86_400_000),
      last_dunning_at: new Date(Date.now() - 1 * 86_400_000), // 1 day ago, interval default 14
      gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
    }] });
    getSiteSetting.mockResolvedValue(undefined);
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 1 });
    expect(getInvoice).not.toHaveBeenCalled();
  });

  it('skips a candidate when the invoice or customer can no longer be resolved', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
      due_date: new Date(Date.now() - 20 * 86_400_000), last_dunning_at: null,
      gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
    }] });
    getSiteSetting.mockResolvedValue(undefined);
    getInvoice.mockResolvedValueOnce(null);
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 1 });
    expect(getCustomerById).not.toHaveBeenCalled();
  });

  it('skips a candidate when the INSERT of the dunning row fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
        due_date: new Date(Date.now() - 20 * 86_400_000), last_dunning_at: null,
        gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
      }] })
      .mockRejectedValueOnce(new Error('insert failed')); // INSERT billing_invoice_dunnings
    getSiteSetting.mockResolvedValue(undefined);
    getInvoice.mockResolvedValueOnce({ id: 'inv-1', number: 'R-1', status: 'open' });
    getCustomerById.mockResolvedValueOnce({ id: 'cust-1', name: 'Alice', email: 'a@b.com' });
    generateDunningPdf.mockResolvedValueOnce(Buffer.from('pdf'));
    archiveBillingPdf.mockResolvedValueOnce('Billing/mentolder/R-1/mahnung-1-R-1.pdf');
    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 0, skipped: 1 });
    expect(logBillingEvent).not.toHaveBeenCalled();
  });

  it('generates a dunning: builds the PDF, archives it, inserts + updates rows, and logs the event', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
        due_date: new Date(Date.now() - 20 * 86_400_000), last_dunning_at: null,
        gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // INSERT billing_invoice_dunnings
      .mockResolvedValueOnce({ rows: [] }); // UPDATE billing_invoices
    getSiteSetting.mockResolvedValue(undefined); // numberSetting falls back to defaults everywhere
    getInvoice.mockResolvedValueOnce({ id: 'inv-1', number: 'R-1', status: 'open' });
    getCustomerById.mockResolvedValueOnce({
      id: 'cust-1', name: 'Alice', email: 'a@b.com', company: null,
      addressLine1: 'Str. 1', city: 'Berlin', postalCode: '10115', landIso: 'DE',
    });
    generateDunningPdf.mockResolvedValueOnce(Buffer.from('pdf'));
    archiveBillingPdf.mockResolvedValueOnce('Billing/mentolder/R-1/mahnung-1-R-1.pdf');
    logBillingEvent.mockResolvedValueOnce(undefined);

    const out = await runDunningDetection('mentolder');
    expect(out).toEqual({ generated: 1, skipped: 0 });

    expect(generateDunningPdf).toHaveBeenCalledTimes(1);
    const pdfArgs = generateDunningPdf.mock.calls[0][0] as { dunning: { level: number }; customer: { name: string } };
    expect(pdfArgs.dunning.level).toBe(1);
    expect(pdfArgs.customer.name).toBe('Alice');

    const insertCall = query.mock.calls.find((c) => /INSERT INTO billing_invoice_dunnings/.test(c[0] as string));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual(['inv-1', 'mentolder', 1, 0, expect.any(Number), 100, 'Billing/mentolder/R-1/mahnung-1-R-1.pdf']);

    const updateCall = query.mock.calls.find((c) => /UPDATE billing_invoices/.test(c[0] as string));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['inv-1', 'dunning_1', 1]);

    expect(logBillingEvent).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'inv-1', action: 'dunning_generated', toStatus: 'dunning_1',
    }));
  });

  it('falls back to a computed pdfPath when archiveBillingPdf returns nothing', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'inv-1', number: 'R-1', status: 'open', dunning_level: 0,
        due_date: new Date(Date.now() - 20 * 86_400_000), last_dunning_at: null,
        gross_amount: '100', paid_amount: '0', customer_id: 'cust-1',
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    getSiteSetting.mockResolvedValue(undefined);
    getInvoice.mockResolvedValueOnce({ id: 'inv-1', number: 'R-1', status: 'open' });
    getCustomerById.mockResolvedValueOnce({ id: 'cust-1', name: 'Alice', email: 'a@b.com' });
    generateDunningPdf.mockResolvedValueOnce(Buffer.from('pdf'));
    archiveBillingPdf.mockResolvedValueOnce(undefined);

    await runDunningDetection('mentolder');
    const insertCall = query.mock.calls.find((c) => /INSERT INTO billing_invoice_dunnings/.test(c[0] as string));
    expect((insertCall![1] as unknown[])[6]).toBe('Billing/mentolder/R-1/mahnung-1-R-1.pdf');
  });
});
