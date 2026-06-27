import { describe, it, expect } from 'vitest';
import {
  TaxThresholdStatus,
  THRESHOLD_KLEIN,
  THRESHOLD_WARNING,
  THRESHOLD_HARD,
  checkThreshold,
} from './tax-monitor';

describe('tax-monitor constants', () => {
  it('exposes the expected thresholds', () => {
    expect(THRESHOLD_WARNING).toBe(20_000);
    expect(THRESHOLD_KLEIN).toBe(25_000);
    expect(THRESHOLD_HARD).toBe(100_000);
  });
});

describe('checkThreshold', () => {
  it('returns Safe below the warning threshold', () => {
    expect(checkThreshold(0)).toBe(TaxThresholdStatus.Safe);
    expect(checkThreshold(THRESHOLD_WARNING - 1)).toBe(TaxThresholdStatus.Safe);
  });

  it('returns Warning at and above the warning threshold', () => {
    expect(checkThreshold(THRESHOLD_WARNING)).toBe(TaxThresholdStatus.Warning);
  });

  it('returns Exceeded at and above the kleinunternehmer threshold', () => {
    expect(checkThreshold(THRESHOLD_KLEIN)).toBe(TaxThresholdStatus.Exceeded);
  });

  it('returns HardExceeded at and above the hard threshold', () => {
    expect(checkThreshold(THRESHOLD_HARD)).toBe(TaxThresholdStatus.HardExceeded);
    expect(checkThreshold(THRESHOLD_HARD + 1)).toBe(TaxThresholdStatus.HardExceeded);
  });
});
