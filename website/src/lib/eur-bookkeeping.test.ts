import { it, expect, beforeAll } from 'vitest';
import { initEurTables } from './website-db';
import { addBooking, getEurSummary, addAsset, calculateSection15aCorrection } from './eur-bookkeeping';
import { calculateGewerbesteuer } from './eur-bookkeeping';

beforeAll(async () => { await initEurTables(); });

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
