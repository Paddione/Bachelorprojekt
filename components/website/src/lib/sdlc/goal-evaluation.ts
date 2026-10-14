export type GoalDirection = 'lower' | 'higher';
export type GoalStatus = 'critical' | 'at_risk' | 'on_track' | 'achieved' | 'unknown';

export type GoalComparison = 'le' | 'ge' | 'eq';
export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/** Numeric evidence is authoritative; cached status never substitutes for a measurement. */
export function evaluateGoal(current: number | null, target: number | null, baseline: number | null,
  comparison: GoalComparison): { status: GoalStatus; percent: number | null } {
  current = finiteNumber(current); target = finiteNumber(target); baseline = finiteNumber(baseline);
  if (current === null || target === null) return { status: 'unknown', percent: null };
  const met = comparison === 'le' ? current <= target : comparison === 'ge' ? current >= target : current === target;
  if (met) return { status: 'achieved', percent: 100 };
  if (baseline === null) return { status: 'on_track', percent: null };
  const range = Math.abs(target - baseline);
  if (range === 0) return { status: 'critical', percent: 0 };
  const progress = comparison === 'eq' ? (range - Math.abs(current - target)) / range
    : comparison === 'le' ? (baseline - current) / range : (current - baseline) / range;
  return { status: progress >= 0.8 ? 'on_track' : progress < 0 ? 'critical' : 'at_risk',
    percent: Math.max(0, Math.min(99, Math.round(progress * 100))) };
}
export function directionComparison(direction: GoalDirection): GoalComparison {
  return direction === 'higher' ? 'ge' : 'le';
}
interface NumericGoal {
  direction: GoalDirection;
  comparison?: GoalComparison;
  current: number | null;
  target: number | null;
  baseline: number | null;
  status: GoalStatus;
}
export function normalizeGoal<T extends NumericGoal>(goal: T, comparison = goal.comparison ?? directionComparison(goal.direction)): T {
  const current = finiteNumber(goal.current), target = finiteNumber(goal.target), baseline = finiteNumber(goal.baseline);
  return { ...goal, current, target, baseline, status: evaluateGoal(current, target, baseline, comparison).status };
}
