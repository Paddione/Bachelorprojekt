// Persistenz frischer Rescan-Messungen nach quality.repo_health_measurements (T016657).
// Ein einziges parametrisiertes INSERT … SELECT FROM unnest(…) — Postgres schreibt
// alle Zeilen atomar oder keine. Fehler werden nicht verschluckt: der Aufrufer
// meldet ohne erfolgreiche Speicherung keinen Erfolg.
import { pool } from '../db-pool';
import { evaluateGoal, toFiniteNumber } from './goal-evaluation';
import type { ScanResult } from './health-scan';

export interface MeasurementOrigin {
  /** Baseline je Ziel-ID aus der Zieldefinition (für den Fortschritt). */
  baselines: ReadonlyMap<string, number | null>;
  gitSha: string | null;
  gitBranch: string | null;
  source: string;
}

export interface MeasurementRow {
  goalId: string;
  current: number | null;
  status: string;
  details: string;
}

/** Nicht messbare Ziele werden als unknown ohne Zahl festgehalten — nie als erfundenes Grün. */
export function toMeasurementRows(results: ScanResult[], origin: MeasurementOrigin): MeasurementRow[] {
  return results.map((r) => {
    const current = r.measurable ? toFiniteNumber(r.actual) : null;
    const target = r.measurable ? toFiniteNumber(r.target) : null;
    const { status } = evaluateGoal({
      current, target, cmp: r.cmp, baseline: origin.baselines.get(r.id) ?? null,
    });
    const details = JSON.stringify({
      source: origin.source, measurable: r.measurable, cmp: r.cmp ?? null, target,
    });
    return { goalId: r.id, current, status, details };
  });
}

const INSERT_SQL = `
  INSERT INTO quality.repo_health_measurements
    (goal_id, current_value, status, git_sha, git_branch, details)
  SELECT m.goal_id, m.current_value, m.status, $4, $5, m.details::jsonb
  FROM unnest($1::text[], $2::numeric[], $3::text[], $6::text[])
    AS m(goal_id, current_value, status, details)`;

export async function recordScanMeasurements(results: ScanResult[], origin: MeasurementOrigin): Promise<number> {
  const rows = toMeasurementRows(results, origin);
  if (rows.length === 0) return 0;
  await pool.query(INSERT_SQL, [
    rows.map((r) => r.goalId),
    rows.map((r) => r.current),
    rows.map((r) => r.status),
    origin.gitSha,
    origin.gitBranch,
    rows.map((r) => r.details),
  ]);
  return rows.length;
}
