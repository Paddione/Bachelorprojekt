import { describe, it, expect } from 'vitest';
import {
  canonicalInvoiceForHash,
  sha256Hex,
  type HashableInvoice,
  type HashableLine,
} from './invoice-hash';

const baseInvoice: HashableInvoice = {
  id: 'inv-1',
  brand: 'mentolder',
  customerId: 'cust-1',
  issueDate: '2026-06-27',
  dueDate: '2026-07-11',
  number: 'R-2026-0001',
  taxMode: 'kleinunternehmer',
  netAmount: 100,
  taxRate: 0,
  taxAmount: 0,
  grossAmount: 100,
};

const baseLines: HashableLine[] = [
  { id: 1, description: 'Coaching', quantity: 1, unitPrice: 100, netAmount: 100 },
];

describe('sha256Hex', () => {
  it('produces a 64-character hex digest for non-empty input', () => {
    const out = sha256Hex('hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a stable digest for the same input', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
  });

  it('produces a different digest for different inputs', () => {
    expect(sha256Hex('hello')).not.toBe(sha256Hex('hellp'));
  });
});

describe('canonicalInvoiceForHash', () => {
  it('returns a stable JSON string for the same invoice + lines', () => {
    const a = canonicalInvoiceForHash(baseInvoice, baseLines);
    const b = canonicalInvoiceForHash(baseInvoice, baseLines);
    expect(a).toBe(b);
  });

  it('sorts lines by id before serializing', () => {
    const a = canonicalInvoiceForHash(baseInvoice, [baseLines[0], { ...baseLines[0], id: 2, description: 'B' }]);
    const b = canonicalInvoiceForHash(baseInvoice, [{ ...baseLines[0], id: 2, description: 'B' }, baseLines[0]]);
    expect(a).toBe(b);
  });

  it('preserves optional service-period fields as null when absent', () => {
    const out = canonicalInvoiceForHash(baseInvoice, baseLines);
    expect(out).toContain('"servicePeriodStart":null');
    expect(out).toContain('"servicePeriodEnd":null');
  });

  it('coerces numeric fields through Number() before serializing', () => {
    const out = canonicalInvoiceForHash(
      { ...baseInvoice, netAmount: '100.00' as unknown as number, taxAmount: '0' as unknown as number },
      [{ ...baseLines[0], quantity: '1' as unknown as number, unitPrice: '100' as unknown as number }],
    );
    expect(out).toContain('"netAmount":100');
    expect(out).toContain('"taxAmount":0');
    expect(out).toContain('"quantity":1');
  });

  it('produces a digest that changes when an amount changes', () => {
    const a = sha256Hex(canonicalInvoiceForHash(baseInvoice, baseLines));
    const b = sha256Hex(canonicalInvoiceForHash({ ...baseInvoice, grossAmount: 200 }, baseLines));
    expect(a).not.toBe(b);
  });
});
