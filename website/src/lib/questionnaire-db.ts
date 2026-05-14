import pg from 'pg';
import { resolve4 } from 'dns';
import { SYSTEM_TEST_TEMPLATES, type SystemTestTemplate } from './system-test-seed-data';
import { ensureSystemtestSchema } from './systemtest/db';
import { openFailureTicket, enqueueOutboxRetry } from './systemtest/failure-bridge';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

export type QuestionType = 'ab_choice' | 'ja_nein' | 'likert_5' | 'test_step';
export type TestStepResult = 'erfüllt' | 'teilweise' | 'nicht_erfüllt';
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'archived' | 'dismissed';

/**
 * Default `instructions` text seeded onto system-test templates that don't
 * specify their own. Mirrors the sticky tester-guidance panel rendered on
 * `/admin/fragebogen/[assignmentId].astro` so that human and AI testers see
 * the same "verbose-on-confusion" framing wherever they encounter the test.
 */
export const SYSTEM_TEST_DEFAULT_INSTRUCTIONS = [
  'Wenn dir etwas auffällt — auch nur tangential — schreib es auf.',
  'Verwirrung ist Signal. Lieber eine geschwätzige `teilweise`-Notiz mit',
  'Fragezeichen als ein sauberes `erfüllt`, das einen echten Defekt versteckt.',
  '',
  'AI-Tester: dasselbe gilt für dich. Wenn etwas anders aussieht als erwartet,',
  'das Testskript es aber nicht abdeckt, dokumentiere es im Notizfeld. Wenn',
  'dich eine Fehlermeldung verwirrt, beschreibe was verwirrend war. Halte dich',
  'nicht zurück.',
].join('\n');

