import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

describe.skipIf(!dbAvailable)('archive schema', () => {
  beforeAll(async () => {
    // initDb in questionnaire-db.ts runs at module load via top-level await
    await import('./questionnaire-db');
  });

  it('creates questionnaire_assignment_scores table', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.questionnaire_assignment_scores') AS t`,
    );
    expect(r.rows[0].t).toBe('questionnaire_assignment_scores');
  });

  it('table has expected columns', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='questionnaire_assignment_scores'
       ORDER BY ordinal_position`,
    );
    const cols = r.rows.map((x: { column_name: string }) => x.column_name);
    expect(cols).toEqual([
      'id', 'assignment_id', 'dimension_id', 'dimension_name',
      'final_score', 'threshold_mid', 'threshold_high', 'level', 'snapshot_at',
    ]);
  });

  it('table has unique (assignment_id, dimension_id) constraint', async () => {
    const r = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename='questionnaire_assignment_scores'
         AND indexdef ILIKE '%UNIQUE%'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('creates bachelorprojekt.v_questionnaire_kpi view', async () => {
    const r = await pool.query(
      `SELECT to_regclass('bachelorprojekt.v_questionnaire_kpi') AS t`,
    );
    expect(r.rows[0].t).toBe('bachelorprojekt.v_questionnaire_kpi');
  });

  it('view exposes evidence_count + latest_evidence_id columns', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='bachelorprojekt' AND table_name='v_questionnaire_kpi'`,
    );
    const cols = r.rows.map((x: { column_name: string }) => x.column_name);
    expect(cols).toContain('evidence_count');
    expect(cols).toContain('latest_evidence_id');
  });
});
