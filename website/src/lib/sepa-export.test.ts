import { describe, it, expect } from 'vitest';
import { validateMandates } from './sepa-pain008';

const goodRow = {
  invoiceNumber: 'RE-2024-001',
  amount: 119.00,
  paymentReference: 'RG2024001',
  customerName: 'Max Mustermann',
  sepaIban: 'DE75512108001245126199',
  sepaBic: 'SSKMDEMM',
  sepaMandateRef: 'MNDT-001',
  sepaMandateDate: '2024-01-15',
};

describe('validateMandates', () => {
  it('accepts a row with all fields', () => {
    const { valid, skipped } = validateMandates([goodRow]);
    expect(valid).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(valid[0].debtorIban).toBe('DE75512108001245126199');
  });

  it('skips rows with missing IBAN', () => {
    const { valid, skipped } = validateMandates([{ ...goodRow, sepaIban: undefined }]);
    expect(valid).toHaveLength(0);
    expect(skipped[0].reason).toBe('missing IBAN');
  });

  it('skips rows with missing mandate reference', () => {
    const { valid, skipped } = validateMandates([{ ...goodRow, sepaMandateRef: undefined }]);
    expect(valid).toHaveLength(0);
    expect(skipped[0].reason).toBe('missing mandate reference');
  });

  it('uses paymentReference as endToEndId when available', () => {
    const { valid } = validateMandates([goodRow]);
    expect(valid[0].endToEndId).toBe('RG2024001');
  });

  it('falls back to invoiceNumber as endToEndId when paymentReference absent', () => {
    const { valid } = validateMandates([{ ...goodRow, paymentReference: undefined }]);
    expect(valid[0].endToEndId).toBe('RE-2024-001');
  });
});
