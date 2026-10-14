import { evaluateGoal, directionComparison, finiteNumber, normalizeGoal, type GoalComparison } from './goal-evaluation';
import { pool } from '../db-pool';
import snapshotGoals from './goals-data.snapshot.json';
import type { GoalPriority, GoalDirection, GoalStatus, HealthGoal } from './goals-data';

export type { GoalPriority, GoalDirection, GoalStatus, HealthGoal };

export interface DbGoalRow {
  id: string;
  title: string;
  category: string;
  priority: string;
  direction: string;
  baseline: string | number | null;
  target: string | number | null;
  unit: string | null;
  measurement_cmd: string;
  active: boolean;
  current: string | number | null;
  status: string;
  measured_at: string | Date | null;
  git_sha: string | null;
  git_branch: string | null;
  details: unknown;
}

export function computeGoalStatus(
  current: number | null,
  target: number | null,
  baseline: number | null,
  direction: GoalDirection,
  rawStatus?: string
): GoalStatus {
  void rawStatus;
  return evaluateGoal(current, target, baseline, directionComparison(direction)).status;
}

/** Fetches live goals and latest measurements from Postgres with graceful fallback to snapshot. */
export async function getLiveRepoHealthGoals(): Promise<{ goals: HealthGoal[]; source: 'db' | 'snapshot' }> {
  try {
    const res = await pool.query<DbGoalRow>(`
      SELECT * FROM quality.v_repo_health_current WHERE active = TRUE ORDER BY id ASC;
    `);

    if (res.rows && res.rows.length > 0) {
      const goals: HealthGoal[] = res.rows.map((row) => {
        const cur = row.current !== null ? finiteNumber(row.current) : null;
        const definitionTarget = row.target !== null ? finiteNumber(row.target) : null;
        const base = row.baseline !== null ? finiteNumber(row.baseline) : null;
        const dir = (row.direction as GoalDirection) || 'lower';
        const details = row.details as { cmp?: GoalComparison; target?: number } | null;
        const cmp = details?.cmp;
        const comparison = cmp === 'le' || cmp === 'ge' || cmp === 'eq' ? cmp : directionComparison(dir);
        const tgt = (cmp === 'le' || cmp === 'ge' || cmp === 'eq') && details?.target !== undefined ? finiteNumber(details.target) : definitionTarget;
        const st = evaluateGoal(cur, tgt, base, comparison).status;

        return {
          id: row.id,
          title: row.title,
          category: row.category,
          priority: row.priority as GoalPriority,
          direction: dir,
          comparison,
          baseline: base,
          current: cur,
          target: tgt,
          unit: row.unit || '',
          status: st,
          measurement: row.measurement_cmd,
          source: `quality.repo_health_goals · ${row.id}`,
          measured_at: row.measured_at ? new Date(row.measured_at).toISOString() : '',
        };
      });

      return { goals, source: 'db' };
    }
  } catch {
    // Fail-soft: fallback to snapshot in isolated CI runner or when DB is not reachable
  }

  return { goals: (snapshotGoals as HealthGoal[]).map(g => normalizeGoal(g)), source: 'snapshot' };
}
