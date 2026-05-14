import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';
import {
  createQTemplate, upsertQDimension, upsertQQuestion, replaceQAnswerOptions,
  createQAssignment, updateQAssignment, upsertQAnswer, getQAssignment,
  listArchivedScores, listEvidenceByAssignment,
} from './questionnaire-db';
import { archiveQAssignment, reassignQAssignment } from './questionnaire-db';
import { getDisplayScores } from './compute-scores';
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
      `SELECT dimension_id, final_score, level
         FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(snap.rows.length).toBe(1);
    expect(snap.rows[0].dimension_id).toBe(dim.id);
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

describe.skipIf(!dbAvailable)('reassignQAssignment', () => {
  it('creates a new pending assignment for the same template + customer; source untouched', async () => {
    const tpl = await createQTemplate({
      title: `reassign-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const customerId = randomUUID();
    const src = await createQAssignment({ customerId, templateId: tpl.id });
    await updateQAssignment(src.id, { status: 'submitted' });
    await archiveQAssignment(src.id);

    const result = await reassignQAssignment(src.id);
    expect('assignment' in result).toBe(true);
    if (!('assignment' in result)) return;
    expect(result.assignment.id).not.toBe(src.id);
    expect(result.assignment.status).toBe('pending');
    expect(result.assignment.template_id).toBe(tpl.id);
    expect(result.assignment.customer_id).toBe(customerId);
    expect(result.assignment.archived_at).toBeNull();
    expect(result.assignment.submitted_at).toBeNull();
    expect(result.assignment.coach_notes).toBe('');

    const before = await getQAssignment(src.id);
    expect(before?.status).toBe('archived');
    expect(before?.archived_at).not.toBeNull();
  });

  it('returns not_found for missing id', async () => {
    const result = await reassignQAssignment(randomUUID());
    expect('reason' in result && result.reason).toBe('not_found');
  });
});

describe.skipIf(!dbAvailable)('listArchivedScores', () => {
  it('returns snapshot rows for an archived assignment', async () => {
    const tpl = await createQTemplate({
      title: `lsnap-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'X', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '3', label: 'm', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '3' });
    await updateQAssignment(a.id, { status: 'submitted' });
    await archiveQAssignment(a.id);

    const rows = await listArchivedScores(a.id);
    expect(rows.length).toBe(1);
    expect(rows[0].dimension_id).toBe(dim.id);
    expect(rows[0].final_score).toBe(3);
  });

  it('returns empty array for non-archived assignment', async () => {
    const tpl = await createQTemplate({
      title: `lsnap-empty-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    const rows = await listArchivedScores(a.id);
    expect(rows).toEqual([]);
  });
});

describe.skipIf(!dbAvailable)('listEvidenceByAssignment', () => {
  it('returns latest-attempt evidence per question with count', async () => {
    const tpl = await createQTemplate({
      title: `evid-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 's', questionType: 'test_step',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await pool.query<{ id: string }>(
      `INSERT INTO questionnaire_test_evidence
         (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 0, '/tmp/r0') RETURNING id`,
      [a.id, q.id],
    );
    const e2 = await pool.query<{ id: string }>(
      `INSERT INTO questionnaire_test_evidence
         (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 1, '/tmp/r1') RETURNING id`,
      [a.id, q.id],
    );

    const rows = await listEvidenceByAssignment(a.id);
    expect(rows.length).toBe(1);
    expect(rows[0].question_id).toBe(q.id);
    expect(rows[0].latest_evidence_id).toBe(e2.rows[0].id);
    expect(rows[0].latest_attempt).toBe(1);
    expect(rows[0].evidence_count).toBe(2);
  });

  it('returns empty array when there is no evidence', async () => {
    const tpl = await createQTemplate({
      title: `evid-empty-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    const rows = await listEvidenceByAssignment(a.id);
    expect(rows).toEqual([]);
  });
});

describe.skipIf(!dbAvailable)('getDisplayScores', () => {
  it('uses snapshot for archived; falls back to compute for non-archived', async () => {
    const tpl = await createQTemplate({
      title: `gds-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'D', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '4', label: 'x', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '4' });
    await updateQAssignment(a.id, { status: 'submitted' });

    const live = await getDisplayScores(await getQAssignment(a.id) as any);
    expect(live[0].final_score).toBe(4);
    expect(live[0].name).toBe('D');

    await archiveQAssignment(a.id);
    await upsertQDimension({
      id: dim.id, templateId: tpl.id, name: 'D-renamed', position: 0,
      thresholdMid: 1, thresholdHigh: 2,
    });
    const frozen = await getDisplayScores(await getQAssignment(a.id) as any);
    expect(frozen[0].final_score).toBe(4);
    expect(frozen[0].name).toBe('D');
  });
});

describe.skipIf(!dbAvailable)('updateQAssignment archived reroute', () => {
  it('writes a snapshot when status is set to archived via updateQAssignment', async () => {
    const tpl = await createQTemplate({
      title: `reroute-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'R', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '2', label: 'y', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '2' });
    await updateQAssignment(a.id, { status: 'submitted' });

    await updateQAssignment(a.id, { status: 'archived' });
    const snap = await pool.query(
      `SELECT count(*)::int AS n FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(snap.rows[0].n).toBe(1);
  });
});
,
    );
    expect(snap.rows[0].n).toBe(1);
  });
});
