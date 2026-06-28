// website/src/lib/questionnaire-db/scoring.ts
// Scoring / evaluation workflows and test-evidence reads.
// Sibling modules: queries.ts (CRUD + assignment transactions),
// schema.ts (pool), types.ts (interfaces).

import type { QDimension, QAnswerOption, QAnswer, QAssignment, QTestStatus, QArchivedScore, QEvidenceForQuestion, AssignmentStatus } from './types';
import { pool } from './schema';
import { getQAssignment } from './queries';
import { logger } from '../logger';

export async function autoEvaluateQAssignment(id: string): Promise<void> {
  const assignment = await getQAssignment(id);
  if (!assignment || assignment.status !== 'submitted') return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dimsRes = await client.query<QDimension>(
      `SELECT id, template_id, name, position, threshold_mid, threshold_high,
              score_multiplier, created_at
         FROM questionnaire_dimensions WHERE template_id = $1 ORDER BY position`,
      [assignment.template_id],
    );
    const optsRes = await client.query<QAnswerOption>(
      `SELECT ao.id, ao.question_id, ao.option_key, ao.label, ao.dimension_id, ao.weight
         FROM questionnaire_answer_options ao
         JOIN questionnaire_questions q ON q.id = ao.question_id
        WHERE q.template_id = $1`,
      [assignment.template_id],
    );
    const ansRes = await client.query<QAnswer>(
      `SELECT id, assignment_id, question_id, option_key, details_text, saved_at
         FROM questionnaire_answers WHERE assignment_id = $1`,
      [id],
    );

    const { computeScores } = await import('../compute-scores');
    const scores = computeScores(dimsRes.rows, optsRes.rows, ansRes.rows);
    for (const s of scores) {
      await client.query(
        `INSERT INTO questionnaire_assignment_scores
           (assignment_id, dimension_id, final_score,
            threshold_mid, threshold_high, level)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_qas_assignment_dimension
         DO UPDATE SET
           final_score    = EXCLUDED.final_score,
           level          = EXCLUDED.level,
           snapshot_at    = now()`,
        [id, s.dimension_id, s.final_score,
         s.threshold_mid, s.threshold_high, s.level],
      );
    }

    await client.query(
      `UPDATE questionnaire_assignments
          SET status = 'reviewed', reviewed_at = now()
        WHERE id = $1 AND status = 'submitted'`,
      [id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reset a finished assignment so it can be filled out again. Wipes the previous
 * answers, clears all completion timestamps, and bumps `retest_attempt` for
 * every `test_step` question in the template so the next [Seed] click partitions
 * fresh fixtures from prior runs. Coach notes are preserved.
 */
export async function reopenQAssignment(id: string): Promise<
  | { assignment: QAssignment; testStatusBumped: number }
  | { reason: 'not_found' | 'not_reopenable'; status?: AssignmentStatus }
> {
  const REOPENABLE: AssignmentStatus[] = ['submitted', 'reviewed', 'archived', 'dismissed'];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query<{ template_id: string; status: AssignmentStatus }>(
      `SELECT template_id, status FROM questionnaire_assignments
        WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (a.rows.length === 0) {
      await client.query('ROLLBACK');
      return { reason: 'not_found' };
    }
    const status = a.rows[0].status;
    if (!REOPENABLE.includes(status)) {
      await client.query('ROLLBACK');
      return { reason: 'not_reopenable', status };
    }
    const templateId = a.rows[0].template_id;

    await client.query(
      `UPDATE questionnaire_assignments
          SET status = 'pending',
              submitted_at = NULL,
              reviewed_at = NULL,
              archived_at = NULL,
              dismissed_at = NULL,
              dismiss_reason = NULL
        WHERE id = $1`,
      [id],
    );

    await client.query(
      `DELETE FROM questionnaire_answers WHERE assignment_id = $1`,
      [id],
    );

    const bump = await client.query(
      `UPDATE questionnaire_test_status qts
          SET retest_attempt    = qts.retest_attempt + 1,
              retest_pending_at = COALESCE(qts.retest_pending_at, now())
         FROM questionnaire_questions qq
        WHERE qts.question_id = qq.id
          AND qq.template_id = $1
          AND qq.question_type = 'test_step'`,
      [templateId],
    );

    await client.query('COMMIT');
    const updated = await getQAssignment(id);
    if (!updated) return { reason: 'not_found' };
    return { assignment: updated, testStatusBumped: bump.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function updateTestStatuses(assignmentId: string): Promise<void> {
  const { openFailureTicket, enqueueOutboxRetry } = await import('../systemtest/failure-bridge');
  const r = await pool.query(
    `SELECT qa.question_id, qa.option_key, qa.saved_at, qa.details_text
     FROM questionnaire_answers qa
     JOIN questionnaire_questions qq ON qq.id = qa.question_id
     WHERE qa.assignment_id = $1 AND qq.question_type = 'test_step'`,
    [assignmentId],
  );
  if (r.rows.length === 0) return;
  for (const row of r.rows) {
    await pool.query(
      `INSERT INTO questionnaire_test_status
         (question_id, last_result, last_result_at, last_success_at, last_assignment_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (question_id) DO UPDATE SET
         last_result = EXCLUDED.last_result,
         last_result_at = EXCLUDED.last_result_at,
         last_success_at = CASE
           WHEN EXCLUDED.last_result = 'erfüllt' THEN EXCLUDED.last_result_at
           ELSE questionnaire_test_status.last_success_at
         END,
         last_assignment_id = EXCLUDED.last_assignment_id`,
      [row.question_id, row.option_key, row.saved_at,
       row.option_key === 'erfüllt' ? row.saved_at : null, assignmentId],
    );

    if (row.option_key === 'nicht_erfüllt') {
      let evidenceId: string | null = null;
      let attempt = 0;
      try {
        const ev = await pool.query<{ id: string; attempt: number }>(
          `SELECT id, attempt FROM questionnaire_test_evidence
            WHERE assignment_id = $1 AND question_id = $2
            ORDER BY attempt DESC, created_at DESC
            LIMIT 1`,
          [assignmentId, row.question_id],
        );
        evidenceId = ev.rows[0]?.id ?? null;
        attempt = ev.rows[0]?.attempt ?? 0;
      } catch (err) {
        logger.error({ err }, '[updateTestStatuses] evidence lookup failed');
      }
      try {
        await openFailureTicket(pool, {
          assignmentId,
          questionId: row.question_id,
          evidenceId,
          details: row.details_text ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err }, '[updateTestStatuses] failure-bridge failed');
        await enqueueOutboxRetry(pool, {
          assignmentId,
          questionId: row.question_id,
          attempt,
          error: message,
        }).catch((outboxErr) =>
          logger.error({ err: outboxErr }, '[updateTestStatuses] outbox enqueue failed'),
        );
      }
    }
  }
}

export async function listTestStatusesForMonitoring(): Promise<{
  template_id: string; template_title: string; questions: QTestStatus[];
}[]> {
  const r = await pool.query(
    `SELECT qt.id AS template_id, qt.title AS template_title,
            qq.id AS question_id, qq.position, qq.question_text,
            qq.test_expected_result, qq.test_function_url, qq.test_role,
            ts.last_result, ts.last_result_at, ts.last_success_at
     FROM questionnaire_templates qt
     JOIN questionnaire_questions qq ON qq.template_id = qt.id
     LEFT JOIN questionnaire_test_status ts ON ts.question_id = qq.id
     WHERE qt.is_system_test = true AND qq.question_type = 'test_step'
     ORDER BY qt.created_at, qq.position`,
  );
  const byTemplate = new Map<string, { template_id: string; template_title: string; questions: QTestStatus[] }>();
  for (const row of r.rows) {
    if (!byTemplate.has(row.template_id)) {
      byTemplate.set(row.template_id, {
        template_id: row.template_id, template_title: row.template_title, questions: [],
      });
    }
    byTemplate.get(row.template_id)!.questions.push({
      question_id: row.question_id,
      template_id: row.template_id,
      template_title: row.template_title,
      question_text: row.question_text,
      test_expected_result: row.test_expected_result,
      test_function_url: row.test_function_url,
      test_role: row.test_role,
      position: row.position,
      last_result: row.last_result,
      last_result_at: row.last_result_at,
      last_success_at: row.last_success_at,
    });
  }
  return Array.from(byTemplate.values());
}

export async function listArchivedScores(assignmentId: string): Promise<QArchivedScore[]> {
  const r = await pool.query(
    `SELECT s.assignment_id, s.dimension_id, d.name AS dimension_name,
            s.final_score, s.threshold_mid, s.threshold_high, s.level, s.snapshot_at
       FROM questionnaire_assignment_scores s
       JOIN questionnaire_dimensions d ON d.id = s.dimension_id
      WHERE s.assignment_id = $1
      ORDER BY s.dimension_id`,
    [assignmentId],
  );
  return r.rows;
}

export async function listEvidenceByAssignment(
  assignmentId: string,
): Promise<QEvidenceForQuestion[]> {
  const r = await pool.query(
    `SELECT question_id,
            (ARRAY_AGG(id ORDER BY attempt DESC, created_at DESC))[1] AS latest_evidence_id,
            MAX(attempt)::int                                          AS latest_attempt,
            COUNT(*)::int                                              AS evidence_count
       FROM questionnaire_test_evidence
      WHERE assignment_id = $1
      GROUP BY question_id`,
    [assignmentId],
  );
  return r.rows;
}

export async function listTestStepAttempts(
  assignmentId: string,
): Promise<Record<string, number>> {
  const r = await pool.query(
    `SELECT question_id, retest_attempt
       FROM questionnaire_test_status
       WHERE last_assignment_id = $1`,
    [assignmentId],
  );
  return Object.fromEntries(
    r.rows.map((row: { question_id: string; retest_attempt: number | null }) => [
      row.question_id,
      row.retest_attempt ?? 0,
    ]),
  );
}

export async function listQuestionsWithSuccessfulRecording(): Promise<string[]> {
  const r = await pool.query(
    `SELECT DISTINCT e.question_id
       FROM questionnaire_test_evidence e
       JOIN questionnaire_answers a
         ON a.assignment_id = e.assignment_id
        AND a.question_id   = e.question_id
      WHERE a.option_key = 'erfüllt'`,
  );
  return r.rows.map((row: { question_id: string }) => row.question_id);
}
