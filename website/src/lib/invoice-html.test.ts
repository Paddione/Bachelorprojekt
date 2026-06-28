import { describe, it, expect } from 'vitest';
import { renderInvoiceHtml, renderDunningHtml, sampleInvoiceForPreview } from './invoice-html';
import type { Invoice } from './native-billing';

const baseInvoice: Invoice = {
  id: 'inv-1',
  brand: 'mentolder',
  number: 'R-2026-0001',
  status: 'open',
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
};

const baseCustomer = {
  name: 'Alice',
  email: 'alice@example.com',
  addressLine1: 'Hauptstr 1',
  city: 'Berlin',
  postalCode: '10115',
  country: 'DE',
};

const baseSeller = {
  name: 'Acme Coaching',
  address: 'Acmeweg 2',
  postalCode: '54321',
  city: 'Munich',
  country: 'DE',
  vatId: 'DE123456789',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  email: 'rechnung@acme.example',
  taxNumber: '',
  bankName: 'Testbank',
};

const baseLine = { description: 'Coaching', quantity: 1, unitPrice: 100, netAmount: 100 };

describe('renderInvoiceHtml', () => {
  it('emits a complete HTML document for a kleinunternehmer invoice', () => {
    const out = renderInvoiceHtml({
      invoice: baseInvoice,
      lines: [baseLine],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('Coaching');
    expect(out).toContain('100,00');
    expect(out).toContain('Acme Coaching');
  });

  it('switches the title to Gutschrift when the kind is gutschrift', () => {
    const out = renderInvoiceHtml({
      invoice: { ...baseInvoice, kind: 'gutschrift' },
      lines: [baseLine],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('Gutschrift');
  });

  it('includes the EU B2B services supply notice when supplyType matches', () => {
    const out = renderInvoiceHtml({
      invoice: { ...baseInvoice, supplyType: 'eu_b2b_services', taxMode: 'regelbesteuerung' } as Invoice,
      lines: [baseLine],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('§ 13b UStG');
  });

  it('renders multiple lines into separate table rows', () => {
    const out = renderInvoiceHtml({
      invoice: baseInvoice,
      lines: [baseLine, { description: 'Second', quantity: 2, unitPrice: 50, netAmount: 100 }],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('Coaching');
    expect(out).toContain('Second');
  });

  it('formats the service period when both endpoints are set', () => {
    const out = renderInvoiceHtml({
      invoice: { ...baseInvoice, servicePeriodStart: '2026-06-01', servicePeriodEnd: '2026-06-30' },
      lines: [baseLine],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('01.06.2026 – 30.06.2026');
  });

  it('formats a single-endpoint service period', () => {
    const out = renderInvoiceHtml({
      invoice: { ...baseInvoice, servicePeriodStart: '2026-06-01' },
      lines: [baseLine],
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('01.06.2026');
  });

  it('uses a custom title and intro text from templateTexts', () => {
    const out = renderInvoiceHtml(
      {
        invoice: baseInvoice,
        lines: [baseLine],
        customer: baseCustomer,
        seller: baseSeller,
        templateTexts: { title: 'Sonderrechnung', introText: 'Vielen Dank!' },
      },
      { brandName: 'My Brand' },
    );
    expect(out).toContain('Sonderrechnung');
    expect(out).toContain('Vielen Dank!');
    expect(out).toContain('My Brand');
  });
});

describe('renderDunningHtml', () => {
  it('renders a dunning document with the level', () => {
    const out = renderDunningHtml({
      dunning: {
        level: 1,
        outstandingAtGeneration: 100,
        feeAmount: 5,
        interestAmount: 0,
        totalAmount: 105,
        dueDate: '2026-07-11',
        generatedAt: '2026-07-12T00:00:00Z',
      } as any,
      invoice: baseInvoice,
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('Zahlungserinnerung');
  });

  it('switches to "Mahnung" title when level >= 2', () => {
    const out = renderDunningHtml({
      dunning: {
        level: 2,
        outstandingAtGeneration: 100,
        feeAmount: 10,
        interestAmount: 5,
        totalAmount: 115,
        dueDate: '2026-07-11',
        generatedAt: '2026-07-12T00:00:00Z',
      } as any,
      invoice: baseInvoice,
      customer: baseCustomer,
      seller: baseSeller,
    });
    expect(out).toContain('Mahnung');
  });
});

describe('sampleInvoiceForPreview', () => {
  it('produces a self-contained sample that can be rendered without DB', () => {
    const sample = sampleInvoiceForPreview();
    const html = renderInvoiceHtml(sample);
    expect(html).toContain('Coaching');
  });
});
