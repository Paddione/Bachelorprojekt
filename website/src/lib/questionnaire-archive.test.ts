import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';
import {
  createQTemplate, upsertQDimension, upsertQQuestion, replaceQAnswerOptions,
  createQAssignment, updateQAssignment, upsertQAnswer, getQAssignment,
} from './questionnaire-db';
import { archiveQAssignment } from './questionnaire-db';
import { randomUUID } from 'crypto';

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

describe.skipIf(!dbAvailable)('archiveQAssignment', () => {
  async function seedSubmittedAssignment() {
    const tpl = await createQTemplate({
      title: `archive-test-${randomUUID().slice(0, 8)}`,
      description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'TestDim', position: 0,
      thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0,
      questionText: 'q?', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '5', label: 'high', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({
      customerId: randomUUID(), templateId: tpl.id,
    });
    await upsertQAnswer({
      assignmentId: a.id, questionId: q.id, optionKey: '5',
    });
    await updateQAssignment(a.id, { status: 'submitted' });
    return { tpl, dim, q, a };
  }

  it('writes one snapshot row per dimension and flips status to archived', async () => {
    const { dim, a } = await seedSubmittedAssignment();
    const result = await archiveQAssignment(a.id);
    expect('assignment' in result).toBe(true);
    if (!('assignment' in result)) return;
    expect(result.assignment.status).toBe('archived');
    expect(result.assignment.archived_at).not.toBeNull();
    const snap = await pool.query(
      `SELECT dimension_id, dimension_name, final_score, level
         FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(snap.rows.length).toBe(1);
    expect(snap.rows[0].dimension_id).toBe(dim.id);
    expect(snap.rows[0].dimension_name).toBe('TestDim');
    expect(snap.rows[0].final_score).toBe(5);
    expect(snap.rows[0].level).toBe('mittel');
  });

  it('rejects non-archivable statuses with a reason', async () => {
    const tpl = await createQTemplate({
      title: `reject-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({
      customerId: randomUUID(), templateId: tpl.id,
    });
    const result = await archiveQAssignment(a.id);
    expect('reason' in result).toBe(true);
    if ('reason' in result) {
      expect(result.reason).toBe('not_archivable');
      expect(result.status).toBe('pending');
    }
  });

  it('returns not_found for missing id', async () => {
    const result = await archiveQAssignment(randomUUID());
    expect('reason' in result && result.reason).toBe('not_found');
  });

  it('is idempotent: re-archiving an archived row leaves snapshot intact', async () => {
    const { a } = await seedSubmittedAssignment();
    await archiveQAssignment(a.id);
    const before = await pool.query(
      `SELECT id, snapshot_at FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    const result2 = await archiveQAssignment(a.id);
    expect('assignment' in result2).toBe(true);
    const after = await pool.query(
      `SELECT id, snapshot_at FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(after.rows.map(r => r.id).sort()).toEqual(before.rows.map(r => r.id).sort());
  });
});
