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
            country: 'DE', vatId: 'DE123456789', iban: 'DE02120300000000202051', bic: 'BYLADEM1001',
            email: 'rechnung@mentolder.de', phone: '+49 221 1234567' },
};

describe('generateEInvoiceXml', () => {
  it.each<EInvoiceProfile>(['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl'])(
    'erzeugt valides XML für Profil %s', (profile) => {
      const xml = generateEInvoiceXml(profile, baseInput);
      expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      expect(xml.length).toBeGreaterThan(500);
    }
  );

  it('xrechnung-cii enthält XRechnung-3.0-CustomizationID', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
  });

  it('xrechnung-ubl ist UBL-Namespace (Invoice-Element)', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
  });

  it('xrechnung-cii enthält Pflichtfelder BT-1, BT-2, BT-5, BT-9, BT-10, BT-31, BG-16', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    expect(xml).toContain('<ram:ID>RE-2026-0001</ram:ID>');                           // BT-1
    expect(xml).toContain('format="102">20260428');                                    // BT-2
    expect(xml).toContain('<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');   // BT-5
    expect(xml).toContain('format="102">20260512');                                    // BT-9 DueDate
    expect(xml).toContain('<ram:BuyerReference>991-01234-44</ram:BuyerReference>');    // BT-10
    expect(xml).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');               // BT-31
    expect(xml).toContain('<ram:IBANID>DE02120300000000202051</ram:IBANID>');          // BG-16 BT-84
  });
  it('xrechnung-cii Line-Items mappen BT-126/BT-129/BT-131', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    expect(xml).toContain('<ram:LineID>1</ram:LineID>');                                  // BT-126
    expect(xml).toMatch(/<ram:BilledQuantity unitCode="HUR">1<\/ram:BilledQuantity>/);    // BT-129
    expect(xml).toMatch(/<ram:LineTotalAmount>100\.00<\/ram:LineTotalAmount>/);           // BT-131
  });

  it('lehnt xrechnung-cii ab ohne Leitweg-ID (B2G-Pflicht)', () => {
    const noLeitweg = { ...baseInput, customer: { ...baseInput.customer, leitwegId: undefined } };
    expect(() => generateEInvoiceXml('xrechnung-cii', noLeitweg)).toThrow(/Leitweg-ID/);
  });

  it('xrechnung-cii element order: lines → agreement → delivery → settlement', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    const idxLines      = xml.indexOf('<ram:IncludedSupplyChainTradeLineItem>');
    const idxAgreement  = xml.indexOf('<ram:ApplicableHeaderTradeAgreement>');
    const idxDelivery   = xml.indexOf('<ram:ApplicableHeaderTradeDelivery');
    const idxSettlement = xml.indexOf('<ram:ApplicableHeaderTradeSettlement>');
    expect(idxLines).toBeGreaterThan(0);
    expect(idxLines).toBeLessThan(idxAgreement);
    expect(idxAgreement).toBeLessThan(idxDelivery);
    expect(idxDelivery).toBeLessThan(idxSettlement);
  });

  it('xrechnung-cii throws when called directly without leitwegId', async () => {
    const { generateXRechnungCii } = await import('./zugferd');
    const noLeitweg = { ...baseInput, customer: { ...baseInput.customer, leitwegId: undefined } };
    expect(() => generateXRechnungCii(noLeitweg)).toThrow(/Leitweg-ID/);
  });

  it('xrechnung-ubl mappt BT-1/BT-2/BT-5/BT-9/BT-10/BT-31 + IBAN', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    expect(xml).toContain('<cbc:ID>RE-2026-0001</cbc:ID>');
    expect(xml).toContain('<cbc:IssueDate>2026-04-28</cbc:IssueDate>');
    expect(xml).toContain('<cbc:DueDate>2026-05-12</cbc:DueDate>');
    expect(xml).toContain('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<cbc:BuyerReference>991-01234-44</cbc:BuyerReference>');
    expect(xml).toContain('<cbc:CompanyID>DE123456789</cbc:CompanyID>');
    expect(xml).toContain('<cbc:ID>DE02120300000000202051</cbc:ID>');
  });
  it('xrechnung-ubl CustomizationID ist XRechnung 3.0', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    expect(xml).toMatch(/<cbc:CustomizationID>urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_3\.0<\/cbc:CustomizationID>/);
  });

  it('xrechnung-ubl throws when called directly without leitwegId', async () => {
    const { generateXRechnungUbl } = await import('./xrechnung-ubl');
    const noLeitweg = { ...baseInput, customer: { ...baseInput.customer, leitwegId: undefined } };
    expect(() => generateXRechnungUbl(noLeitweg)).toThrow(/Leitweg-ID/);
  });

  it('xrechnung-ubl element order: header → parties → totals → lines', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    const idxCust    = xml.indexOf('<cbc:CustomizationID>');
    const idxSup     = xml.indexOf('<cac:AccountingSupplierParty>');
    const idxBuy     = xml.indexOf('<cac:AccountingCustomerParty>');
    const idxTotal   = xml.indexOf('<cac:LegalMonetaryTotal>');
    const idxLines   = xml.indexOf('<cac:InvoiceLine>');
    expect(idxCust).toBeGreaterThan(0);
    expect(idxCust).toBeLessThan(idxSup);
    expect(idxSup).toBeLessThan(idxBuy);
    expect(idxBuy).toBeLessThan(idxTotal);
    expect(idxTotal).toBeLessThan(idxLines);
  });
});

import { validateWithMustang, mustangAvailable } from './mustang.test-helper';

describe.skipIf(!mustangAvailable)('Mustang validation', () => {
  it('factur-x-minimum XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('factur-x-minimum', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  }, 60_000);
  it('xrechnung-cii XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('xrechnung-cii', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  }, 60_000);
  it('xrechnung-ubl XML ist Mustang-valide', () => {
    const xml = generateEInvoiceXml('xrechnung-ubl', baseInput);
    const r = validateWithMustang(xml, 'xml');
    if (!r.ok) console.error(r.output);
    expect(r.ok).toBe(true);
  }, 60_000);
});
