import { describe, it, expect } from 'vitest';

// Pure-module suite: no DB, no network, no mocks needed. The invoice lib
// (../invoices.js) exposes pure builders plus DB functions; this suite
// covers the pure builders with fixtures only (example.test addresses,
// fictitious names). DB sequencing/locking is exercised by integration.

import {
  buildSnapshot,
  canTransition,
  correctionReference,
  DEFAULT_TAX_MODE,
  formatInvoiceNumber,
  KLEINUNTERNEHMER_NOTE,
  nextSequenceNumber,
  resolveCatalogService,
  validatePflichtangaben,
  type InvoiceSnapshotInput,
} from '../invoices.js';

const CATALOG = [
  { key: 'klassisch-60', name: 'Klassische Massage 60', durationMin: 60 },
  { key: 'ruecken-30', name: 'Rückenmassage 30', durationMin: 30 },
];

function snapshotInput(overrides: Partial<InvoiceSnapshotInput> = {}): InvoiceSnapshotInput {
  return {
    customerName: 'Fiktiva Muster',
    customerContact: 'fiktiva@example.test',
    serviceKey: 'klassisch-60',
    serviceName: 'Klassische Massage 60',
    serviceDurationMin: 60,
    unitPriceCents: 7000,
    taxMode: 'kleinunternehmer',
    taxRate: 0,
    issueDate: '2026-10-08',
    serviceDate: '2026-10-07',
    ...overrides,
  };
}

const CREDITOR = {
  name: 'Musterpraxis',
  address: 'Musterstraße 1, 10115 Berlin',
  taxId: '12/345/67890',
};

describe('Snapshot-Bildung', () => {
  it('freezes service name, price and duration at creation time', () => {
    const snap = buildSnapshot(snapshotInput());
    expect(snap.serviceName).toBe('Klassische Massage 60');
    expect(snap.unitPriceCents).toBe(7000);
    expect(snap.serviceDurationMin).toBe(60);
    expect(snap.customerName).toBe('Fiktiva Muster');
  });

  it('keeps the frozen snapshot untouched by later catalog price changes', () => {
    const resolved = resolveCatalogService(CATALOG, 'klassisch-60');
    const snap = buildSnapshot(snapshotInput({
      serviceName: resolved.serviceName,
      serviceDurationMin: resolved.serviceDurationMin,
      unitPriceCents: 7000,
    }));
    // The catalog price is a placeholder and never read: simulate a later
    // catalog change by resolving again with a mutated catalog copy.
    const mutated = CATALOG.map((s) => ({ ...s, price: '999 EUR' }));
    const again = resolveCatalogService(mutated, 'klassisch-60');
    expect(again.serviceName).toBe('Klassische Massage 60');
    expect(snap).toEqual(buildSnapshot(snapshotInput({
      serviceName: again.serviceName,
      serviceDurationMin: again.serviceDurationMin,
      unitPriceCents: 7000,
    })));
  });

  it('rejects empty service details', () => {
    expect(() => buildSnapshot(snapshotInput({ serviceName: '' }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ serviceName: '   ' }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ serviceKey: '' }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ customerName: '' }))).toThrow(RangeError);
  });

  it('rejects negative prices and invalid dates', () => {
    expect(() => buildSnapshot(snapshotInput({ unitPriceCents: -1 }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ unitPriceCents: 10.5 }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ issueDate: '2026-02-30' }))).toThrow(RangeError);
    expect(() => buildSnapshot(snapshotInput({ serviceDate: 'kein-datum' }))).toThrow(RangeError);
  });

  it('rejects unknown catalog keys', () => {
    expect(() => resolveCatalogService(CATALOG, 'gibt-es-nicht')).toThrow(RangeError);
    expect(() => resolveCatalogService(CATALOG, '')).toThrow(RangeError);
  });
});

describe('Nummernvergabe', () => {
  it('formats sequential numbers within a year', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('2026-0001');
    expect(formatInvoiceNumber(2026, 2)).toBe('2026-0002');
    expect(formatInvoiceNumber(2026, 42)).toBe('2026-0042');
  });

  it('scopes numbers by year so a new year restarts the sequence', () => {
    expect(formatInvoiceNumber(2027, 1)).toBe('2027-0001');
    expect(formatInvoiceNumber(2027, 1)).not.toBe(formatInvoiceNumber(2026, 1));
  });

  it('never reuses numbers: the sequence only moves forward', () => {
    expect(nextSequenceNumber(0)).toBe(1);
    expect(nextSequenceNumber(41)).toBe(42);
    const last = 7;
    const next = nextSequenceNumber(last);
    expect(next).toBeGreaterThan(last);
  });

  it('rejects missing or invalid years and sequences', () => {
    expect(() => formatInvoiceNumber(1999, 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, -3)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(Number.NaN, 1)).toThrow(RangeError);
    expect(() => nextSequenceNumber(-1)).toThrow(RangeError);
  });
});

