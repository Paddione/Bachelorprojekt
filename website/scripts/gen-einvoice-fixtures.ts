import { writeFileSync, mkdirSync } from 'node:fs';
import { generateFacturX } from '../src/lib/einvoice/factur-x';
import type { InvoiceInput } from '../src/lib/einvoice/types';

const seller = { name: 'Patrick K.', address: 'Musterstr. 1', postalCode: '10115',
  city: 'Berlin', country: 'DE', contactEmail: 'r@m.de', iban: 'DE89370400440532013000', vatId: 'DE123456789' };

const cases: Array<[string, InvoiceInput]> = [
  ['kleinunternehmer', {
    number: 'F-K-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'kleinunternehmer',
    lines: [{ description: 'Coaching', quantity: 1, unit: 'HUR', unitPrice: 120, netAmount: 120, taxRate: 0, taxCategory: 'E' }],
    netTotal: 120, taxTotal: 0, grossTotal: 120,
    seller: { ...seller, vatId: undefined }, buyer: { name: 'Acme', email: 'a@x.de', country: 'DE' },
  }],
  ['regelbesteuerung-19', {
    number: 'F-R-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [{ description: 'Beratung', quantity: 4, unit: 'HUR', unitPrice: 150, netAmount: 600, taxRate: 19, taxCategory: 'S' }],
    netTotal: 600, taxTotal: 114, grossTotal: 714,
    seller, buyer: { name: 'Acme', email: 'a@x.de', country: 'DE', vatId: 'DE987654321' },
  }],
  ['mixed-rate', {
    number: 'F-M-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [
      { description: 'Buch', quantity: 2, unit: 'C62', unitPrice: 25, netAmount: 50, taxRate: 7, taxCategory: 'S' },
      { description: 'Service', quantity: 1, unit: 'C62', unitPrice: 100, netAmount: 100, taxRate: 19, taxCategory: 'S' },
    ],
    netTotal: 150, taxTotal: 22.5, grossTotal: 172.5,
    seller, buyer: { name: 'Buchladen', email: 'b@x.de', country: 'DE' },
  }],
  ['reverse-charge-eu', {
    number: 'F-A-1', issueDate: '2026-04-01', dueDate: '2026-04-15', currency: 'EUR',
    taxMode: 'regelbesteuerung',
    lines: [{ description: 'Cross-border B2B', quantity: 1, unit: 'C62', unitPrice: 1000, netAmount: 1000, taxRate: 0, taxCategory: 'AE' }],
    netTotal: 1000, taxTotal: 0, grossTotal: 1000,
    seller, buyer: { name: 'NL Buyer BV', email: 'x@y.nl', country: 'NL', vatId: 'NL123456789B01' },
  }],
];

mkdirSync('test/fixtures/einvoice', { recursive: true });
for (const [name, input] of cases) {
  writeFileSync(`test/fixtures/einvoice/${name}.cii.xml`, generateFacturX(input));
}
console.log('Wrote', cases.length, 'fixtures.');
