import { describe, it, expect } from 'vitest';
import { generateXRechnungUbl } from './xrechnung-ubl';
import type { EInvoiceInput } from './einvoice-types';

const baseSeller = {
  name: 'Acme Coaching',
  address: 'Acmeweg 2',
  postalCode: '54321',
  city: 'Munich',
  country: 'DE',
  vatId: 'DE123456789',
  email: 'rechnung@acme.example',
};

const baseCustomer = {
  name: 'Musterfirma GmbH',
  email: 'billing@musterfirma.example',
  addressLine1: 'Musterstr 1',
  postalCode: '12345',
  city: 'Berlin',
  country: 'DE',
  leitwegId: '991-12345-67',
};

const baseInvoice = {
  number: 'R-2026-0001',
  issueDate: '2026-06-27',
  dueDate: '2026-07-11',
  grossAmount: 100,
  netAmount: 100,
  taxAmount: 0,
  taxMode: 'kleinunternehmer' as const,
  taxRate: 0,
};

const baseLine = {
  description: 'Coaching session',
  quantity: 1,
  unitPrice: 100,
};

const baseInput: EInvoiceInput = {
  invoice: baseInvoice,
  lines: [baseLine],
  customer: baseCustomer,
  seller: baseSeller,
};

describe('generateXRechnungUbl', () => {
  it('emits a valid UBL Invoice header for kleinunternehmer', () => {
    const xml = generateXRechnungUbl(baseInput);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<Invoice');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
  });

  it('includes the leitweg-id as BuyerReference (BT-10)', () => {
    const xml = generateXRechnungUbl(baseInput);
    expect(xml).toContain('991-12345-67');
    expect(xml).toContain('<cbc:BuyerReference>');
  });

  it('emits the kleinunternehmer note and tax category E', () => {
    const xml = generateXRechnungUbl(baseInput);
    expect(xml).toContain('Kein Ausweis der Umsatzsteuer gemäß § 19 UStG');
    expect(xml).toContain('<cbc:ID>E</cbc:ID>');
  });

  it('emits the regelbesteuerung tax category S with rate', () => {
    const xml = generateXRechnungUbl({
      ...baseInput,
      invoice: { ...baseInvoice, taxMode: 'regelbesteuerung', taxRate: 19, taxAmount: 19 },
    });
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:Percent>19.00</cbc:Percent>');
    expect(xml).not.toContain('Kein Ausweis der Umsatzsteuer');
  });

  it('throws when the customer has no leitweg-id (BT-10)', () => {
    expect(() =>
      generateXRechnungUbl({
        ...baseInput,
        customer: { ...baseCustomer, leitwegId: undefined },
      }),
    ).toThrow(/Leitweg-ID/);
  });

  it('throws when the seller has no email (BT-34)', () => {
    expect(() =>
      generateXRechnungUbl({
        ...baseInput,
        seller: { ...baseSeller, email: undefined },
      }),
    ).toThrow(/Verkäufer-E-Mail/);
  });

  it('escapes XML-special characters in seller / customer fields', () => {
    const xml = generateXRechnungUbl({
      ...baseInput,
      seller: { ...baseSeller, name: 'A & B <Co> "GmbH"' },
    });
    expect(xml).toContain('A &amp; B &lt;Co&gt; &quot;GmbH&quot;');
  });

  it('renders PaymentMeans only when IBAN is present', () => {
    const withIban = generateXRechnungUbl({
      ...baseInput,
      seller: { ...baseSeller, iban: 'DE89370400440532013000' },
    });
    const withoutIban = generateXRechnungUbl(baseInput);
    expect(withIban).toContain('<cac:PaymentMeans>');
    expect(withoutIban).not.toContain('<cac:PaymentMeans>');
  });

  it('emits a PaymentID inside PaymentMeans when paymentReference is set', () => {
    const xml = generateXRechnungUbl({
      ...baseInput,
      seller: { ...baseSeller, iban: 'DE89370400440532013000' },
      invoice: { ...baseInvoice, paymentReference: 'REF-2026-0001' },
    });
    expect(xml).toContain('<cbc:PaymentID>REF-2026-0001</cbc:PaymentID>');
  });

  it('emits multiple invoice lines with sequential IDs', () => {
    const xml = generateXRechnungUbl({
      ...baseInput,
      lines: [
        baseLine,
        { description: 'Second', quantity: 2, unitPrice: 50 },
        { description: 'Third', quantity: 3, unitPrice: 10 },
      ],
    });
    expect(xml).toContain('<cbc:ID>1</cbc:ID>');
    expect(xml).toContain('<cbc:ID>2</cbc:ID>');
    expect(xml).toContain('<cbc:ID>3</cbc:ID>');
    expect(xml).toContain('<cbc:Name>Second</cbc:Name>');
    expect(xml).toContain('<cbc:Name>Third</cbc:Name>');
  });

  it('emits the seller VAT identifier as a PartyTaxScheme', () => {
    const xml = generateXRechnungUbl(baseInput);
    expect(xml).toContain('<cbc:CompanyID>DE123456789</cbc:CompanyID>');
    expect(xml).toContain('<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
  });

  it('emits the seller Steuernummer as a separate PartyTaxScheme (FC)', () => {
    const xml = generateXRechnungUbl({
      ...baseInput,
      seller: { ...baseSeller, vatId: undefined, taxNumber: '12/345/67890' },
    });
    expect(xml).toContain('<cbc:CompanyID>12/345/67890</cbc:CompanyID>');
    expect(xml).toContain('<cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme>');
  });
});
