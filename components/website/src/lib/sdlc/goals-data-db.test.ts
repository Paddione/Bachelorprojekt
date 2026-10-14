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

it('preserves timestamp and scanner comparison/target when definitions differ', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 'G-TEST', title: 'Test', category: 'Test', priority: 'B',
    direction: 'lower', baseline: 5, target: 0, current: 1, status: 'achieved',
    measured_at: '2026-10-14T12:34:56Z', unit: '', measurement_cmd: '',
    details: { cmp: 'eq', target: 1 } }] });
  const result = await getLiveRepoHealthGoals();
  expect(result.goals[0]).toMatchObject({ status: 'achieved', target: 1, comparison: 'eq',
    measured_at: '2026-10-14T12:34:56.000Z' });
});
