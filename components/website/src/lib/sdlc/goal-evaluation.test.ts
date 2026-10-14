import { describe, expect, it } from 'vitest';
import { evaluateGoal, toFiniteNumber } from './goal-evaluation';

describe('evaluateGoal comparisons', () => {
  it.each([
    ['le', 0, 0, 'achieved'], ['le', 5, 0, 'on_track'],
    ['ge', 7, 5, 'achieved'], ['ge', 2, 5, 'on_track'],
    ['eq', 5, 5, 'achieved'], ['eq', 7, 5, 'on_track'], ['eq', 2, 5, 'on_track'],
  ] as const)('%s current=%d target=%d without baseline → %s', (cmp, current, target, status) => {
    expect(evaluateGoal({ current, target, cmp }).status).toBe(status);
  });

  it('treats target 0 as a real target, not as missing', () => {
    expect(evaluateGoal({ current: 1, target: 0, baseline: 10, direction: 'lower' }))
      .toEqual({ status: 'on_track', percent: 90 });
  });

  it('a regression from baseline==target is critical with 0 %', () => {
    expect(evaluateGoal({ current: 5, target: 0, baseline: 0, direction: 'lower' }))
      .toEqual({ status: 'critical', percent: 0 });
    expect(evaluateGoal({ current: 4, target: 5, baseline: 5, cmp: 'eq' }))
      .toEqual({ status: 'critical', percent: 0 });
  });

  it('eq measures distance to the target from both sides', () => {
    expect(evaluateGoal({ current: 9, target: 10, baseline: 0, cmp: 'eq' }).percent).toBe(90);
    expect(evaluateGoal({ current: 11, target: 10, baseline: 0, cmp: 'eq' }).percent).toBe(90);
  });

  it('explicit cmp from a scan wins over the stored direction', () => {
    expect(evaluateGoal({ current: 7, target: 5, direction: 'lower', cmp: 'ge' }).status).toBe('achieved');
  });

  it('missing baseline keeps a met goal achieved and an unmet goal without percentage', () => {
    expect(evaluateGoal({ current: 0, target: 0, direction: 'lower' })).toEqual({ status: 'achieved', percent: 100 });
    expect(evaluateGoal({ current: 3, target: 0, direction: 'lower' })).toEqual({ status: 'on_track', percent: null });
  });

  it.each([null, undefined, NaN, Infinity, 'n/a', ''])('missing or nonfinite current %s is unknown', current => {
    expect(evaluateGoal({ current, target: 0, baseline: 10 })).toEqual({ status: 'unknown', percent: null });
  });
});

describe('toFiniteNumber', () => {
  it('accepts numeric strings from NUMERIC columns and rejects everything else', () => {
    expect(toFiniteNumber('12.5')).toBe(12.5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber('abc')).toBeNull();
    expect(toFiniteNumber(true)).toBeNull();
    expect(toFiniteNumber(-Infinity)).toBeNull();
  });
});