export interface QTemplate {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: 'draft' | 'published' | 'archived';
  is_system_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface QDimension {
  id: string;
  template_id: string;
  name: string;
  position: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  score_multiplier: number;
  created_at: string;
}

export interface QQuestion {
  id: string;
  template_id: string;
  position: number;
  question_text: string;
  question_type: QuestionType;
  test_expected_result: string | null;
  test_function_url: string | null;
  test_menu_path: string | null;
  test_role: 'admin' | 'user' | null;
  created_at: string;
}

export interface QAnswerOption {
  id: string;
  question_id: string;
  option_key: string;
  label: string;
  dimension_id: string | null;
  weight: number;
}

export interface QAssignment {
  id: string;
  customer_id: string;
  template_id: string;
  template_title: string;
  status: AssignmentStatus;
  coach_notes: string;
  assigned_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  archived_at: string | null;   // new
  dismissed_at: string | null;
  dismiss_reason: string | null;
  project_id: string | null;    // new
}

export interface QAnswer {
  id: string;
  assignment_id: string;
  question_id: string;
  option_key: string;
  details_text: string | null;
  saved_at: string;
}

export interface QTestStatus {
  question_id: string;
  template_id: string;
  template_title: string;
  question_text: string;
  test_expected_result: string | null;
  test_function_url: string | null;
  test_role: 'admin' | 'user' | null;
  position: number;
  last_result: TestStepResult | null;
  last_result_at: string | null;
  last_success_at: string | null;
}

async function seedSystemTestTemplates(): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM questionnaire_templates WHERE is_system_test = true`,
  );
  if ((existing.rows[0]?.cnt ?? 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tpl of SYSTEM_TEST_TEMPLATES) {
      await insertSystemTestTemplate(client, tpl);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function insertSystemTestTemplate(
  client: pg.PoolClient,
  tpl: SystemTestTemplate,
): Promise<void> {
  const instructions = tpl.instructions?.trim()
    ? tpl.instructions
    : SYSTEM_TEST_DEFAULT_INSTRUCTIONS;
  const r = await client.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
     VALUES ($1, $2, $3, 'published', true)
     RETURNING id`,
    [tpl.title, tpl.description, instructions],
  );
  const templateId = r.rows[0].id as string;

  for (let i = 0; i < tpl.steps.length; i++) {
    const s = tpl.steps[i];
    await client.query(
      `INSERT INTO questionnaire_questions
         (template_id, position, question_text, question_type,
          test_expected_result, test_function_url, test_role)
       VALUES ($1, $2, $3, 'test_step', $4, $5, $6)`,
      [templateId, i + 1, s.question_text, s.expected_result, s.test_function_url, s.test_role],
    );
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_dimensions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      threshold_mid INTEGER,
      threshold_high INTEGER,
      score_multiplier INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'ab_choice',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_answer_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      dimension_id UUID REFERENCES questionnaire_dimensions(id) ON DELETE SET NULL,
      weight INTEGER NOT NULL DEFAULT 1
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id),
      status TEXT NOT NULL DEFAULT 'pending',
      coach_notes TEXT NOT NULL DEFAULT '',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      submitted_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questionnaire_questions(id),
      option_key TEXT NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (assignment_id, question_id)
    )
  `);
  // Migrations for test_step question type
  await pool.query(`ALTER TABLE questionnaire_questions
    ADD COLUMN IF NOT EXISTS test_expected_result TEXT,
    ADD COLUMN IF NOT EXISTS test_function_url TEXT,
    ADD COLUMN IF NOT EXISTS test_menu_path TEXT,
    ADD COLUMN IF NOT EXISTS test_role TEXT`);
  await pool.query(`ALTER TABLE questionnaire_answers
    ADD COLUMN IF NOT EXISTS details_text TEXT`);
  await pool.query(`ALTER TABLE questionnaire_templates
    ADD COLUMN IF NOT EXISTS is_system_test BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS dismiss_reason TEXT`);
  await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_test_status (
      question_id UUID PRIMARY KEY REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      last_result TEXT NOT NULL CHECK (last_result IN ('erfüllt', 'teilweise', 'nicht_erfüllt')),
      last_result_at TIMESTAMPTZ NOT NULL,
      last_success_at TIMESTAMPTZ,
      last_assignment_id UUID
    )
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'questionnaire_test_status_last_result_check'
          AND conrelid = 'questionnaire_test_status'::regclass
      ) THEN
        ALTER TABLE questionnaire_test_status
          ADD CONSTRAINT questionnaire_test_status_last_result_check
          CHECK (last_result IN ('erfüllt', 'teilweise', 'nicht_erfüllt'));
      END IF;
    END$$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_assignment_scores (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id  UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      dimension_id   UUID NOT NULL,
      final_score    INTEGER NOT NULL,
      threshold_mid  INTEGER,
      threshold_high INTEGER,
      level          TEXT,
      snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_qas_assignment_dimension UNIQUE (assignment_id, dimension_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_qas_assignment ON questionnaire_assignment_scores(assignment_id)`,
  );
  await pool.query(`CREATE SCHEMA IF NOT EXISTS bachelorprojekt`);
  await pool.query(`
    CREATE OR REPLACE VIEW bachelorprojekt.v_questionnaire_kpi AS
    SELECT
      a.id              AS assignment_id,
      a.customer_id,
      a.template_id,
      t.title           AS template_title,
      t.is_system_test,
      a.assigned_at,
      a.submitted_at,
      a.archived_at,
      s.dimension_id,
      d.name            AS dimension_name,
      s.final_score,
      s.threshold_mid,
      s.threshold_high,
      s.level,
      ev.evidence_count,
      ev.latest_evidence_id
    FROM questionnaire_assignments a
    JOIN questionnaire_templates t ON t.id = a.template_id
    JOIN questionnaire_assignment_scores s ON s.assignment_id = a.id
    JOIN questionnaire_dimensions d ON d.id = s.dimension_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS evidence_count,
        (ARRAY_AGG(e.id ORDER BY e.attempt DESC, e.created_at DESC))[1] AS latest_evidence_id
      FROM questionnaire_test_evidence e
      WHERE e.assignment_id = a.id
    ) ev ON true
    WHERE a.status = 'archived'
  `);
  await ensureSystemtestSchema(pool);
  await seedSystemTestTemplates();
}

initDb().catch(err => console.error('[questionnaire-db] initDb error:', err));

// ── Templates ─────────────────────────────────────────────────────

