import { it, expect } from 'vitest';
import { generateZugferdXmlFromNative } from './zugferd';

it('generates valid ZUGFeRD XML for Kleinunternehmer', () => {
  const xml = generateZugferdXmlFromNative({
    invoice: { number:'RE-2025-0001', issueDate:'2025-09-01', grossAmount:60, netAmount:60, taxAmount:0, taxMode:'kleinunternehmer', taxRate:0 },
    lines: [{ description:'Coaching', netAmount:60 }],
    customer: { name:'Max Mustermann', email:'max@test.de' },
    seller: { name:'Gerald', address:'Str 1', postalCode:'32312', city:'Lübbecke', country:'DE', vatId:'' },
  });
  expect(xml).toContain('urn:cen.eu:en16931:2017');
  expect(xml).toContain('RE-2025-0001');
  expect(xml).not.toContain('SpecifiedTaxRegistration'); // no USt for Kleinunternehmer
});

it('generates valid ZUGFeRD XML for Regelbesteuerung', () => {
  const xml = generateZugferdXmlFromNative({
    invoice: { number:'RE-2025-0002', issueDate:'2025-10-01', grossAmount:71.40, netAmount:60, taxAmount:11.40, taxMode:'regelbesteuerung', taxRate:19 },
    lines: [{ description:'Coaching', netAmount:60 }],
    customer: { name:'Max Mustermann', email:'max@test.de' },
    seller: { name:'Gerald', address:'Str 1', postalCode:'32312', city:'Lübbecke', country:'DE', vatId:'DE123456789' },
  });
  expect(xml).toContain('DE123456789');
  expect(xml).toContain('11.40'); // taxTotalAmount for 19% VAT on 60€
});
