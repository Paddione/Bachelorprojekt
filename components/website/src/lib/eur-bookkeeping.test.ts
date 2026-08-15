import { it, expect, beforeAll, beforeEach, afterEach, describe, vi } from 'vitest';
import { initEurTables, pool } from './website-db';
import { addBooking, getEurSummary, addAsset, calculateSection15aCorrection } from './eur-bookkeeping';
import { calculateGewerbesteuer } from './eur-bookkeeping';

// The original suite below only exercises addBooking/addAsset against a
// *live* Postgres instance, which isn't available in every environment
// (sandboxes, CI without DATABASE_URL). Scope that gate to its own describe
// block via a local beforeEach — hooks declared at file scope in vitest
// apply to *every* test in the file (including ones added below that don't
// need a live DB), so the gate must not leak past this block.
describe('live DB integration (skipped without a reachable DB)', () => {
  let dbOk = false;
  beforeAll(async () => {
    try {
      await Promise.race([
        initEurTables(),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('db timeout')), 3000)),
      ]);
      dbOk = true;
    } catch { /* DB not available in this environment */ }
  }, 5000);
  beforeEach((ctx) => { if (!dbOk) ctx.skip(); });

  it('adds income booking and reflects in summary', async () => {
    await addBooking({
      brand:'test-eur', bookingDate:'2025-09-01', type:'income',
      category:'coaching', description:'Coaching Max', netAmount:60, vatAmount:0,
    });
    const s = await getEurSummary('test-eur', 2025);
    expect(s.totalIncome).toBeGreaterThanOrEqual(60);
    expect(s.profit).toBe(s.totalIncome - s.totalExpenses);
  });

  it('§15a: calculates 4/5 correction for laptop switching in year 2 of 5', async () => {
    const asset = await addAsset({
      brand:'test-eur', description:'Laptop', purchaseDate:'2025-01-15',
      netPurchasePrice:1000, vatPaid:190, usefulLifeMonths:60, isGwg:false,
    });
    const result = calculateSection15aCorrection(asset, new Date('2026-01-15'));
    // 190 € * (48/60) ≈ 152 €
    expect(result.eligible).toBe(true);
    expect(result.correctionAmount).toBeCloseTo(152, 1);
  });

  it('§15a: below 1000€ Vorsteuer threshold — not eligible', async () => {
    const asset = await addAsset({
      brand:'test-eur', description:'Maus', purchaseDate:'2025-01-15',
      netPurchasePrice:50, vatPaid:9.5, usefulLifeMonths:60, isGwg:false,
    });
    const result = calculateSection15aCorrection(asset, new Date('2026-01-15'));
    expect(result.eligible).toBe(false);
  });
});

it('Gewerbesteuer Lübbecke — 50.000 € Gewinn', () => {
  const result = calculateGewerbesteuer({ profit: 50_000, hebesatz: 417 });
  // Gewerbeertrag: 50.000 - 24.500 = 25.500 → rounded to 25.500 (already multiple of 100)
  expect(result.gewerbeertrag).toBe(25_500);
  expect(result.messbetrag).toBeCloseTo(892.50, 1);
  expect(result.gewerbesteuer).toBeCloseTo(3721.73, 0);
});

it('Gewerbesteuer — below Freibetrag', () => {
  const result = calculateGewerbesteuer({ profit: 20_000, hebesatz: 417 });
  expect(result.gewerbesteuer).toBe(0);
});

it('§15a: Berichtigungszeitraum abgelaufen — remainingMonths === 0', () => {
  const asset = {
    id: 1, brand: 'test-eur', description: 'Altes Notebook', purchaseDate: '2015-01-01',
    netPurchasePrice: 2000, vatPaid: 380, usefulLifeMonths: 36, isGwg: false,
  };
  // 10 years later — way past the 36-month correction window.
  const result = calculateSection15aCorrection(asset, new Date('2025-01-01'));
  expect(result.eligible).toBe(false);
  expect(result.reason).toBe('Berichtigungszeitraum abgelaufen');
  expect(result.correctionAmount).toBe(0);
  expect(result.remainingMonths).toBe(0);
});

it('Gewerbesteuer: Kapitalgesellschaft — no Freibetrag applied', () => {
  const withFreibetrag = calculateGewerbesteuer({ profit: 20_000, hebesatz: 417 });
  const kapges = calculateGewerbesteuer({ profit: 20_000, hebesatz: 417, isKapitalgesellschaft: true });
  expect(withFreibetrag.gewerbesteuer).toBe(0); // below Freibetrag for natural persons
  expect(kapges.gewerbesteuer).toBeGreaterThan(0); // Kapitalgesellschaft has no Freibetrag
  expect(kapges.gewerbeertrag).toBe(20_000);
});

it('Gewerbesteuer: applies hinzurechnungen and kuerzungen', () => {
  const base = calculateGewerbesteuer({ profit: 50_000, hebesatz: 417 });
  const withAdjustments = calculateGewerbesteuer({
    profit: 50_000, hebesatz: 417, hinzurechnungen: 5_000, kuerzungen: 2_000,
  });
  // rawErtrag = 50000 + 5000 - 2000 = 53000 vs base rawErtrag = 50000
  expect(withAdjustments.gewerbeertrag).toBeGreaterThan(base.gewerbeertrag);
});

