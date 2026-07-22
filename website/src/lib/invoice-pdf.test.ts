import { it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { generateInvoicePdf, generateDunningPdf } from './invoice-pdf';
import type { Invoice } from './invoice-types';

// PDFKit compresses content streams by default, so page text is not readable
// via a plain latin1 dump (unlike Info-dict metadata or literal XML
// attachments). Use pdf-parse to extract real rendered text for assertions.
async function extractText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

it('generates a non-empty PDF buffer', async () => {
  const buf = await generateInvoicePdf({
    invoice: {
      id:'1', brand:'test', number:'RE-2025-0001', status:'open',
      customerId:'c1', issueDate:'2025-09-01', dueDate:'2025-09-15',
      taxMode:'kleinunternehmer', netAmount:60, taxRate:0, taxAmount:0, grossAmount:60,
      paymentReference:'RG20250001', locked:true,
      currency:'EUR', currencyRate:null, netAmountEur:60, grossAmountEur:60,
      kind: 'regular' as const,
    },
    lines: [{ description:'Coaching 1h', quantity:1, unitPrice:60, netAmount:60 }],
    customer: { name:'Max Mustermann', email:'max@test.de', country:'DE' },
    seller: {
      name:'Gerald Korczewski', address:'Musterstr. 1', postalCode:'32312',
      city:'Lübbecke', country:'DE', vatId:'', taxNumber:'33/023/05100',
      iban:'DE89370400440532013000', bic:'COBADEFFXXX', bankName:'Commerzbank',
    },
  });
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.subarray(0,4).toString()).toBe('%PDF');
});

it('includes reverse charge notice when supplyType is eu_b2b_services', async () => {
  const baseInvoice = {
    id: 'inv-rc', brand: 'test', number: 'RE-2026-0099',
    status: 'open', customerId: 'c1',
    issueDate: '2026-04-28', dueDate: '2026-05-12',
    taxMode: 'regelbesteuerung', netAmount: 500, taxRate: 0,
    taxAmount: 0, grossAmount: 500, locked: true,
    currency: 'EUR', currencyRate: null,
    netAmountEur: 500, grossAmountEur: 500,
    supplyType: 'eu_b2b_services',
    kind: 'regular' as const,
  };
  const baseSeller = {
    name: 'Test GmbH', address: 'Musterstr 1', postalCode: '10115',
    city: 'Berlin', country: 'DE', vatId: 'DE123456789',
    taxNumber: '12/345/67890', iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX', bankName: 'Commerzbank',
  };
  const pdf = await generateInvoicePdf({
    invoice: baseInvoice,
    lines: [{ description: 'Consulting', quantity: 1, unitPrice: 500, netAmount: 500 }],
    customer: { name: 'Acme SA', email: 'acme@fr.com', country: 'FR', vatNumber: 'FR12345678901' },
    seller: baseSeller,
  });
  // PDF is binary; extract text via toString and check notice substring
  const text = pdf.toString('latin1');
  expect(text).toContain('13b');
});


