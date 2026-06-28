// website/src/lib/questionnaire-db/schema.ts
// Pool setup, DDL (ensureQuestionnaireSchema), and module init.
// Exports the shared `pool` for all sibling modules and the test-only
// `ensureQuestionnaireSchemaOnce` run-once wrapper.

import pg from 'pg';
import { resolve4 } from 'dns';
import { ensureSystemtestSchema } from '../systemtest/db';
import { ensureSchemaOnce } from '../website-db';
import { SYSTEM_TEST_TEMPLATES, type SystemTestTemplate } from '../system-test-seed-data';
import { logger } from '../logger';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

export const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

export async function ensureQuestionnaireSchema(targetPool: pg.Pool = pool): Promise<void> {
  await targetPool.query(`
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
  await targetPool.query(`
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
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'ab_choice',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_answer_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      dimension_id UUID REFERENCES questionnaire_dimensions(id) ON DELETE SET NULL,
      weight INTEGER NOT NULL DEFAULT 1
    )
  `);
  await targetPool.query(`
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
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questionnaire_questions(id),
      option_key TEXT NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (assignment_id, question_id)
    )
  `);
  await targetPool.query(`ALTER TABLE questionnaire_questions
    ADD COLUMN IF NOT EXISTS test_expected_result TEXT,
    ADD COLUMN IF NOT EXISTS test_function_url TEXT,
    ADD COLUMN IF NOT EXISTS test_menu_path TEXT,
    ADD COLUMN IF NOT EXISTS test_role TEXT`);
  await targetPool.query(`ALTER TABLE questionnaire_answers
    ADD COLUMN IF NOT EXISTS details_text TEXT`);
  await targetPool.query(`ALTER TABLE questionnaire_templates
    ADD COLUMN IF NOT EXISTS is_system_test BOOLEAN NOT NULL DEFAULT false`);
  await targetPool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ`);
  await targetPool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS dismiss_reason TEXT`);
  await targetPool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL`);
  await targetPool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_test_status (
      question_id UUID PRIMARY KEY REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      last_result TEXT NOT NULL CHECK (last_result IN ('erfüllt', 'teilweise', 'nicht_erfüllt')),
      last_result_at TIMESTAMPTZ NOT NULL,
      last_success_at TIMESTAMPTZ,
      last_assignment_id UUID
    )
  `);
  await targetPool.query(`
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
  await targetPool.query(`
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
  await targetPool.query(
    `ALTER TABLE IF EXISTS questionnaire_assignment_scores DROP COLUMN IF EXISTS dimension_name;`
  );
  await targetPool.query(
    `CREATE INDEX IF NOT EXISTS idx_qas_assignment ON questionnaire_assignment_scores(assignment_id)`,
  );
  await targetPool.query(`CREATE SCHEMA IF NOT EXISTS bachelorprojekt`);
  await ensureSystemtestSchema(targetPool);
  await targetPool.query(`
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
}

export function ensureQuestionnaireSchemaOnce(targetPool: pg.Pool = pool): Promise<void> {
  return ensureSchemaOnce('questionnaire-schema', () => ensureQuestionnaireSchema(targetPool));
}

async function insertSystemTestTemplate(
  client: pg.PoolClient,
  tpl: SystemTestTemplate,
): Promise<void> {
  const { SYSTEM_TEST_DEFAULT_INSTRUCTIONS } = await import('./types');
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
          test_expected_result, test_function_url, test_menu_path, test_role)
       VALUES ($1, $2, $3, 'test_step', $4, $5, $6, $7)`,
      [templateId, i + 1, s.question_text, s.expected_result, s.test_function_url, s.test_menu_path ?? null, s.test_role],
    );
  }
}

async function updateSystemTestTemplate(
  client: pg.PoolClient,
  templateId: string,
  tpl: SystemTestTemplate,
): Promise<void> {
  const { SYSTEM_TEST_DEFAULT_INSTRUCTIONS } = await import('./types');
  const instructions = tpl.instructions?.trim()
    ? tpl.instructions
    : SYSTEM_TEST_DEFAULT_INSTRUCTIONS;

  await client.query(
    `UPDATE questionnaire_templates
        SET description=$1, instructions=$2, updated_at=now()
      WHERE id=$3`,
    [tpl.description, instructions, templateId],
  );

  const existingQ = await client.query(
    `SELECT id, position FROM questionnaire_questions
      WHERE template_id=$1 ORDER BY position`,
    [templateId],
  );
  const byPos = new Map<number, string>(
    existingQ.rows.map((r: { id: string; position: number }) => [r.position, r.id]),
  );

  for (let i = 0; i < tpl.steps.length; i++) {
    const s = tpl.steps[i];
    const pos = i + 1;
    const qId = byPos.get(pos);
    if (qId) {
      await client.query(
        `UPDATE questionnaire_questions
            SET question_text=$1, test_expected_result=$2,
                test_function_url=$3, test_menu_path=$4, test_role=$5
          WHERE id=$6`,
        [s.question_text, s.expected_result, s.test_function_url, s.test_menu_path ?? null, s.test_role, qId],
      );
    } else {
      await client.query(
        `INSERT INTO questionnaire_questions
           (template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_menu_path, test_role)
         VALUES ($1, $2, $3, 'test_step', $4, $5, $6, $7)`,
        [templateId, pos, s.question_text, s.expected_result, s.test_function_url, s.test_menu_path ?? null, s.test_role],
      );
    }
  }
}

async function syncSystemTestTemplates(): Promise<void> {
  const existing = await pool.query(
    `SELECT id, title FROM questionnaire_templates WHERE is_system_test = true`,
  );
  const existingByTitle = new Map<string, string>(
    existing.rows.map((r: { id: string; title: string }) => [r.title, r.id]),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tpl of SYSTEM_TEST_TEMPLATES) {
      const existingId = existingByTitle.get(tpl.title);
      if (existingId) {
        await updateSystemTestTemplate(client, existingId, tpl);
      } else {
        await insertSystemTestTemplate(client, tpl);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initDb(): Promise<void> {
  await ensureQuestionnaireSchemaOnce(pool);
  await syncSystemTestTemplates();
}

initDb().catch(err => logger.error({ err }, '[questionnaire-db] initDb error'));
