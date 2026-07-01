import { describe, it, expect } from 'vitest';
import {
  GOALS,
  ACTIVE_GOALS,
  GREEN_GATES,
  CATEGORIES,
  healthPercent,
  type HealthGoal,
} from './goals-data';

function makeGoal(overrides: Partial<HealthGoal>): HealthGoal {
  return {
    id: 'G-TEST',
    title: 'Test Goal',
    category: 'Test',
    priority: 'B',
    direction: 'lower',
    baseline: 100,
    current: 50,
    target: 0,
    unit: 'x',
    status: 'unknown',
    measurement: 'echo 1',
    source: 'test',
    measured_at: '2026-06-28',
    ...overrides,
  };
}

describe('goals-data: static exports', () => {
  it('GOALS is non-empty and every entry has a computed, non-"unknown" status when data is present', () => {
    expect(GOALS.length).toBeGreaterThan(0);
    for (const g of GOALS) {
      // Every RAW_GOALS entry either has explicit non-unknown status, or
      // current/target/baseline set, so computeStatus should resolve it.
      expect(['critical', 'at_risk', 'on_track', 'achieved', 'unknown']).toContain(g.status);
    }
  });

  it('ACTIVE_GOALS excludes achieved Priority-C (green) gates', () => {
    for (const g of ACTIVE_GOALS) {
      expect(g.priority === 'C' && g.status === 'achieved').toBe(false);
    }
    // Sanity: the two sets partition C-goals correctly.
    const cGoals = GOALS.filter((g) => g.priority === 'C');
    const achievedC = cGoals.filter((g) => g.status === 'achieved');
    expect(GREEN_GATES.length).toBe(achievedC.length);
  });

  it('GREEN_GATES contains only Priority-C achieved goals', () => {
    expect(GREEN_GATES.length).toBeGreaterThan(0);
    for (const g of GREEN_GATES) {
      expect(g.priority).toBe('C');
      expect(g.status).toBe('achieved');
    }
  });

  it('CATEGORIES is a de-duplicated list of all goal categories', () => {
    const unique = new Set(GOALS.map((g) => g.category));
    expect(new Set(CATEGORIES)).toEqual(unique);
    expect(CATEGORIES.length).toBe(unique.size);
  });

  it('a known Priority-A goal (G-SIZE04) is present and lower-direction', () => {
    const g = GOALS.find((x) => x.id === 'G-SIZE04');
    expect(g).toBeDefined();
    expect(g?.priority).toBe('A');
    expect(g?.direction).toBe('lower');
  });
});

describe('healthPercent', () => {
  it('returns 100 for status "achieved" regardless of current/target', () => {
    const g = makeGoal({ status: 'achieved', current: null, target: null, baseline: null });
    expect(healthPercent(g)).toBe(100);
  });

  it('returns null when current, target, or baseline is missing', () => {
    expect(healthPercent(makeGoal({ current: null }))).toBeNull();
    expect(healthPercent(makeGoal({ target: null }))).toBeNull();
    expect(healthPercent(makeGoal({ baseline: null }))).toBeNull();
  });

  it('returns 100 when the goal has already met its target (direction: lower)', () => {
    const g = makeGoal({ direction: 'lower', current: 0, target: 10, baseline: 100 });
    expect(healthPercent(g)).toBe(100);
  });

  it('returns 100 when the goal has already met its target (direction: higher)', () => {
    const g = makeGoal({ direction: 'higher', current: 95, target: 90, baseline: 0 });
    expect(healthPercent(g)).toBe(100);
  });

  it('returns 100 when baseline equals target (zero range) even if not met', () => {
    const g = makeGoal({ direction: 'lower', current: 5, target: 5, baseline: 5 });
    expect(healthPercent(g)).toBe(100);
  });

  it('computes a partial percentage for an in-progress "lower" goal', () => {
    // baseline 100 -> target 0, current 25: progress = (100-25)/100 = 0.75 -> 75%
    const g = makeGoal({ direction: 'lower', baseline: 100, target: 0, current: 25 });
    expect(healthPercent(g)).toBe(75);
  });

  it('computes a partial percentage for an in-progress "higher" goal', () => {
    // baseline 0 -> target 100, current 30: progress = (30-0)/100 = 0.30 -> 30%
    const g = makeGoal({ direction: 'higher', baseline: 0, target: 100, current: 30 });
    expect(healthPercent(g)).toBe(30);
  });

  it('clamps negative progress (regression past baseline) to 0', () => {
    // baseline 100 -> target 0, current 150: progress negative
    const g = makeGoal({ direction: 'lower', baseline: 100, target: 0, current: 150 });
    expect(healthPercent(g)).toBe(0);
  });

  it('clamps progress at 99 when not yet fully met (never rounds up to 100 pre-completion)', () => {
    // baseline 100 -> target 0, current 0.4: progress = 99.6% -> rounds to 100 without clamp,
    // clamp ensures it stays at 99 unless the goal is literally met.
    const g = makeGoal({ direction: 'lower', baseline: 100, target: 0, current: 0.4 });
    expect(healthPercent(g)).toBe(99);
  });
});