it('PDF enthält factur-x.xml als Anhang', async () => {
  const pdf = await generateInvoicePdf({
    invoice: { number: 'RE-9', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG9' } as never,
    lines: [{ description: 'X', quantity: 1, unitPrice: 100, netAmount: 100 }],
    customer: { name: 'C', email: 'c@d.de', country: 'DE' },
    seller: { name: 'mentolder', address: 'A', postalCode: '1', city: 'K',
              country: 'DE', vatId: 'DE1', email: 'rechnung@mentolder.de',
              taxNumber: '', iban: '', bic: '', bankName: '' },
    profile: 'factur-x-minimum',
  });
  expect(pdf.toString('latin1')).toContain('factur-x.xml');
  expect(pdf.toString('latin1')).toContain('/AFRelationship /Alternative');
});

const dunningInvoice: Invoice = {
  id: 'inv-1', brand: 'test', number: 'RE-2026-0050', status: 'open',
  customerId: 'c1', issueDate: '2026-03-01', dueDate: '2026-03-15',
  taxMode: 'regelbesteuerung', netAmount: 100, taxRate: 19, taxAmount: 19,
  grossAmount: 119, paymentReference: 'RG20260050', locked: true,
  currency: 'EUR', currencyRate: null, netAmountEur: 119, grossAmountEur: 119,
  kind: 'regular',
};
const dunningCustomer = { name: 'Erika Mustermann', email: 'erika@test.de', country: 'DE', addressLine1: 'Weg 1', postalCode: '10115', city: 'Berlin' };
const dunningSeller = {
  name: 'Gerald Korczewski', address: 'Musterstr. 1', postalCode: '32312',
  city: 'Lübbecke', country: 'DE', vatId: 'DE123', taxNumber: '33/023/05100',
  iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'Commerzbank',
  email: 'rechnung@test.de', phone: '+49 30 1234567',
};

it('generates a Zahlungserinnerung (level 1, no fees) as a valid PDF', async () => {
  const buf = await generateDunningPdf({
    dunning: {
      id: 'd1', invoiceId: 'inv-1', brand: 'test', level: 1,
      generatedAt: '2026-03-20', feeAmount: 0, interestAmount: 0,
      outstandingAtGeneration: 119,
    },
    invoice: dunningInvoice,
    customer: dunningCustomer,
    seller: dunningSeller,
  });
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  const text = await extractText(buf);
  expect(text).toContain('ZAHLUNGSERINNERUNG');
});

it('generates a Mahnung (level 2+) with fees and interest included in the total', async () => {
  const buf = await generateDunningPdf({
    dunning: {
      id: 'd2', invoiceId: 'inv-1', brand: 'test', level: 2,
      generatedAt: '2026-04-01', feeAmount: 5, interestAmount: 2.5,
      outstandingAtGeneration: 119,
    },
    invoice: dunningInvoice,
    customer: dunningCustomer,
    seller: { ...dunningSeller, email: undefined, phone: undefined },
  });
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  const text = await extractText(buf);
  expect(text).toContain('MAHNUNG');
  // Mahngebühren/Verzugszinsen rows are only rendered when > 0
  expect(text).toContain('Mahngeb');
  expect(text).toContain('Verzugszins');
});

it('generateInvoicePdf covers optional fields: multi-line items, service period, template texts, notes, full footer', async () => {
  const buf = await generateInvoicePdf({
    invoice: {
      ...dunningInvoice,
      servicePeriodStart: '2026-02-01',
      servicePeriodEnd: '2026-02-28',
      notes: 'Vielen Dank für die Zusammenarbeit.',
    },
    lines: [
      { description: 'Beratung', quantity: 2, unitPrice: 50, netAmount: 100, unit: 'Stunden' },
      { description: 'Reisekosten', quantity: 1, unitPrice: 0, netAmount: 0 },
    ],
    customer: {
      name: 'Erika Mustermann', company: 'Erika GmbH', email: 'erika@test.de',
      country: 'DE', addressLine1: 'Weg 1', postalCode: '10115', city: 'Berlin',
      vatNumber: 'DE987654321',
    },
    seller: { ...dunningSeller, website: 'https://example.com' },
    templateTexts: {
      title: 'RECHNUNG',
      introText: 'Vielen Dank für Ihren Auftrag.',
      outroText: 'Mit freundlichen Grüßen',
    },
  });
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  const text = await extractText(buf);
  expect(text).toContain('Erika GmbH');
  expect(text).toContain('Reisekosten');
});

it('generateInvoicePdf renders a single service period date when no end date is given', async () => {
  const buf = await generateInvoicePdf({
    invoice: { ...dunningInvoice, servicePeriodStart: '2026-02-15' },
    lines: [{ description: 'Einmalzahlung', quantity: 1, unitPrice: 119, netAmount: 100 }],
    customer: { name: 'Max Mustermann', email: 'max@test.de', country: 'DE' },
    seller: dunningSeller,
  });
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
});
