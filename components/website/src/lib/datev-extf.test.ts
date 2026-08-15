import { describe, it, expect } from 'vitest';
import { buildExtfCsv, buildExtfRow, type ExtfRecord, type ExtfParams } from './datev-extf';

const baseParams: ExtfParams = {
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  fiscalYearStart: '2026-01-01',
  bezeichnung: 'Test Export',
};

const regelRecord: ExtfRecord = {
  booking: {
    id: 1,
    bookingDate: '2026-01-15',
    belegnummer: 'INV-abc12345',
    description: 'Webhosting Januar 2026',
    netAmount: 1000,
    vatAmount: 190,
    skrKonto: '8400',
    type: 'income',
  },
  invoice: {
    number: 'RE-2026-0001',
    grossAmount: 1190,
    taxMode: 'regelbesteuerung',
    taxRate: 19,
  },
  customer: { name: 'Max Mustermann', company: 'Muster GmbH' },
};

const kleinRecord: ExtfRecord = {
  booking: {
    id: 2,
    bookingDate: '2026-01-20',
    belegnummer: 'INV-def67890',
    description: 'Beratung',
    netAmount: 500,
    vatAmount: 0,
    skrKonto: '8195',
    type: 'income',
  },
  invoice: {
    number: 'RE-2026-0002',
    grossAmount: 500,
    taxMode: 'kleinunternehmer',
    taxRate: 0,
  },
  customer: { name: 'Anna Beispiel', company: undefined },
};

describe('buildExtfRow', () => {
  it('sets gross amount with comma decimal for regelbesteuerung', () => {
    const row = buildExtfRow(regelRecord);
    const fields = row.split(';');
    expect(fields[0]).toBe('1190,00');
  });

  it('sets S/H-Kennzeichen to S', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[1]).toBe('S');
  });

  it('sets Konto to 1400 (Forderungen SKR03)', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[6]).toBe('1400');
  });

  it('sets Gegenkonto to skrKonto (8400 for regelbesteuerung)', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[7]).toBe('8400');
  });

  it('sets BU-Schlüssel to 9 for 19% regelbesteuerung', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[8]).toBe('9');
  });

  it('sets empty BU-Schlüssel for kleinunternehmer', () => {
    const row = buildExtfRow(kleinRecord);
    expect(row.split(';')[8]).toBe('');
  });

  it('formats Belegdatum as DDMM', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[9]).toBe('1501'); // 15. Jan
  });

  it('truncates Belegfeld 1 to 12 chars', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[10]).toBe('RE-2026-0001');
    expect(row.split(';')[10].length).toBeLessThanOrEqual(12);
  });

  it('sets Buchungstext from company name + description, max 60 chars', () => {
    const row = buildExtfRow(regelRecord);
    const text = row.split(';')[13];
    expect(text).toContain('Muster GmbH');
    expect(text.length).toBeLessThanOrEqual(60);
  });

  it('uses customer name when no company for Buchungstext', () => {
    const row = buildExtfRow(kleinRecord);
    expect(row.split(';')[13]).toContain('Anna Beispiel');
  });

  it('has exactly 46 fields', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';').length).toBe(46);
  });
});

describe('buildExtfCsv', () => {
  it('starts with EXTF header line starting with "EXTF"', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[0]).toMatch(/^"EXTF"/);
  });

  it('second row is column headers containing Umsatz', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('Umsatz');
    expect(lines[1]).toContain('Soll/Haben-Kennzeichen');
  });

  it('third row is the data row', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[2]).toContain('1190,00');
  });

  it('header contains period dates', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    expect(csv.split('\r\n')[0]).toContain('20260101');
    expect(csv.split('\r\n')[0]).toContain('20260131');
  });

  it('returns empty data section for empty records array', () => {
    const csv = buildExtfCsv([], baseParams);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(2); // header + column row only
  });
});