describe('DB-backed functions (mocked pool)', () => {
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO eur_bookings')) {
        const p = params ?? [];
        return {
          rows: [{
            id: 42,
            brand: p[0],
            booking_date: new Date(p[1] as string),
            type: p[2],
            category: p[3],
            description: p[4],
            net_amount: p[5],
            vat_amount: p[6],
            invoice_id: p[7],
            receipt_path: p[8],
            belegnummer: p[9],
            skr_konto: p[10],
          }],
        };
      }
      if (sql.includes('INSERT INTO assets')) {
        const p = params ?? [];
        return {
          rows: [{
            id: 7,
            brand: p[0],
            description: p[1],
            purchase_date: new Date(p[2] as string),
            net_purchase_price: p[3],
            vat_paid: p[4],
            useful_life_months: p[5],
            correction_start_date: p[6] ? new Date(p[6] as string) : null,
            is_gwg: p[7],
          }],
        };
      }
      if (sql.includes('SELECT type, SUM(net_amount)')) {
        return { rows: mockSummaryRows };
      }
      return { rows: [] };
    });
    vi.spyOn(pool, 'query').mockImplementation(queryMock as unknown as typeof pool.query);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  let mockSummaryRows: Array<{ type: string; net: string; vat: string }> = [];

  it('addBooking auto-generates belegnummer from invoiceId when belegnummer not given', async () => {
    const b = await addBooking({
      brand: 'test-eur', bookingDate: '2025-09-01', type: 'income',
      category: 'coaching', description: 'X', netAmount: 100, vatAmount: 0,
      invoiceId: 'INVOICE-1234567890',
    });
    expect(b.belegnummer).toBe(`INV-${'INVOICE-1234567890'.slice(0, 8)}`);
    expect(b.invoiceId).toBe('INVOICE-1234567890');
  });

  it('addBooking auto-generates MAN-<timestamp> belegnummer when neither belegnummer nor invoiceId given', async () => {
    const before = Date.now();
    const b = await addBooking({
      brand: 'test-eur', bookingDate: '2025-09-01', type: 'expense',
      category: 'sonstiges', description: 'X', netAmount: 50, vatAmount: 9.5,
    });
    expect(b.belegnummer).toMatch(/^MAN-\d+$/);
    const ts = Number(b.belegnummer!.replace('MAN-', ''));
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('addBooking uses the explicit belegnummer when given (no auto-generation)', async () => {
    const b = await addBooking({
      brand: 'test-eur', bookingDate: '2025-09-01', type: 'income',
      category: 'coaching', description: 'X', netAmount: 100, vatAmount: 0,
      belegnummer: 'RE-2025-001', invoiceId: 'ignored-invoice-id',
    });
    expect(b.belegnummer).toBe('RE-2025-001');
  });

  it('addBooking derives skrKonto via skrAccountFor when skrKonto not given', async () => {
    const b = await addBooking({
      brand: 'test-eur', bookingDate: '2025-09-01', type: 'income',
      category: 'coaching', description: 'X', netAmount: 100, vatAmount: 0,
    });
    expect(b.skrKonto).toBe('8400'); // regelbesteuerung income default
  });

  it('addBooking uses an explicit skrKonto override', async () => {
    const b = await addBooking({
      brand: 'test-eur', bookingDate: '2025-09-01', type: 'income',
      category: 'coaching', description: 'X', netAmount: 100, vatAmount: 0,
      skrKonto: '9999',
    });
    expect(b.skrKonto).toBe('9999');
  });

  it('getEurSummary combines income+vat_refund and expense+pretax+vat_payment, with vat/pretax totals', async () => {
    mockSummaryRows = [
      { type: 'income', net: '1000', vat: '190' },
      { type: 'vat_refund', net: '50', vat: '0' },
      { type: 'expense', net: '300', vat: '57' },
      { type: 'pretax', net: '20', vat: '0' },
      { type: 'vat_payment', net: '10', vat: '0' },
    ];
    const s = await getEurSummary('test-eur', 2025);
    expect(s.totalIncome).toBe(1050); // 1000 + 50
    expect(s.totalExpenses).toBe(330); // 300 + 20 + 10
    expect(s.totalVatCollected).toBe(190);
    expect(s.totalPretax).toBe(20);
    expect(s.profit).toBe(1050 - 330);
  });

  it('getEurSummary returns all-zero summary when there are no bookings', async () => {
    mockSummaryRows = [];
    const s = await getEurSummary('empty-brand', 2099);
    expect(s.totalIncome).toBe(0);
    expect(s.totalExpenses).toBe(0);
    expect(s.totalVatCollected).toBe(0);
    expect(s.totalPretax).toBe(0);
    expect(s.profit).toBe(0);
    expect(s.year).toBe(2099);
  });

  it('addAsset defaults isGwg to false and correctionStartDate to undefined when omitted', async () => {
    const asset = await addAsset({
      brand: 'test-eur', description: 'Drucker', purchaseDate: '2025-02-01',
      netPurchasePrice: 500, vatPaid: 95, usefulLifeMonths: 36,
    } as Parameters<typeof addAsset>[0]);
    expect(asset.isGwg).toBe(false);
    expect(asset.correctionStartDate).toBeUndefined();
  });

  it('addAsset persists an explicit correctionStartDate and isGwg=true', async () => {
    const asset = await addAsset({
      brand: 'test-eur', description: 'Handy', purchaseDate: '2025-02-01',
      netPurchasePrice: 400, vatPaid: 76, usefulLifeMonths: 24,
      correctionStartDate: '2025-03-01', isGwg: true,
    });
    expect(asset.isGwg).toBe(true);
    expect(asset.correctionStartDate).toBe('2025-03-01');
  });
});
