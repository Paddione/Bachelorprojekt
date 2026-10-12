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
  if (rawStatus && rawStatus !== 'unknown') {
    return rawStatus as GoalStatus;
  }
  if (current === null || target === null) return 'unknown';
  const met = direction === 'lower' ? current <= target : current >= target;
  if (met) return 'achieved';
  if (baseline === null) return 'on_track';
  const range = Math.abs(target - baseline);
  if (range === 0) return 'achieved';
  const progress = direction === 'lower'
    ? (baseline - current) / range
    : (current - baseline) / range;
  if (progress >= 0.8) return 'on_track';
  if (progress >= 0.3) return 'at_risk';
  return progress < 0 ? 'critical' : 'at_risk';
}

/** Fetches live goals and latest measurements from Postgres with graceful fallback to snapshot. */
export async function getLiveRepoHealthGoals(): Promise<{ goals: HealthGoal[]; source: 'db' | 'snapshot' }> {
  try {
    const res = await pool.query<DbGoalRow>(`
      SELECT * FROM quality.v_repo_health_current WHERE active = TRUE ORDER BY id ASC;
    `);

    if (res.rows && res.rows.length > 0) {
      const goals: HealthGoal[] = res.rows.map((row) => {
        const cur = row.current !== null ? Number(row.current) : null;
        const tgt = row.target !== null ? Number(row.target) : null;
        const base = row.baseline !== null ? Number(row.baseline) : null;
        const dir = (row.direction as GoalDirection) || 'lower';
        const st = computeGoalStatus(cur, tgt, base, dir, row.status);

        return {
          id: row.id,
          title: row.title,
          category: row.category,
          priority: row.priority as GoalPriority,
          direction: dir,
          baseline: base,
          current: cur,
          target: tgt,
          unit: row.unit || '',
          status: st,
          measurement: row.measurement_cmd,
          source: `quality.repo_health_goals · ${row.id}`,
          measured_at: row.measured_at ? new Date(row.measured_at).toISOString().split('T')[0] : '',
        };
      });

      return { goals, source: 'db' };
    }
  } catch {
    // Fail-soft: fallback to snapshot in isolated CI runner or when DB is not reachable
  }

  return { goals: snapshotGoals as HealthGoal[], source: 'snapshot' };
}
