// website/src/lib/einvoice/factur-x.test.ts
import { describe, it, expect } from 'vitest';
import { generateFacturX } from './factur-x';
import type { InvoiceInput } from './types';

const fixture: InvoiceInput = {
  number: 'R-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
  taxMode: 'regelbesteuerung',
  lines: [{ description: 'X', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' }],
  netTotal: 100, taxTotal: 19, grossTotal: 119,
  seller: { name: 'P', address: 'A', postalCode: '1', city: 'B', country: 'DE',
            contactEmail: 'a@b.de', iban: 'DE89370400440532013000', vatId: 'DE1' },
  buyer:  { name: 'C', email: 'c@d.de', country: 'DE' },
};

describe('generateFacturX', () => {
  it('uses the EN 16931 profile URI', () => {
    const xml = generateFacturX(fixture);
    expect(xml).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
  });
});
