import { it, expect } from 'vitest';
import { getYearRevenue, checkThreshold, TaxThresholdStatus } from './tax-monitor';

it('returns 0 revenue for empty brand', async () => {
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
