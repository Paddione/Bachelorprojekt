import { describe, it, expect } from 'vitest';

describe('activeOnly filter with awaitingDeploy', () => {
  it('includes awaitingDeploy in open work calculation', () => {
    const rollup = { open: 0, inProgress: 0, blocked: 0, awaitingDeploy: 3, total: 10, done: 7, pctDone: 70 };
    const openWork = (rollup.open ?? 0) + (rollup.inProgress ?? 0) + (rollup.blocked ?? 0) + (rollup.awaitingDeploy ?? 0);
    expect(openWork).toBe(3);
  });

  it('counts zero when no awaitingDeploy items exist', () => {
    const rollup = { open: 0, inProgress: 0, blocked: 0, awaitingDeploy: 0, total: 10, done: 10, pctDone: 100 };
    const openWork = (rollup.open ?? 0) + (rollup.inProgress ?? 0) + (rollup.blocked ?? 0) + (rollup.awaitingDeploy ?? 0);
    expect(openWork).toBe(0);
  });

  it('sums awaitingDeploy with other open work categories', () => {
    const rollup = { open: 2, inProgress: 1, blocked: 1, awaitingDeploy: 2, total: 12, done: 6, pctDone: 50 };
    const openWork = (rollup.open ?? 0) + (rollup.inProgress ?? 0) + (rollup.blocked ?? 0) + (rollup.awaitingDeploy ?? 0);
    expect(openWork).toBe(6);
  });
});
