import rawGoals from './goals-data.generated.json';

import { evaluateGoal, type GoalDirection, type GoalStatus } from './goal-evaluation';

export type { GoalDirection, GoalStatus };
export type GoalPriority = 'A' | 'B' | 'C';

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

/** Status und Prozent aus derselben numerischen Wahrheit; gespeicherter Status zählt nicht. */
function evaluate(g: HealthGoal) {
  return evaluateGoal({ current: g.current, target: g.target, baseline: g.baseline, direction: g.direction });
}

/** Health % [0–100]; unknown oder nicht belastbar bestimmbar = null. */
export function healthPercent(g: HealthGoal): number | null {
  return evaluate(g).percent;
}

/** Normalisiert ein Ziel aus beliebiger Quelle (generiert, DB, Snapshot); measured_at/source bleiben erhalten. */
export function normalizeGoal(g: HealthGoal): HealthGoal {
  return { ...g, status: evaluate(g).status };
}

const RAW_GOALS = rawGoals as HealthGoal[];

export const GOALS: HealthGoal[] = RAW_GOALS.map(normalizeGoal);

export const ACTIVE_GOALS = GOALS.filter(g => g.priority !== 'C' || g.status !== 'achieved');
export const GREEN_GATES  = GOALS.filter(g => g.priority === 'C' && g.status === 'achieved');

export const CATEGORIES = [...new Set(GOALS.map(g => g.category))];
