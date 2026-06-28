// website/src/lib/questionnaire-db/queries.ts
// Template / Dimension / Question / Answer-Option / Assignment / Answer
// CRUD + assignment transactions (archive, dismiss, reassign).
// Sibling modules: schema.ts (pool + DDL), scoring.ts (read-only scorers
// and test-evidence queries), types.ts (interfaces).

import type { QTemplate, QDimension, QQuestion, QAnswerOption, QAssignment, QAnswer, AssignmentStatus, QuestionType } from './types';
import { pool } from './schema';
import { ARCHIVABLE_STATUSES } from './types';

// ── Reads ─────────────────────────────────────────────────────────

export async function getQTemplate(id: string): Promise<QTemplate | null> {
  const r = await pool.query(
    `SELECT id, title, description, instructions, status, is_system_test, created_at, updated_at
     FROM questionnaire_templates WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function getQQuestion(id: string): Promise<QQuestion | null> {
  const r = await pool.query(
    `SELECT id, template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_menu_path, test_role, created_at
     FROM questionnaire_questions WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function getQAssignment(id: string): Promise<QAssignment | null> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
            a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
     FROM questionnaire_assignments a
     JOIN questionnaire_templates t ON t.id = a.template_id
     WHERE a.id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

// ── Templates ─────────────────────────────────────────────────────

export async function listQTemplates(): Promise<QTemplate[]> {
  const r = await pool.query(
    `SELECT t.id, t.title, t.description, t.instructions, t.status, t.is_system_test,
            (SELECT COUNT(*)::int FROM questionnaire_dimensions d WHERE d.template_id = t.id) AS dimension_count,
            t.created_at, t.updated_at
     FROM questionnaire_templates t ORDER BY t.created_at DESC`,
  );
  return r.rows;
}

export async function createQTemplate(params: {
  title: string; description: string; instructions: string;
}): Promise<QTemplate> {
  const r = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions)
     VALUES ($1, $2, $3)
     RETURNING id, title, description, instructions, status, created_at, updated_at`,
    [params.title, params.description, params.instructions],
  );
  return r.rows[0];
}

export async function updateQTemplate(id: string, params: {
  title?: string; description?: string; instructions?: string; status?: string;
}): Promise<QTemplate | null> {
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.description !== undefined) { vals.push(params.description); sets.push(`description = $${vals.length}`); }
  if (params.instructions !== undefined) { vals.push(params.instructions); sets.push(`instructions = $${vals.length}`); }
  if (params.status !== undefined) { vals.push(params.status); sets.push(`status = $${vals.length}`); }
  vals.push(id);
  const r = await pool.query(
    `UPDATE questionnaire_templates SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, title, description, instructions, status, is_system_test, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function deleteQTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM questionnaire_templates WHERE id = $1`, [id]);
}

// ── Dimensions ────────────────────────────────────────────────────

export async function listQDimensions(templateId: string): Promise<QDimension[]> {
  const r = await pool.query(
    `SELECT id, template_id, name, position, threshold_mid, threshold_high, score_multiplier, created_at
     FROM questionnaire_dimensions WHERE template_id = $1 ORDER BY position`,
    [templateId],
  );
  return r.rows;
}

export async function upsertQDimension(params: {
  id?: string; templateId: string; name: string; position: number;
  thresholdMid?: number | null; thresholdHigh?: number | null; scoreMultiplier?: number;
}): Promise<QDimension> {
  if (params.id) {
    const r = await pool.query(
      `UPDATE questionnaire_dimensions
       SET name=$1, position=$2, threshold_mid=$3, threshold_high=$4, score_multiplier=$5
       WHERE id=$6 AND template_id=$7
       RETURNING id, template_id, name, position, threshold_mid, threshold_high, score_multiplier, created_at`,
      [params.name, params.position, params.thresholdMid ?? null, params.thresholdHigh ?? null,
       params.scoreMultiplier ?? 1, params.id, params.templateId],
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO questionnaire_dimensions (template_id, name, position, threshold_mid, threshold_high, score_multiplier)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, template_id, name, position, threshold_mid, threshold_high, score_multiplier, created_at`,
    [params.templateId, params.name, params.position, params.thresholdMid ?? null,
     params.thresholdHigh ?? null, params.scoreMultiplier ?? 1],
  );
  return r.rows[0];
}

export async function deleteQDimension(id: string): Promise<void> {
  await pool.query(`DELETE FROM questionnaire_dimensions WHERE id = $1`, [id]);
}

// ── Questions ─────────────────────────────────────────────────────

