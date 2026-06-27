import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const clientQ = vi.fn();
const connect = vi.fn();
const initBillingTables = vi.fn();
const getNextInvoiceNumber = vi.fn();
const getSiteSetting = vi.fn();
const getCustomerById = vi.fn();
const getInvoice = vi.fn();
const addBooking = vi.fn();
const generateInvoicePdf = vi.fn();
const archiveBillingPdf = vi.fn();
const logBillingEvent = vi.fn();

vi.mock('./website-db', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...a),
  },
  initBillingTables: (...a: unknown[]) => initBillingTables(...a),
  getNextInvoiceNumber: (...a: unknown[]) => getNextInvoiceNumber(...a),
  getSiteSetting: (...a: unknown[]) => getSiteSetting(...a),
}));
vi.mock('./native-billing', () => ({
  getCustomerById: (...a: unknown[]) => getCustomerById(...a),
  getInvoice: (...a: unknown[]) => getInvoice(...a),
}));
vi.mock('./eur-bookkeeping', () => ({
  addBooking: (...a: unknown[]) => addBooking(...a),
}));
vi.mock('./invoice-pdf', () => ({
  generateInvoicePdf: (...a: unknown[]) => generateInvoicePdf(...a),
}));
vi.mock('./billing-archive', () => ({
  archiveBillingPdf: (...a: unknown[]) => archiveBillingPdf(...a),
}));
vi.mock('./billing-audit', () => ({
  logBillingEvent: (...a: unknown[]) => logBillingEvent(...a),
}));
vi.mock('./tax-monitor', () => ({
  checkAndApplyTaxModeSwitch: vi.fn(),
}));

import { createCreditNote } from './invoice-storno';

beforeEach(() => {
  query.mockReset();
  clientQ.mockReset();
  initBillingTables.mockReset();
  getNextInvoiceNumber.mockReset();
  getSiteSetting.mockReset();
  getCustomerById.mockReset();
  getInvoice.mockReset();
  addBooking.mockReset();
  generateInvoicePdf.mockReset();
  archiveBillingPdf.mockReset();
  logBillingEvent.mockReset();
  initBillingTables.mockResolvedValue(undefined);
  connect.mockResolvedValue({
    query: (...a: unknown[]) => clientQ(...a),
    release: () => undefined,
  });
  getNextInvoiceNumber.mockResolvedValue('GS-2026-0001');
});

const baseOrigRow = {
  id: 'inv-1', brand: 'mentolder', number: 'R-2026-0001', status: 'open',
  customer_id: 'cust-1', issue_date: new Date('2026-05-01T00:00:00Z'),
  due_date: new Date('2026-05-15T00:00:00Z'), tax_mode: 'regelbesteuerung',
  net_amount: '100.00', tax_rate: '19', tax_amount: '19.00', gross_amount: '119.00',
  paid_amount: '0', locked: true, kind: 'regular', currency: 'EUR', currency_rate: '1',
  net_amount_eur: '100.00', gross_amount_eur: '119.00',
  payment_reference: 'R-2026-0001', parent_invoice_id: null,
  cancels_invoice_id: null, supply_type: null,
};

describe('invoice-storno.createCreditNote', () => {
  it('returns null when the invoice does not exist', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const out = await createCreditNote('missing', 'kundenwunsch');
    expect(out).toBeNull();
  });

  it('rejects a draft invoice', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseOrigRow, status: 'draft' }] });
    await expect(createCreditNote('inv-1', 'x')).rejects.toThrow(/cancelled/);
  });

  it('rejects a credit-note-of-credit-note', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseOrigRow, status: 'paid', kind: 'gutschrift' }] });
    await expect(createCreditNote('inv-1', 'x')).rejects.toThrow(/credit note/);
  });

  it('happy path: full pipeline for a paid regular invoice', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })                                              // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...baseOrigRow, status: 'paid', paid_amount: '119.00' }] })  // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 'gs-1', brand: 'mentolder', number: 'GS-2026-0001', status: 'open', customer_id: 'cust-1', issue_date: new Date(), due_date: new Date(), tax_mode: 'regelbesteuerung', net_amount: '-100.00', tax_rate: '19', tax_amount: '-19.00', gross_amount: '-119.00', paid_amount: '0', locked: true, cancels_invoice_id: 'inv-1', kind: 'gutschrift', parent_invoice_id: null, currency: 'EUR', currency_rate: '1', net_amount_eur: '-100.00', gross_amount_ur: '-119.00', supply_type: null, payment_reference: 'GS-2026-0001', notes: null }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] })                                              // SELECT lines
      .mockResolvedValueOnce({ rows: [] })                                              // INSERT line
      .mockResolvedValueOnce({ rows: [] })                                              // UPDATE status
      .mockResolvedValueOnce({ rows: [] });                                             // COMMIT

    const out = await createCreditNote('inv-1', 'Kundenwunsch', { email: 'admin@example.com' });
    expect(out).not.toBeNull();
    expect(out!.id).toBe('gs-1');
    expect(out!.netAmount).toBe(-100);
    expect(out!.kind).toBe('gutschrift');
    expect(addBooking).toHaveBeenCalledTimes(1);
    expect(logBillingEvent).toHaveBeenCalledTimes(1);
    const auditArg = logBillingEvent.mock.calls[0][0];
    expect(auditArg.action).toBe('storno');
    expect(auditArg.fromStatus).toBe('paid');
    expect(auditArg.toStatus).toBe('cancelled');
  });

  it('does NOT call addBooking when paid_amount is 0', async () => {
    clientQ
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...baseOrigRow, status: 'open', paid_amount: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'gs-2', brand: 'mentolder', number: 'GS-2026-0002', status: 'open', customer_id: 'cust-1', issue_date: new Date(), due_date: new Date(), tax_mode: 'regelbesteuerung', net_amount: '-100', tax_rate: '19', tax_amount: '-19', gross_amount: '-119', paid_amount: '0', locked: true, cancels_invoice_id: 'inv-1', kind: 'gutschrift', parent_invoice_id: null, currency: 'EUR', currency_rate: '1', net_amount_eur: '-100', gross_amount_eur: '-119', supply_type: null, payment_reference: 'GS-2026-0002', notes: null }] })
      .mockResolvedValueOnce({ rows: [] })  // SELECT lines
      .mockResolvedValueOnce({ rows: [] })  // INSERT line
      .mockResolvedValueOnce({ rows: [] })  // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await createCreditNote('inv-1', 'x');
    expect(addBooking).not.toHaveBeenCalled();
  });
});
