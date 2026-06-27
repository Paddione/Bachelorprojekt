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
});
