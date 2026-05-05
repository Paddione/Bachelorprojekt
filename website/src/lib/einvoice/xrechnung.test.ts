// website/src/lib/einvoice/xrechnung.test.ts
import { describe, it, expect } from 'vitest';
import { generateXRechnung } from './xrechnung';
import type { InvoiceInput } from './types';

const baseInput: InvoiceInput = {
  number: 'R-9', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
  taxMode: 'regelbesteuerung',
  lines: [{ description: 'X', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' }],
  netTotal: 100, taxTotal: 19, grossTotal: 119,
  seller: { name: 'P', address: 'A', postalCode: '1', city: 'B', country: 'DE',
            contactEmail: 'a@b.de', iban: 'DE89370400440532013000', vatId: 'DE1' },
  buyer:  { name: 'Behörde X', email: 'amt@example.gov.de', country: 'DE',
            leitwegId: '04011000-1234512345-67' },
};

describe('generateXRechnung', () => {
  it('uses the XRechnung 3.0 profile and Leitweg-ID as BuyerReference', () => {
    const xml = generateXRechnung(baseInput);
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
    expect(xml).toContain('<ram:BuyerReference>04011000-1234512345-67</ram:BuyerReference>');
  });

  it('rejects an invoice without a Leitweg-ID', () => {
    expect(() => generateXRechnung({ ...baseInput, buyer: { ...baseInput.buyer, leitwegId: undefined } }))
      .toThrow(/Leitweg-ID/);
  });
});
