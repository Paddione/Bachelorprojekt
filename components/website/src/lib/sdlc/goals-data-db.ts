import { pool } from '../db-pool';
import snapshotGoals from './goals-data.snapshot.json';
import { normalizeGoal, type GoalPriority, type GoalDirection, type GoalStatus, type HealthGoal } from './goals-data';
import { evaluateGoal, toFiniteNumber } from './goal-evaluation';

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

/**
 * Status aus numerischer Evidenz. Der gespeicherte Status wird bewusst ignoriert:
 * er darf aktuelle Zahlen weder überstimmen noch fehlende Evidenz ersetzen.
 */
export function computeGoalStatus(
  current: number | null,
  target: number | null,
  baseline: number | null,
  direction: GoalDirection,
  _storedStatus?: string
): GoalStatus {
  return evaluateGoal({ current, target, baseline, direction }).status;
}

function directionOf(raw: string): GoalDirection {
  return raw === 'higher' ? 'higher' : 'lower';
}

/** measured_at der Messung unverändert (ISO), leer wenn es keine Messung gibt. */
function measuredAtOf(raw: string | Date | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function fromDbRow(row: DbGoalRow): HealthGoal {
  return normalizeGoal({
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority as GoalPriority,
    direction: directionOf(row.direction),
    baseline: toFiniteNumber(row.baseline),
    current: toFiniteNumber(row.current),
    target: toFiniteNumber(row.target),
    unit: row.unit || '',
    status: 'unknown',
    measurement: row.measurement_cmd,
    source: `quality.repo_health_measurements · ${row.id}${row.git_sha ? ` @ ${row.git_sha}` : ''}`,
    measured_at: measuredAtOf(row.measured_at),
  });
}

/** Fetches live goals and latest measurements from Postgres with graceful fallback to snapshot. */
export async function getLiveRepoHealthGoals(): Promise<{ goals: HealthGoal[]; source: 'db' | 'snapshot' }> {
  try {
    const res = await pool.query<DbGoalRow>(`
      SELECT * FROM quality.v_repo_health_current WHERE active = TRUE ORDER BY id ASC;
    `);

    if (res.rows && res.rows.length > 0) {
      return { goals: res.rows.map(fromDbRow), source: 'db' };
    }
  } catch {
    // Fail-soft: fallback to snapshot in isolated CI runner or when DB is not reachable
  }

  return { goals: (snapshotGoals as HealthGoal[]).map(normalizeGoal), source: 'snapshot' };
}
