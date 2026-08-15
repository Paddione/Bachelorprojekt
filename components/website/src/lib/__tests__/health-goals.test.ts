import { describe, it, expect } from 'vitest';

describe('Health Goals Calculation', () => {
  it('correctly evaluates healthy status when latency and error rate are within threshold', () => {
    const latencyMs = 120;
    const errorRatePct = 0.05;
    const maxLatencyMs = 500;
    const maxErrorRatePct = 0.10;

    const isHealthy = latencyMs <= maxLatencyMs && errorRatePct <= maxErrorRatePct;
    expect(isHealthy).toBe(true);
  });

  it('evaluates degraded/unhealthy status when threshold is exceeded', () => {
    const latencyMs = 600;
    const maxLatencyMs = 500;

    const isHealthy = latencyMs <= maxLatencyMs;
    expect(isHealthy).toBe(false);
  });
});
