import { describe, it, expect } from 'vitest';
import { median, mean, computeDora } from './dora-metrics';
import type { DoraDeliveryRow } from './dora-metrics';

const merge = (over: Partial<DoraDeliveryRow>): DoraDeliveryRow => ({
  ticketId: 'T', type: 'feature', driver: 'factory',
  createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T10:00:00Z',
  prNumber: 1, reverted: false, ...over,
});

describe('median/mean', () => {
  it('median of an odd set', () => expect(median([3, 1, 2])).toBe(2));
  it('median of an even set averages the two middle values', () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it('median ignores nulls and returns null when empty', () => {
    expect(median([null, 5, null])).toBe(5);
    expect(median([null, null])).toBeNull();
  });
  it('mean ignores nulls and returns null when empty', () => {
    expect(mean([2, 4, null])).toBe(3);
    expect(mean([])).toBeNull();
  });
});

describe('computeDora', () => {
  it('Deployment Frequency counts merges and derives per-week', () => {
    const rows = [merge({ ticketId: 'A' }), merge({ ticketId: 'B' })];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.deploymentFrequency.merges).toBe(2);
    expect(m.deploymentFrequency.perWeek).toBe(2);
  });

  it('Lead Time reports both median and mean (hours)', () => {
    const rows = [
      merge({ ticketId: 'A', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T10:00:00Z' }), // 10h
      merge({ ticketId: 'B', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T20:00:00Z' }), // 20h
    ];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.leadTimeHours.median).toBe(15);
    expect(m.leadTimeHours.mean).toBe(15);
  });

  it('Change Failure Rate is (reverts + bugs)/merges and flagged as proxy', () => {
    const rows = [merge({ ticketId: 'A' }), merge({ ticketId: 'B', reverted: true }), merge({ ticketId: 'C' })];
    const bugs = [merge({ ticketId: 'BUG1', type: 'bug' })];
    const m = computeDora(rows, bugs, 7, '7d');
    // 1 revert + 1 bug = 2 over 3 merges
    expect(m.changeFailureRate.rate).toBeCloseTo(2 / 3, 5);
    expect(m.changeFailureRate.reverts).toBe(1);
    expect(m.changeFailureRate.bugs).toBe(1);
    expect(m.changeFailureRate.isProxy).toBe(true);
  });

  it('MTTR is the median bug recovery time (mergedAt − createdAt)', () => {
    const bugs = [
      merge({ ticketId: 'BUG1', type: 'bug', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T04:00:00Z' }), // 4h
      merge({ ticketId: 'BUG2', type: 'bug', createdAt: '2026-06-01T00:00:00Z', mergedAt: '2026-06-01T08:00:00Z' }), // 8h
    ];
    const m = computeDora([], bugs, 7, '7d');
    expect(m.mttrHours.median).toBe(6);
    expect(m.mttrHours.closedBugs).toBe(2);
  });

  it('MTTR is null (n/a) when there are no closed bugs', () => {
    const m = computeDora([merge({})], [], 7, '7d');
    expect(m.mttrHours.median).toBeNull();
    expect(m.mttrHours.closedBugs).toBe(0);
  });

  it('driverBreakdown counts merges per driver', () => {
    const rows = [merge({ ticketId: 'A', driver: 'factory' }), merge({ ticketId: 'B', driver: 'devflow' }), merge({ ticketId: 'C', driver: 'devflow' })];
    const m = computeDora(rows, [], 7, '7d');
    expect(m.driverBreakdown).toEqual({ factory: 1, devflow: 2 });
  });

  it('empty window yields zero merges and n/a rates without throwing', () => {
    const m = computeDora([], [], 7, '7d');
    expect(m.deploymentFrequency.merges).toBe(0);
    expect(m.leadTimeHours.median).toBeNull();
    expect(m.changeFailureRate.rate).toBeNull();
    expect(m.mttrHours.median).toBeNull();
  });
});
