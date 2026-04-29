import { it, expect, beforeAll } from 'vitest';
import { getYearRevenue, checkThreshold, TaxThresholdStatus } from './tax-monitor';
import { initTaxMonitorTables } from './website-db';

let dbOk = false;
beforeAll(async () => {
  try {
    await Promise.race([
      initTaxMonitorTables(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('db timeout')), 3000)),
    ]);
    dbOk = true;
  } catch { /* DB not available in this environment */ }
}, 5000);

it('returns 0 revenue for empty brand', async (ctx) => {
  if (!dbOk) return ctx.skip();
  const r = await getYearRevenue('test-empty', 2025);
  expect(r).toBe(0);
});

it('correctly classifies threshold status', () => {
  expect(checkThreshold(0)).toBe(TaxThresholdStatus.Safe);
  expect(checkThreshold(20000)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(24999)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(25000)).toBe(TaxThresholdStatus.Exceeded);
  expect(checkThreshold(100001)).toBe(TaxThresholdStatus.HardExceeded);
});