describe('Status-Übergänge', () => {
  it('accepts offen to bezahlt', () => {
    expect(canTransition('offen', 'bezahlt')).toBe(true);
  });

  it('accepts offen to storniert', () => {
    expect(canTransition('offen', 'storniert')).toBe(true);
  });

  it('rejects bezahlt to offen', () => {
    expect(canTransition('bezahlt', 'offen')).toBe(false);
  });

  it('rejects bezahlt to storniert', () => {
    expect(canTransition('bezahlt', 'storniert')).toBe(false);
  });

  it('rejects every transition out of storniert', () => {
    expect(canTransition('storniert', 'offen')).toBe(false);
    expect(canTransition('storniert', 'bezahlt')).toBe(false);
    expect(canTransition('storniert', 'storniert')).toBe(false);
  });

  it('rejects redundant same-state transitions', () => {
    expect(canTransition('offen', 'offen')).toBe(false);
    expect(canTransition('bezahlt', 'bezahlt')).toBe(false);
  });
});

describe('Kleinunternehmer-Hinweis-Logik', () => {
  it('sets the § 19 hint and no tax in Kleinunternehmer mode', () => {
    expect(DEFAULT_TAX_MODE).toBe('kleinunternehmer');
    const snap = buildSnapshot(snapshotInput({ taxMode: 'kleinunternehmer', taxRate: 19 }));
    expect(snap.taxRate).toBe(0);
    expect(snap.taxAmountCents).toBe(0);
    expect(snap.grossAmountCents).toBe(7000);
    expect(snap.taxNote).toBe(KLEINUNTERNEHMER_NOTE);
    expect(snap.taxNote).toContain('§ 19 UStG');
  });

  it('shows tax and no hint in Regelbesteuerung mode', () => {
    const snap = buildSnapshot(snapshotInput({ taxMode: 'regelbesteuerung', taxRate: 19 }));
    expect(snap.taxRate).toBe(19);
    expect(snap.taxAmountCents).toBe(1330);
    expect(snap.grossAmountCents).toBe(8330);
    expect(snap.taxNote).toBeNull();
  });

  it('never combines hint and tax output', () => {
    const klein = buildSnapshot(snapshotInput({ taxMode: 'kleinunternehmer' }));
    const regel = buildSnapshot(snapshotInput({ taxMode: 'regelbesteuerung', taxRate: 7 }));
    expect(klein.taxNote !== null && klein.taxAmountCents === 0).toBe(true);
    expect(regel.taxNote === null && regel.taxAmountCents > 0).toBe(true);
  });

  it('rounds half cents up in Regelbesteuerung mode', () => {
    const snap = buildSnapshot(snapshotInput({
      taxMode: 'regelbesteuerung', taxRate: 19, unitPriceCents: 1050,
    }));
    expect(snap.taxAmountCents).toBe(200);
    expect(snap.grossAmountCents).toBe(1250);
  });
});

describe('Korrektur-Verknüpfung', () => {
  it('links the successor to the original id', () => {
    const ref = correctionReference('inv-original-1');
    expect(ref.cancelsInvoiceId).toBe('inv-original-1');
  });

  it('marks the original via the offen to storniert transition only', () => {
    expect(canTransition('offen', 'storniert')).toBe(true);
    expect(canTransition('bezahlt', 'storniert')).toBe(false);
    expect(canTransition('storniert', 'storniert')).toBe(false);
  });

  it('freezes corrected amounts independently of the original snapshot', () => {
    const original = buildSnapshot(snapshotInput({ unitPriceCents: 7000 }));
    const corrected = buildSnapshot(snapshotInput({ unitPriceCents: 8000 }));
    expect(corrected.unitPriceCents).toBe(8000);
    expect(corrected.grossAmountCents).toBe(8000);
    expect(original.unitPriceCents).toBe(7000);
    expect(original).not.toEqual(corrected);
  });

  it('rejects correcting an already corrected (storniert) invoice', () => {
    expect(canTransition('storniert', 'storniert')).toBe(false);
  });

  it('rejects corrections without an original id', () => {
    expect(() => correctionReference('')).toThrow(RangeError);
    expect(() => correctionReference('   ')).toThrow(RangeError);
  });
});

describe('Pflichtangaben-Check', () => {
  it('reports no missing items for a complete invoice', () => {
    const snap = buildSnapshot(snapshotInput());
    expect(validatePflichtangaben(snap, CREDITOR)).toEqual([]);
  });

  it('reports each missing creditor field', () => {
    const snap = buildSnapshot(snapshotInput());
    expect(validatePflichtangaben(snap, { ...CREDITOR, name: '' })).not.toEqual([]);
    expect(validatePflichtangaben(snap, { ...CREDITOR, address: '' })).not.toEqual([]);
    expect(validatePflichtangaben(snap, { ...CREDITOR, taxId: '' })).not.toEqual([]);
  });

  it('reports a missing tax hint in Kleinunternehmer mode', () => {
    const snap = { ...buildSnapshot(snapshotInput()), taxNote: null };
    expect(validatePflichtangaben(snap, CREDITOR).length).toBeGreaterThan(0);
  });
});
