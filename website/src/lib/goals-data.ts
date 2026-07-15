import rawGoals from './goals-data.generated.json';

export type GoalPriority = 'A' | 'B' | 'C';
export type GoalDirection = 'lower' | 'higher';
export type GoalStatus = 'critical' | 'at_risk' | 'on_track' | 'achieved' | 'unknown';

export interface HealthGoal {
  id: string;
  title: string;
  category: string;
  priority: GoalPriority;
  direction: GoalDirection;
  baseline: number | null;
  current: number | null;
  target: number | null;
  unit: string;
  status: GoalStatus;
  measurement: string;
  source: string;
  measured_at: string;
  note?: string;
}

function computeStatus(g: HealthGoal): GoalStatus {
  if (g.status !== 'unknown') return g.status;
  if (g.current === null || g.target === null) return 'unknown';
  const met = g.direction === 'lower' ? g.current <= g.target : g.current >= g.target;
  if (met) return 'achieved';
  if (g.baseline === null) return 'on_track';
  const range = Math.abs(g.target - g.baseline);
  if (range === 0) return 'achieved';
  const progress = g.direction === 'lower'
    ? (g.baseline - g.current) / range
    : (g.current - g.baseline) / range;
  if (progress >= 0.8) return 'on_track';
  if (progress >= 0.3) return 'at_risk';
  return progress < 0 ? 'critical' : 'at_risk';
}

/** Health % [0–100]. Achieved = 100, unknown = null. */
export function healthPercent(g: HealthGoal): number | null {
  if (g.status === 'achieved') return 100;
  if (g.current === null || g.target === null || g.baseline === null) return null;
  const met = g.direction === 'lower' ? g.current <= g.target : g.current >= g.target;
  if (met) return 100;
  const range = Math.abs(g.target - g.baseline);
  if (range === 0) return 100;
  const raw = g.direction === 'lower'
    ? (g.baseline - g.current) / range
    : (g.current - g.baseline) / range;
  return Math.max(0, Math.min(99, Math.round(raw * 100)));
}

const RAW_GOALS = rawGoals as HealthGoal[];

export const GOALS: HealthGoal[] = RAW_GOALS.map(g => ({ ...g, status: computeStatus(g) }));

export const ACTIVE_GOALS = GOALS.filter(g => g.priority !== 'C' || g.status !== 'achieved');
export const GREEN_GATES  = GOALS.filter(g => g.priority === 'C' && g.status === 'achieved');

export const CATEGORIES = [...new Set(GOALS.map(g => g.category))];
