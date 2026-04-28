import { describe, it, expect } from 'vitest';
import { buildPain008, type SepaCreditor, type SepaDebitEntry } from './sepa-pain008';

const creditor: SepaCreditor = {
  name: 'Muster GmbH',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  creditorId: 'DE98ZZZ09999999999',
};

const entry: SepaDebitEntry = {
  endToEndId: 'RG2024001',
  amount: 119.00,
  mandateId: 'MNDT-001',
  mandateDate: '2024-01-15',
  debtorName: 'Max Mustermann',
  debtorIban: 'DE75512108001245126199',
  debtorBic: 'SSKMDEMM',
  invoiceNumber: 'RE-2024-001',
};

describe('buildPain008', () => {
  it('produces valid XML envelope', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.008.001.02');
    expect(xml).toContain('<CstmrDrctDbtInitn>');
  });

  it('embeds creditor identity in GrpHdr and PmtInf', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<Nm>Muster GmbH</Nm>');
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).toContain('<BIC>COBADEFFXXX</BIC>');
    expect(xml).toContain('<Id>DE98ZZZ09999999999</Id>');
  });

  it('sets correct NbOfTxs and CtrlSum', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<NbOfTxs>1</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>119.00</CtrlSum>');
  });

  it('embeds debtor mandate and account', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<MndtId>MNDT-001</MndtId>');
    expect(xml).toContain('<DtOfSgntr>2024-01-15</DtOfSgntr>');
    expect(xml).toContain('<IBAN>DE75512108001245126199</IBAN>');
    expect(xml).toContain('<BIC>SSKMDEMM</BIC>');
    expect(xml).toContain('<Nm>Max Mustermann</Nm>');
  });

  it('sets ReqdColltnDt to the provided collection date', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<ReqdColltnDt>2024-02-01</ReqdColltnDt>');
  });

  it('includes invoice number in RmtInf', () => {
    const xml = buildPain008(creditor, '2024-02-01', [entry]);
    expect(xml).toContain('<Ustrd>RE-2024-001</Ustrd>');
  });

  it('sums CtrlSum across multiple entries', () => {
    const entry2 = { ...entry, endToEndId: 'RG2024002', amount: 23.80, invoiceNumber: 'RE-2024-002' };
    const xml = buildPain008(creditor, '2024-02-01', [entry, entry2]);
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>142.80</CtrlSum>');
  });

  it('throws when entries array is empty', () => {
    expect(() => buildPain008(creditor, '2024-02-01', [])).toThrow('at least one entry');
  });
});