export async function listQQuestions(templateId: string): Promise<QQuestion[]> {
  const r = await pool.query(
    `SELECT id, template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_menu_path, test_role, created_at
     FROM questionnaire_questions WHERE template_id = $1 ORDER BY position`,
    [templateId],
  );
  return r.rows;
}

export async function upsertQQuestion(params: {
  id?: string; templateId: string; position: number;
  questionText: string; questionType: QuestionType;
  testExpectedResult?: string | null;
  testFunctionUrl?: string | null;
  testMenuPath?: string | null;
  testRole?: 'admin' | 'user' | null;
}): Promise<QQuestion> {
  const returning = `RETURNING id, template_id, position, question_text, question_type,
                     test_expected_result, test_function_url, test_menu_path, test_role, created_at`;
  if (params.id) {
    const r = await pool.query(
      `UPDATE questionnaire_questions
       SET position=$1, question_text=$2, question_type=$3,
           test_expected_result=$4, test_function_url=$5, test_menu_path=$6, test_role=$7
       WHERE id=$8 ${returning}`,
      [params.position, params.questionText, params.questionType,
       params.testExpectedResult ?? null, params.testFunctionUrl ?? null,
       params.testMenuPath ?? null, params.testRole ?? null, params.id],
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO questionnaire_questions
       (template_id, position, question_text, question_type, test_expected_result, test_function_url, test_menu_path, test_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ${returning}`,
    [params.templateId, params.position, params.questionText, params.questionType,
     params.testExpectedResult ?? null, params.testFunctionUrl ?? null,
     params.testMenuPath ?? null, params.testRole ?? null],
  );
  return r.rows[0];
}

export async function deleteQQuestion(id: string): Promise<void> {
  await pool.query(`DELETE FROM questionnaire_questions WHERE id = $1`, [id]);
}

// ── Answer options ────────────────────────────────────────────────

export async function listQAnswerOptions(questionId: string): Promise<QAnswerOption[]> {
  const r = await pool.query(
    `SELECT id, question_id, option_key, label, dimension_id, weight
     FROM questionnaire_answer_options WHERE question_id = $1 ORDER BY option_key`,
    [questionId],
  );
  return r.rows;
}

export async function listQAnswerOptionsForTemplate(templateId: string): Promise<QAnswerOption[]> {
  const r = await pool.query(
    `SELECT ao.id, ao.question_id, ao.option_key, ao.label, ao.dimension_id, ao.weight
     FROM questionnaire_answer_options ao
     JOIN questionnaire_questions q ON q.id = ao.question_id
     WHERE q.template_id = $1
     ORDER BY ao.question_id, ao.option_key`,
    [templateId],
  );
  return r.rows;
}

export async function replaceQAnswerOptions(questionId: string, options: Array<{
  optionKey: string; label: string; dimensionId: string | null; weight: number;
}>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM questionnaire_answer_options WHERE question_id = $1`, [questionId]);
    for (const opt of options) {
      await client.query(
        `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
         VALUES ($1,$2,$3,$4,$5)`,
        [questionId, opt.optionKey, opt.label, opt.dimensionId ?? null, opt.weight],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Assignments ───────────────────────────────────────────────────

export async function createQAssignment(params: {
  customerId: string; templateId: string; projectId?: string;
}): Promise<QAssignment> {
  const r = await pool.query(
    `INSERT INTO questionnaire_assignments (customer_id, template_id, project_id)
     VALUES ($1, $2, $3)
     RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
               submitted_at, reviewed_at, archived_at, dismissed_at, dismiss_reason, project_id`,
    [params.customerId, params.templateId, params.projectId ?? null],
  );
  const row = r.rows[0];
  const tpl = await getQTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function listQAssignmentsForCustomer(customerId: string): Promise<QAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
            a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
     FROM questionnaire_assignments a
     JOIN questionnaire_templates t ON t.id = a.template_id
     WHERE a.customer_id = $1
     ORDER BY a.assigned_at DESC`,
    [customerId],
  );
  return r.rows;
}

export async function listQAssignmentsForProject(projectId: string): Promise<QAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
            a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
     FROM questionnaire_assignments a
     JOIN questionnaire_templates t ON t.id = a.template_id
     WHERE a.project_id = $1
       AND COALESCE(t.is_system_test, false) = false
     ORDER BY a.assigned_at DESC`,
    [projectId],
  );
  return r.rows;
}

export async function updateQAssignment(id: string, params: {
  status?: AssignmentStatus; coachNotes?: string; dismissReason?: string;
}): Promise<QAssignment | null> {
  if (params.status === 'archived') {
    if (params.coachNotes !== undefined || params.dismissReason !== undefined) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.coachNotes !== undefined) {
        vals.push(params.coachNotes); sets.push(`coach_notes = $${vals.length}`);
      }
      if (params.dismissReason !== undefined) {
        vals.push(params.dismissReason); sets.push(`dismiss_reason = $${vals.length}`);
      }
      vals.push(id);
      await pool.query(
        `UPDATE questionnaire_assignments SET ${sets.join(', ')}
         WHERE id = $${vals.length}`,
        vals,
      );
    }
    const result = await archiveQAssignment(id);
    if ('reason' in result) return null;
    return result.assignment;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (params.status !== undefined) {
    vals.push(params.status); sets.push(`status = $${vals.length}`);
    if (params.status === 'submitted') sets.push(`submitted_at = now()`);
    if (params.status === 'reviewed') sets.push(`reviewed_at = now()`);
    if (params.status === 'dismissed') sets.push(`dismissed_at = now()`);
  }
  if (params.dismissReason !== undefined) {
    vals.push(params.dismissReason); sets.push(`dismiss_reason = $${vals.length}`);
  }
  if (params.coachNotes !== undefined) {
    vals.push(params.coachNotes); sets.push(`coach_notes = $${vals.length}`);
  }
  if (sets.length === 0) return getQAssignment(id);
  vals.push(id);
  const r = await pool.query(
    `UPDATE questionnaire_assignments SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
               submitted_at, reviewed_at, archived_at, dismissed_at, dismiss_reason, project_id`,
    vals,
  );
  const row = r.rows[0];
  if (!row) return null;
  const tpl = await getQTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function dismissQAssignment(id: string, reason: string): Promise<QAssignment | null> {
  return updateQAssignment(id, { status: 'dismissed', dismissReason: reason });
}

export async function archiveQAssignment(id: string): Promise<
  | { assignment: QAssignment }
  | { reason: 'not_found' | 'not_archivable'; status?: AssignmentStatus }
> {
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
    if (!ARCHIVABLE_STATUSES.includes(status)) {
      await client.query('ROLLBACK');
      return { reason: 'not_archivable', status };
    }
    const templateId = a.rows[0].template_id;

    if (status !== 'archived') {
      await client.query(
        `UPDATE questionnaire_assignments
            SET status = 'archived', archived_at = now()
          WHERE id = $1`,
        [id],
      );
    }

    const dimsRes = await client.query<QDimension>(
      `SELECT id, template_id, name, position, threshold_mid, threshold_high,
              score_multiplier, created_at
         FROM questionnaire_dimensions WHERE template_id = $1 ORDER BY position`,
      [templateId],
    );
    const optsRes = await client.query<QAnswerOption>(
      `SELECT ao.id, ao.question_id, ao.option_key, ao.label, ao.dimension_id, ao.weight
         FROM questionnaire_answer_options ao
         JOIN questionnaire_questions q ON q.id = ao.question_id
        WHERE q.template_id = $1`,
      [templateId],
    );
    const ansRes = await client.query<QAnswer>(
      `SELECT id, assignment_id, question_id, option_key, details_text, saved_at
         FROM questionnaire_answers WHERE assignment_id = $1`,
      [id],
    );

    const { computeScores } = await import('../compute-scores');
    const scores = computeScores(dimsRes.rows, optsRes.rows, ansRes.rows);

    await client.query('COMMIT');
    const updated = await getQAssignment(id);
    if (!updated) return { reason: 'not_found' };
    return { assignment: updated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function reassignQAssignment(id: string): Promise<
  | { assignment: QAssignment }
  | { reason: 'not_found' }
> {
  const src = await getQAssignment(id);
  if (!src) return { reason: 'not_found' };
  const created = await createQAssignment({
    customerId: src.customer_id,
    templateId: src.template_id,
    projectId: src.project_id ?? undefined,
  });
  return { assignment: created };
}

export async function countPendingQAssignmentsForCustomer(customerId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM questionnaire_assignments
     WHERE customer_id = $1 AND status IN ('pending','in_progress')`,
    [customerId],
  );
  return r.rows[0]?.count ?? 0;
}

// ── Answers ───────────────────────────────────────────────────────

export async function upsertQAnswer(params: {
  assignmentId: string; questionId: string; optionKey: string; detailsText?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key, details_text, saved_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (assignment_id, question_id)
     DO UPDATE SET option_key = EXCLUDED.option_key, details_text = EXCLUDED.details_text, saved_at = now()`,
    [params.assignmentId, params.questionId, params.optionKey, params.detailsText ?? null],
  );
}

export async function listQAnswers(assignmentId: string): Promise<QAnswer[]> {
  const r = await pool.query(
    `SELECT id, assignment_id, question_id, option_key, details_text, saved_at
     FROM questionnaire_answers WHERE assignment_id = $1`,
    [assignmentId],
  );
  return r.rows;
}
