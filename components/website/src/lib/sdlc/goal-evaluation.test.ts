import { describe, expect, it } from 'vitest';
import { evaluateGoal, finiteNumber } from './goal-evaluation';

describe('numeric goal evaluation', () => {
  it.each([
    ['le', 0, 0, 'achieved'], ['le', 5, 0, 'critical'],
    ['ge', 5, 5, 'achieved'], ['ge', 2, 5, 'critical'],
    ['eq', 5, 5, 'achieved'], ['eq', 7, 5, 'critical'],
    ['eq', 2, 5, 'critical'],
  ] as const)('%s preserves target truth for %s vs %s', (cmp, current, target, expected) => {
    const result = evaluateGoal(current, target, target, cmp);
    expect(result.status).toBe(expected);
    expect(result.percent).toBe(expected === 'achieved' ? 100 : 0);
  });
  it('can prove completion without baseline, but cannot invent progress', () => {
    expect(evaluateGoal(0, 0, null, 'le')).toEqual({ status: 'achieved', percent: 100 });
    expect(evaluateGoal(5, 0, null, 'le')).toEqual({ status: 'on_track', percent: null });
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, '', '   ', true, {}, []])(
    'rejects unmeasured numeric input %j', value => expect(finiteNumber(value)).toBeNull(),
  );
});
