import { pool } from '../db-pool';
import type { ScanResult } from './health-scan';
import { evaluateGoal } from './goal-evaluation';

/** One INSERT statement is atomic, without borrowing a transaction across pooled connections. */
export async function recordGoalMeasurements(results: ScanResult[], measuredAt: string): Promise<void> {
  if (results.length === 0) return;
  const values: unknown[] = [];
  const rows = results.map(result => {
    const current = result.measurable ? result.actual ?? null : null;
    const status = result.measurable && result.cmp
      ? evaluateGoal(current, result.target ?? null, null, result.cmp).status : 'unknown';
    const offset = values.length;
    values.push(result.id, current, status, measuredAt, result.git_sha ?? null, result.git_branch ?? null, JSON.stringify({
      source: 'rescan', cmp: result.cmp, target: result.target, measurable: result.measurable,
    }));
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::timestamptz, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`;
  });
  await pool.query(`INSERT INTO quality.repo_health_measurements
    (goal_id, current_value, status, measured_at, git_sha, git_branch, details) VALUES ${rows.join(', ')}`, values);
}
