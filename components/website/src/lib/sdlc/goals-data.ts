import { evaluateGoal, directionComparison, normalizeGoal, type GoalDirection, type GoalStatus } from './goal-evaluation';
import rawGoals from './goals-data.generated.json';

export type GoalPriority = 'A' | 'B' | 'C';
export type { GoalDirection, GoalStatus } from './goal-evaluation';

export interface HealthGoal {
  id: string;
  title: string;
  category: string;
  priority: GoalPriority;
  direction: GoalDirection;
  comparison?: 'le' | 'ge' | 'eq';
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

/** Progress and status derive from the same numeric evidence. */
export function healthPercent(g: HealthGoal): number | null {
  return evaluateGoal(g.current, g.target, g.baseline, (g.comparison ?? directionComparison(g.direction))).percent;
}

const RAW_GOALS = rawGoals as HealthGoal[];
export const GOALS: HealthGoal[] = RAW_GOALS.map(g => normalizeGoal(g));
export const ACTIVE_GOALS = GOALS.filter(g => g.priority !== 'C' || g.status !== 'achieved');
export const GREEN_GATES = GOALS.filter(g => g.priority === 'C' && g.status === 'achieved');
export const CATEGORIES = [...new Set(GOALS.map(g => g.category))];
