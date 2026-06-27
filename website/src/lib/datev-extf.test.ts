import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { buildExtfRow, buildExtfCsv, getBookingsForPeriod, periodRange } from './datev-extf';

beforeEach(() => query.mockReset());

describe('datev-extf.buildExtfRow', () => {
  it('emits 46 semicolon-separated cells with the correct header indices', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-001', description: 'Coaching', netAmount: 100, vatAmount: 19, skrKonto: '8400', type: 'income' },
      invoice: { number: 'R-2026-0001', grossAmount: 119, taxMode: 'regelbesteuerung', taxRate: 19 },
      customer: { name: 'Alice', company: 'ACME' },
    });
    const cells = row.split(';');
    expect(cells).toHaveLength(46);
    expect(cells[0]).toBe('119,00');          // Umsatz
    expect(cells[1]).toBe('S');               // S/H
    expect(cells[2]).toBe('EUR');             // WKZ
    expect(cells[6]).toBe('1400');            // Konto
    expect(cells[7]).toBe('8400');            // Gegenkonto
    expect(cells[8]).toBe('9');               // BU-Schlüssel (19% tax)
    expect(cells[9]).toBe('2005');            // Belegdatum DDMM
    expect(cells[10]).toBe('R-2026-0001');    // Belegfeld 1
    expect(cells[13]).toMatch(/^ACME Coaching/);
  });

  it('emits BU-Schlüssel "8" for 7% tax rate', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'x', netAmount: 100, vatAmount: 7, skrKonto: '8400', type: 'income' },
      invoice: { number: 'R-1', grossAmount: 107, taxMode: 'regelbesteuerung', taxRate: 7 },
      customer: null,
    });
    expect(row.split(';')[8]).toBe('8');
  });

  it('emits empty BU-Schlüssel for kleinunternehmer invoices', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'x', netAmount: 100, vatAmount: 0, skrKonto: '8195', type: 'income' },
      invoice: { number: 'R-1', grossAmount: 100, taxMode: 'kleinunternehmer', taxRate: 0 },
      customer: { name: 'X' },
    });
    expect(row.split(';')[8]).toBe('');
    // Gegenkonto falls back to skr_konto
    expect(row.split(';')[7]).toBe('8195');
  });

  it('uses net+vat as gross when no invoice is provided', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'x', netAmount: 50, vatAmount: 9.5, skrKonto: '8400', type: 'income' },
      invoice: null,
      customer: null,
    });
    expect(row.split(';')[0]).toBe('59,50');
  });

  it('caps belegfeld1 at 12 chars', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'x', netAmount: 1, vatAmount: 0, skrKonto: '8400', type: 'income' },
      invoice: null,
      customer: null,
    });
    // belegfeld1 derives from invoice.number ?? belegnummer, both capped at 12
    expect(row.split(';')[10].length).toBeLessThanOrEqual(12);
  });

  it('caps the buchungstext at 60 chars', () => {
    const row = buildExtfRow({
      booking: { id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'x'.repeat(100), netAmount: 1, vatAmount: 0, skrKonto: '8400', type: 'income' },
      invoice: null,
      customer: { name: 'a'.repeat(80) },
    });
    expect(row.split(';')[13].length).toBeLessThanOrEqual(60);
  });
});

describe('datev-extf.buildExtfCsv', () => {
  it('emits meta + header + data rows joined with CRLF', () => {
    const csv = buildExtfCsv([], {
      periodStart: '2026-01-01', periodEnd: '2026-12-31', fiscalYearStart: '2026-01-01',
      bezeichnung: 'Test', beraternummer: 1234, mandantennummer: 5678,
    });
    const parts = csv.split('\r\n');
    expect(parts[0]).toMatch(/^"EXTF";700/);
    expect(parts[0]).toContain('"Buchungsstapel"');
    expect(parts[0]).toContain('1234');
    expect(parts[0]).toContain('5678');
    expect(parts[0]).toContain('20260101');
    expect(parts[1]).toMatch(/"Umsatz \(ohne Soll\/Haben-Kz\)"/);
  });

  it('defaults bezeichnung / beraternummer / mandantennummer', () => {
    const csv = buildExtfCsv([], {
      periodStart: '2026-01-01', periodEnd: '2026-12-31', fiscalYearStart: '2026-01-01',
    });
    expect(csv).toContain('"Buchungsstapel"');
    expect(csv).toContain(';0;0;');
  });
});

describe('datev-extf.periodRange', () => {
  it('returns a single year range when no month is given', () => {
    expect(periodRange(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31', label: '2026' });
  });

  it('returns the month range padded with leading zero', () => {
    const out = periodRange(2026, 2);
    expect(out.from).toBe('2026-02-01');
    expect(out.to).toBe('2026-02-28'); // 2026 is not a leap year
    expect(out.label).toMatch(/Februar 2026/);
  });

  it('uses the last calendar day of the month (handles 30/31-day months)', () => {
    expect(periodRange(2026, 4).to).toBe('2026-04-30');
    expect(periodRange(2026, 1).to).toBe('2026-01-31');
  });
});

describe('datev-extf.getBookingsForPeriod (db-mocked)', () => {
  it('issues a SQL with the brand + date range and maps rows', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, booking_date: new Date('2026-05-20T00:00:00Z'),
        belegnummer: 'B-1', description: 'Coaching',
        net_amount: 100, vat_amount: 19, skr_konto: '8400', type: 'income',
        inv_number: 'R-1', inv_gross: 119, inv_tax_mode: 'regelbesteuerung', inv_tax_rate: 19,
        cust_name: 'Alice', cust_company: 'ACME',
      }],
    });
    const out = await getBookingsForPeriod('mentolder', '2026-05-01', '2026-05-31');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      booking: {
        id: 1, bookingDate: '2026-05-20', belegnummer: 'B-1', description: 'Coaching',
        netAmount: 100, vatAmount: 19, skrKonto: '8400', type: 'income',
      },
      invoice: { number: 'R-1', grossAmount: 119, taxMode: 'regelbesteuerung', taxRate: 19 },
      customer: { name: 'Alice', company: 'ACME' },
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM eur_bookings eb/);
    expect(sql).toMatch(/LEFT JOIN billing_invoices bi/);
    expect(sql).toMatch(/eb\.brand = \$1/);
    expect(sql).toMatch(/eb\.booking_date BETWEEN \$2 AND \$3/);
    expect(params).toEqual(['mentolder', '2026-05-01', '2026-05-31']);
  });

  it('maps null invoice + null customer gracefully', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, booking_date: new Date('2026-05-20T00:00:00Z'),
        belegnummer: 'B-1', description: 'X',
        net_amount: 50, vat_amount: 0, skr_konto: '8400', type: 'income',
        inv_number: null, inv_gross: null, inv_tax_mode: null, inv_tax_rate: null,
        cust_name: null, cust_company: null,
      }],
    });
    const out = await getBookingsForPeriod('mentolder', '2026-05-01', '2026-05-31');
    expect(out[0].invoice).toBeNull();
    expect(out[0].customer).toBeNull();
  });
});