export async function listQTemplates(): Promise<QTemplate[]> {
  const r = await pool.query(
    `SELECT id, title, description, instructions, status, is_system_test, created_at, updated_at
     FROM questionnaire_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}

export async function getQTemplate(id: string): Promise<QTemplate | null> {
  const r = await pool.query(
    `SELECT id, title, description, instructions, status, is_system_test, created_at, updated_at
     FROM questionnaire_templates WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
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

export async function getQQuestion(id: string): Promise<QQuestion | null> {
  const r = await pool.query(
    `SELECT id, template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_menu_path, test_role, created_at
     FROM questionnaire_questions WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
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

/**
 * List coaching questionnaire assignments linked to a project (ticket of type='project').
 * Excludes system-test templates — those are QA runs, not project context.
 */
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

const ARCHIVABLE_STATUSES: AssignmentStatus[] = ['submitted', 'reviewed', 'archived'];

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

    const { computeScores } = await import('./compute-scores');
    const scores = computeScores(dimsRes.rows, optsRes.rows, ansRes.rows);
    for (const s of scores) {
      await client.query(
        `INSERT INTO questionnaire_assignment_scores
           (assignment_id, dimension_id, final_score,
            threshold_mid, threshold_high, level)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_qas_assignment_dimension DO NOTHING`,
        [id, s.dimension_id, s.final_score,
         s.threshold_mid, s.threshold_high, s.level],
      );
    }

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

    const { computeScores } = await import('./compute-scores');
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

/**
 * Reset a finished assignment so it can be filled out again.
 *
 * Reopen path used by the admin "Erneut durchführen" button on
 * `/admin/fragebogen/[assignmentId].astro`. Wipes the previous answers,
 * clears all completion timestamps, and bumps `retest_attempt` for every
 * `test_step` question in the template so the next [Seed] click partitions
 * fresh fixtures from prior runs.
 *
 * Coach notes are preserved — they're admin commentary, not user answers.
 * Test evidence rows (rrweb recordings) stay too: they're audit trail keyed
 * by `(question_id, attempt)` and survive across re-runs.
 *
 * Returns `null` when no assignment exists with that id, or `{ reason: ... }`
 * when the status isn't reopen-able. Returns the updated assignment + the
 * number of test-status rows bumped on success.
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

export async function updateTestStatuses(assignmentId: string): Promise<void> {
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

    // Failure-bridge (Task 5): when a system-test step lands as
    // `nicht_erfüllt`, auto-create a bug ticket back-referencing the
    // failure. Best-effort — outer answer-save MUST commit even if the
    // bridge fails, so we catch and route to the outbox.
    if (row.option_key === 'nicht_erfüllt') {
      // Pick up the most recent evidence (rrweb replay) for this step.
      // Multiple attempts may exist; the highest `attempt` wins. Reading
      // evidence once before the bridge call so we can also forward the
      // attempt number to the outbox if the bridge throws.
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
        // Evidence lookup is non-fatal — fall through with null evidence.
        console.error('[updateTestStatuses] evidence lookup failed:', err);
      }
      try {
        await openFailureTicket(pool, {
          assignmentId,
          questionId: row.question_id,
          evidenceId,
          details: row.details_text ?? null,
        });
        // openFailureTicket returns null when the question is not part of
        // an `is_system_test` template — that's fine; nothing else to do.
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[updateTestStatuses] failure-bridge failed:', err);
        await enqueueOutboxRetry(pool, {
          assignmentId,
          questionId: row.question_id,
          attempt,
          error: message,
        }).catch((outboxErr) =>
          console.error('[updateTestStatuses] outbox enqueue failed:', outboxErr),
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

export interface QArchivedScore {
  assignment_id: string;
  dimension_id: string;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
  snapshot_at: string;
}

export async function listArchivedScores(assignmentId: string): Promise<QArchivedScore[]> {
  const r = await pool.query(
    `SELECT assignment_id, dimension_id, final_score,
            threshold_mid, threshold_high, level, snapshot_at
       FROM questionnaire_assignment_scores
      WHERE assignment_id = $1
      ORDER BY dimension_id`,
    [assignmentId],
  );
  return r.rows;
}

export interface QEvidenceForQuestion {
  question_id: string;
  latest_evidence_id: string;
  latest_attempt: number;
  evidence_count: number;
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

// Per-question retest_attempt for the rrweb recorder. Rows in
// questionnaire_test_status are keyed by question_id; the row only belongs to
// THIS assignment if last_assignment_id matches. Questions without a status
// row (or where last_assignment_id is a sibling assignment) are fresh runs at
// attempt 0.
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

// Question_ids that already have a "video of success": at least one evidence
// row exists where the corresponding answer (same assignment_id + question_id)
// is 'erfüllt'. Once a step has one, the recorder skips it on subsequent runs
// — the canonical success replay already exists in /var/evidence and
// re-recording every run would only bloat storage.
//
// reopen() wipes answers but not evidence rows; on retest the question
// re-enters this set only after the user answers 'erfüllt' on the new
// attempt + a chunk uploads.
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
