import { describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../db-pool', () => ({ pool: { query } }));
const { computeGoalStatus, getLiveRepoHealthGoals } = await import('./goals-data-db');

describe('health goal evidence integrity', () => {
  it('does not label a regression from a zero baseline achieved', () => {
    expect(computeGoalStatus(5, 0, 0, 'lower')).toBe('critical');
  });
  it('recomputes numeric truth instead of accepting obsolete stored green', () => {
    expect(computeGoalStatus(5, 0, 0, 'lower', 'achieved')).toBe('critical');
  });
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite current %s', current => {
    expect(computeGoalStatus(current, 0, 10, 'lower')).toBe('unknown');
  });
  it('does not promote missing current from a cached achieved status', () => {
    expect(computeGoalStatus(null, 0, 10, 'lower', 'achieved')).toBe('unknown');
  });
  it('normalizes snapshot evidence when database is unavailable', async () => {
    query.mockRejectedValueOnce(new Error('offline'));
    const result = await getLiveRepoHealthGoals();
    expect(result.source).toBe('snapshot');
    const measurable = result.goals.filter(g => g.current !== null && g.target !== null);
    expect(measurable.length).toBeGreaterThan(0);
    expect(measurable.some(g => g.status === 'unknown')).toBe(false);
  });
});
