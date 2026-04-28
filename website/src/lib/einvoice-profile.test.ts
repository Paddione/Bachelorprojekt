import { describe, it, expect } from 'vitest';
import { generateEInvoiceXml, type EInvoiceProfile } from './einvoice-profile';

const baseInput = {
  invoice: { number: 'RE-2026-0001', issueDate: '2026-04-28', dueDate: '2026-05-12',
             grossAmount: 119, netAmount: 100, taxAmount: 19, taxMode: 'regelbesteuerung' as const,
             taxRate: 19, paymentReference: 'RG2026-0001' },
  lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100, unit: 'HUR' }],
  customer: { name: 'Stadt Beispiel', email: 'rechnungen@beispiel.de', leitwegId: '991-01234-44',
              addressLine1: 'Marktplatz 1', postalCode: '12345', city: 'Beispielstadt', country: 'DE' },
  seller: { name: 'mentolder', address: 'Hauptstr. 1', postalCode: '54321', city: 'Köln',
            country: 'DE', vatId: 'DE123456789', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
};

it.each<EInvoiceProfile>(['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl'])(
  'erzeugt valides XML für Profil %s', (profile) => {
    const xml = generateEInvoiceXml(profile, baseInput);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml.length).toBeGreaterThan(500);
  }
);

it('xrechnung-cii enthält XRechnung-3.0-CustomizationID', () => {
  const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
  expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0');
});

it('xrechnung-ubl ist UBL-Namespace (Invoice-Element)', () => {
  const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
  expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
});

it('lehnt xrechnung-cii ab ohne Leitweg-ID (B2G-Pflicht)', () => {
  const noLeitweg = { ...baseInput, customer: { ...baseInput.customer, leitwegId: undefined } };
  expect(() => generateEInvoiceXml('xrechnung-cii', noLeitweg)).toThrow(/Leitweg-ID/);
});
