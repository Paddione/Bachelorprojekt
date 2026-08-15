import { describe, it, expect } from 'vitest';
import type {
  EInvoiceProfile,
  EInvoiceInput,
  EInvoiceCustomer,
  EInvoiceSeller,
  EInvoiceLine,
} from './einvoice-types';

describe('einvoice-types', () => {
  it('supports all three profile values', () => {
    const profiles: EInvoiceProfile[] = ['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl'];
    expect(profiles).toHaveLength(3);
    expect(profiles).toContain('xrechnung-ubl');
  });

  it('describes a full EInvoiceInput shape', () => {
    const customer: EInvoiceCustomer = {
      name: 'Musterfirma GmbH',
      email: 'billing@musterfirma.example',
      addressLine1: 'Musterstr 1',
      postalCode: '12345',
      city: 'Berlin',
      country: 'DE',
      leitwegId: '991-12345-67',
    };
    const seller: EInvoiceSeller = {
      name: 'Acme Coaching',
      address: 'Acmeweg 2',
      postalCode: '54321',
      city: 'Munich',
      country: 'DE',
      vatId: 'DE123456789',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      email: 'rechnung@acme.example',
      phone: '+49 30 1234567',
      taxNumber: '12/345/67890',
    };
    const line: EInvoiceLine = {
      description: 'Coaching session',
      quantity: 1,
      unitPrice: 100,
      unit: 'C62',
    };
    const input: EInvoiceInput = {
      invoice: {
        number: 'R-2026-0001',
        issueDate: '2026-06-27',
        dueDate: '2026-07-11',
        grossAmount: 100,
        netAmount: 100,
        taxAmount: 0,
        taxMode: 'kleinunternehmer',
        taxRate: 0,
        paymentReference: 'REF-1',
      },
      lines: [line],
      customer,
      seller,
    };
    expect(input.lines).toHaveLength(1);
    expect(input.invoice.taxMode).toBe('kleinunternehmer');
  });
});
