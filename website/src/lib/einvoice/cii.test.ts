import { describe, it, expect } from 'vitest';
import { generateCII } from './cii';
import type { InvoiceInput } from './types';

const baseSeller = {
  name: 'Patrick K.', address: 'Musterstr. 1', postalCode: '10115', city: 'Berlin',
  country: 'DE', contactEmail: 'rechnung@mentolder.de', iban: 'DE89370400440532013000',
};

describe('generateCII — Kleinunternehmer §19 UStG', () => {
  it('emits EN 16931 CII with no VAT and §19 IncludedNote', () => {
    const input: InvoiceInput = {
      number: 'R-2026-0001', issueDate: '2026-04-01', dueDate: '2026-04-15',
      currency: 'EUR', taxMode: 'kleinunternehmer',
      lines: [{
        description: 'Coaching-Sitzung 60 Min',
        quantity: 1, unit: 'HUR', unitPrice: 120, netAmount: 120,
        taxRate: 0, taxCategory: 'E',
      }],
      netTotal: 120, taxTotal: 0, grossTotal: 120,
      seller: baseSeller,
      buyer: { name: 'Acme GmbH', email: 'buyer@acme.de', country: 'DE' },
    };
    const xml = generateCII(input);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:cen.eu:en16931:2017');
    expect(xml).toContain('R-2026-0001');
    expect(xml).toContain('Kein Ausweis der Umsatzsteuer gemäß § 19 UStG');
    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>');
    expect(xml).toContain('<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>');
  });
});

describe('generateCII — Regelbesteuerung 19%', () => {
  it('emits EN 16931 CII with one tax bucket and seller VAT-ID', () => {
    const xml = generateCII({
      number: 'R-2026-0042', issueDate: '2026-04-15', dueDate: '2026-04-29',
      currency: 'EUR', taxMode: 'regelbesteuerung',
      lines: [
        { description: 'Beratung', quantity: 4, unit: 'HUR', unitPrice: 150, netAmount: 600, taxRate: 19, taxCategory: 'S' },
      ],
      netTotal: 600, taxTotal: 114, grossTotal: 714,
      seller: { ...baseSeller, vatId: 'DE123456789' },
      buyer: { name: 'Acme GmbH', email: 'buyer@acme.de', country: 'DE', vatId: 'DE987654321' },
    });
    expect(xml).toContain('<ram:CategoryCode>S</ram:CategoryCode>');
    expect(xml).toContain('<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:CalculatedAmount>114.00</ram:CalculatedAmount>');
    expect(xml).toContain('<ram:BasisAmount>600.00</ram:BasisAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>714.00</ram:GrandTotalAmount>');
    expect(xml).toContain('schemeID="VA">DE123456789');
    expect(xml).toContain('schemeID="VA">DE987654321');
    expect(xml).not.toContain('§ 19 UStG');
  });
});
