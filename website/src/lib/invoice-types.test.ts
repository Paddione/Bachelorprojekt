import { describe, it, expect } from 'vitest';
import type { Invoice, InvoiceLine } from './invoice-types';

describe('invoice-types', () => {
  it('compiles and can describe a minimal Invoice', () => {
    const line: InvoiceLine = { description: 'Coaching', quantity: 1, unitPrice: 100 };
    const invoice: Invoice = {
      id: 'inv-1',
      brand: 'mentolder',
      number: 'R-2026-0001',
      status: 'draft',
      customerId: 'cust-1',
      issueDate: '2026-06-27',
      dueDate: '2026-07-11',
      taxMode: 'kleinunternehmer',
      netAmount: 100,
      taxRate: 0,
      taxAmount: 0,
      grossAmount: 100,
      locked: false,
      currency: 'EUR',
      currencyRate: 1,
      netAmountEur: 100,
      grossAmountEur: 100,
      kind: 'regular',
      lines: undefined as never,
    };
    expect(invoice.number).toBe('R-2026-0001');
    expect(line.description).toBe('Coaching');
  });

  it('accepts optional fields on Invoice and InvoiceLine', () => {
    const line: InvoiceLine = {
      description: 'Session',
      quantity: 2,
      unitPrice: 50,
      unit: 'C62',
      taxCategory: 'S',
    };
    const invoice: Invoice = {
      id: 'inv-2',
      brand: 'korczewski',
      number: 'R-2026-0002',
      status: 'paid',
      customerId: 'cust-2',
      issueDate: '2026-06-27',
      dueDate: '2026-07-11',
      taxMode: 'regelbesteuerung',
      netAmount: 100,
      taxRate: 19,
      taxAmount: 19,
      grossAmount: 119,
      notes: 'Thank you',
      paymentReference: 'REF-1',
      paidAt: '2026-06-28',
      paidAmount: 119,
      locked: true,
      cancelledInvoiceId: 'inv-1',
      servicePeriodStart: '2026-06-01',
      servicePeriodEnd: '2026-06-30',
      leitwegId: '991-12345-67',
      currency: 'EUR',
      currencyRate: 1,
      netAmountEur: 100,
      grossAmountEur: 119,
      supplyType: 'services',
      kind: 'final',
      parentInvoiceId: 'inv-0',
    };
    expect(invoice.kind).toBe('final');
    expect(line.taxCategory).toBe('S');
  });
});
