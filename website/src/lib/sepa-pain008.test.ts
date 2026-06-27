import { describe, it, expect } from 'vitest';
import { buildPain008, type SepaCreditor, type SepaDebitEntry } from './sepa-pain008';

const creditor: SepaCreditor = {
  name: 'Acme Coaching',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  creditorId: 'DE98ZZZ09999999999',
};

const baseEntry: SepaDebitEntry = {
  endToEndId: 'E2E-001',
  amount: 100.5,
  mandateId: 'M-001',
  mandateDate: '2026-01-01',
  debtorName: 'Max Mustermann',
  debtorIban: 'DE21500500001234567897',
  debtorBic: 'INGDDEFFXXX',
  invoiceNumber: 'R-2026-0001',
};

describe('buildPain008', () => {
  it('throws on empty entries', () => {
    expect(() => buildPain008(creditor, '2026-07-01', [])).toThrow();
  });

  it('emits a pain.008.001.02 XML envelope for a single entry', () => {
    const xml = buildPain008(creditor, '2026-07-01', [baseEntry]);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<Document');
    expect(xml).toContain('pain.008.001.02');
    expect(xml).toContain('<CstmrDrctDbtInitn>');
  });

  it('encodes the creditor IBAN and BIC inside PmtInf', () => {
    const xml = buildPain008(creditor, '2026-07-01', [baseEntry]);
    expect(xml).toContain('DE89370400440532013000');
    expect(xml).toContain('COBADEFFXXX');
    expect(xml).toContain('DE98ZZZ09999999999');
  });

  it('escapes XML special characters in mandate / end-to-end ids', () => {
    const xml = buildPain008(creditor, '2026-07-01', [
      { ...baseEntry, endToEndId: 'E2E<&>', mandateId: 'M<test>' },
    ]);
    expect(xml).toContain('E2E&lt;&amp;&gt;');
    expect(xml).toContain('M&lt;test&gt;');
  });

  it('sums the total of all entries into CtlrSum', () => {
    const xml = buildPain008(creditor, '2026-07-01', [
      baseEntry,
      { ...baseEntry, endToEndId: 'E2E-002', amount: 49.5, mandateId: 'M-002' },
    ]);
    expect(xml).toContain('150.00');
  });

  it('emits one DrctDbtTxInf block per entry', () => {
    const xml = buildPain008(creditor, '2026-07-01', [
      baseEntry,
      { ...baseEntry, endToEndId: 'E2E-002', amount: 49.5, mandateId: 'M-002' },
      { ...baseEntry, endToEndId: 'E2E-003', amount: 10, mandateId: 'M-003' },
    ]);
    const matches = xml.match(/<DrctDbtTxInf>/g) ?? [];
    expect(matches.length).toBe(3);
  });
});
