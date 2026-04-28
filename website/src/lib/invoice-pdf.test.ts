import { it, expect } from 'vitest';
import { generateInvoicePdf } from './invoice-pdf';

it('generates a non-empty PDF buffer', async () => {
  const buf = await generateInvoicePdf({
    invoice: {
      id:'1', brand:'test', number:'RE-2025-0001', status:'open',
      customerId:'c1', issueDate:'2025-09-01', dueDate:'2025-09-15',
      taxMode:'kleinunternehmer', netAmount:60, taxRate:0, taxAmount:0, grossAmount:60,
      paymentReference:'RG20250001', locked:true,
      currency:'EUR', currencyRate:null, netAmountEur:60, grossAmountEur:60,
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
  expect(buf.slice(0,4).toString()).toBe('%PDF');
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
