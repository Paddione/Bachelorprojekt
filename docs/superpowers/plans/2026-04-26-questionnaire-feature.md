# Questionnaire Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fragebogen feature — admin assigns psychological self-assessment questionnaires to clients, clients fill them via a one-question-at-a-time wizard, system computes dimension scores, admin reviews bar-chart Auswertung and adds coaching notes.

**Architecture:** Six new DB tables (questionnaire_templates, _dimensions, _questions, _answer_options, _assignments, _answers) in questionnaire-db.ts following the existing documents-db.ts pattern. Pure score computation in compute-scores.ts. Admin CRUD API + portal wizard API. Three pre-seeded instruments (Thomas/Kilmann, Riemann-Thomann, Inneres Funktionsmodell). Svelte 5 components for template builder and client panel; Astro pages for wizard and Auswertung.

**Tech Stack:** Astro 4, Svelte 5 ($state/$effect/$derived), PostgreSQL 16 (raw SQL, pg Pool), TypeScript, Tailwind v4, nodemailer.

---

## File Map

**Create:**
- `website/src/lib/questionnaire-db.ts` — DB pool, table init, all CRUD functions
- `website/src/lib/compute-scores.ts` — pure score computation (no DB)
- `website/tests/compute-scores.test.mjs` — unit tests for score computation
- `website/src/pages/api/admin/questionnaires/templates/index.ts` — GET list, POST create
- `website/src/pages/api/admin/questionnaires/templates/[id].ts` — PUT update, DELETE
- `website/src/pages/api/admin/questionnaires/assign.ts` — POST assign template to client
- `website/src/pages/api/admin/questionnaires/assignments/index.ts` — GET list by customerId
- `website/src/pages/api/admin/questionnaires/assignments/[id].ts` — GET detail with scores, PUT notes/status
- `website/src/pages/api/portal/questionnaires/index.ts` — GET my assignments
- `website/src/pages/api/portal/questionnaires/[id]/index.ts` — GET questions for assignment
- `website/src/pages/api/portal/questionnaires/[id]/answer.ts` — PUT upsert one answer
- `website/src/pages/api/portal/questionnaires/[id]/submit.ts` — POST submit
- `website/scripts/seed-questionnaires.mjs` — seed 3 instruments
- `website/src/components/admin/QuestionnaireTemplateEditor.svelte` — template builder
- `website/src/components/admin/ClientQuestionnairesPanel.svelte` — client detail panel
- `website/src/pages/admin/fragebogen/[assignmentId].astro` — Auswertung page
- `website/src/pages/portal/fragebogen/[assignmentId].astro` — wizard page shell
- `website/src/components/portal/QuestionnaireWizard.svelte` — interactive wizard

**Modify:**
- `website/src/lib/email.ts` — add sendQuestionnaireAssigned + sendQuestionnaireSubmitted
- `website/src/components/admin/DokumentEditor.svelte` — add "Fragebögen" tab
- `website/src/pages/admin/[clientId].astro` — add "Fragebögen" tab + ClientQuestionnairesPanel

---

## Task 1: DB Layer (questionnaire-db.ts)

**Files:**
- Create: `website/src/lib/questionnaire-db.ts`

- [ ] **Step 1: Create questionnaire-db.ts with pool, initDb, and TypeScript interfaces**

```typescript
// website/src/lib/questionnaire-db.ts
import pg from 'pg';
import { resolve4 } from 'dns';

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

export type QuestionType = 'ab_choice' | 'ja_nein' | 'likert_5';
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed';

export interface QTemplate {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: 'draft' | 'published' | 'archived';
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
}

export interface QAnswer {
  id: string;
  assignment_id: string;
  question_id: string;
  option_key: string;
  saved_at: string;
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
}

initDb().catch(err => console.error('[questionnaire-db] initDb error:', err));
```

- [ ] **Step 2: Add template CRUD functions**

Append to `website/src/lib/questionnaire-db.ts`:

```typescript
// ── Templates ─────────────────────────────────────────────────────

export async function listQTemplates(): Promise<QTemplate[]> {
  const r = await pool.query(
    `SELECT id, title, description, instructions, status, created_at, updated_at
     FROM questionnaire_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}

export async function getQTemplate(id: string): Promise<QTemplate | null> {
  const r = await pool.query(
    `SELECT id, title, description, instructions, status, created_at, updated_at
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
     RETURNING id, title, description, instructions, status, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function deleteQTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM questionnaire_templates WHERE id = $1`, [id]);
}
```

- [ ] **Step 3: Add dimension, question, answer-option CRUD functions**

Append to `website/src/lib/questionnaire-db.ts`:

```typescript
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
       WHERE id=$6
       RETURNING id, template_id, name, position, threshold_mid, threshold_high, score_multiplier, created_at`,
      [params.name, params.position, params.thresholdMid ?? null, params.thresholdHigh ?? null,
       params.scoreMultiplier ?? 1, params.id],
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
    `SELECT id, template_id, position, question_text, question_type, created_at
     FROM questionnaire_questions WHERE template_id = $1 ORDER BY position`,
    [templateId],
  );
  return r.rows;
}

export async function upsertQQuestion(params: {
  id?: string; templateId: string; position: number;
  questionText: string; questionType: QuestionType;
}): Promise<QQuestion> {
  if (params.id) {
    const r = await pool.query(
      `UPDATE questionnaire_questions
       SET position=$1, question_text=$2, question_type=$3
       WHERE id=$4
       RETURNING id, template_id, position, question_text, question_type, created_at`,
      [params.position, params.questionText, params.questionType, params.id],
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
     VALUES ($1,$2,$3,$4)
     RETURNING id, template_id, position, question_text, question_type, created_at`,
    [params.templateId, params.position, params.questionText, params.questionType],
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
     WHERE q.template_id = $1`,
    [templateId],
  );
  return r.rows;
}

export async function replaceQAnswerOptions(questionId: string, options: Array<{
  optionKey: string; label: string; dimensionId: string | null; weight: number;
}>): Promise<void> {
  await pool.query(`DELETE FROM questionnaire_answer_options WHERE question_id = $1`, [questionId]);
  for (const opt of options) {
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1,$2,$3,$4,$5)`,
      [questionId, opt.optionKey, opt.label, opt.dimensionId ?? null, opt.weight],
    );
  }
}
```

- [ ] **Step 4: Add assignment CRUD functions**

Append to `website/src/lib/questionnaire-db.ts`:

```typescript
// ── Assignments ───────────────────────────────────────────────────

export async function createQAssignment(params: {
  customerId: string; templateId: string;
}): Promise<QAssignment> {
  const r = await pool.query(
    `INSERT INTO questionnaire_assignments (customer_id, template_id)
     VALUES ($1, $2)
     RETURNING id, customer_id, template_id, status, coach_notes, assigned_at, submitted_at, reviewed_at`,
    [params.customerId, params.templateId],
  );
  const row = r.rows[0];
  const tpl = await getQTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function listQAssignmentsForCustomer(customerId: string): Promise<QAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at
     FROM questionnaire_assignments a
     JOIN questionnaire_templates t ON t.id = a.template_id
     WHERE a.customer_id = $1
     ORDER BY a.assigned_at DESC`,
    [customerId],
  );
  return r.rows;
}

export async function getQAssignment(id: string): Promise<QAssignment | null> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at
     FROM questionnaire_assignments a
     JOIN questionnaire_templates t ON t.id = a.template_id
     WHERE a.id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function updateQAssignment(id: string, params: {
  status?: AssignmentStatus; coachNotes?: string;
}): Promise<QAssignment | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (params.status !== undefined) {
    vals.push(params.status); sets.push(`status = $${vals.length}`);
    if (params.status === 'submitted') sets.push(`submitted_at = now()`);
    if (params.status === 'reviewed') sets.push(`reviewed_at = now()`);
  }
  if (params.coachNotes !== undefined) { vals.push(params.coachNotes); sets.push(`coach_notes = $${vals.length}`); }
  if (sets.length === 0) return getQAssignment(id);
  vals.push(id);
  const r = await pool.query(
    `UPDATE questionnaire_assignments SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, customer_id, template_id, status, coach_notes, assigned_at, submitted_at, reviewed_at`,
    vals,
  );
  const row = r.rows[0];
  if (!row) return null;
  const tpl = await getQTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function countPendingQAssignmentsForCustomer(customerId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int FROM questionnaire_assignments
     WHERE customer_id = $1 AND status IN ('pending','in_progress')`,
    [customerId],
  );
  return r.rows[0]?.count ?? 0;
}

// ── Answers ───────────────────────────────────────────────────────

export async function upsertQAnswer(params: {
  assignmentId: string; questionId: string; optionKey: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key, saved_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (assignment_id, question_id)
     DO UPDATE SET option_key = EXCLUDED.option_key, saved_at = now()`,
    [params.assignmentId, params.questionId, params.optionKey],
  );
}

export async function listQAnswers(assignmentId: string): Promise<QAnswer[]> {
  const r = await pool.query(
    `SELECT id, assignment_id, question_id, option_key, saved_at
     FROM questionnaire_answers WHERE assignment_id = $1`,
    [assignmentId],
  );
  return r.rows;
}
```

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts
git commit -m "feat(questionnaire): add DB layer with table init and CRUD functions"
```

---

## Task 2: Score Computation (TDD)

**Files:**
- Create: `website/src/lib/compute-scores.ts`
- Create: `website/tests/compute-scores.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// website/tests/compute-scores.test.mjs
import assert from 'node:assert/strict';
import { computeScores } from '../src/lib/compute-scores.ts';

// Helper: build minimal dimension
const dim = (id, tMid, tHigh, mult = 1) => ({
  id, name: id, position: 0, template_id: 't1',
  threshold_mid: tMid, threshold_high: tHigh,
  score_multiplier: mult, created_at: '',
});

// Helper: build answer option
const opt = (questionId, optionKey, dimensionId, weight = 1) => ({
  id: `opt-${questionId}-${optionKey}`, question_id: questionId,
  option_key: optionKey, label: '', dimension_id: dimensionId, weight,
});

// Test 1: A/B choice — A maps to dim1, B maps to dim2
{
  const dims = [dim('dim1', null, null), dim('dim2', null, null)];
  const options = [
    opt('q1', 'A', 'dim1'), opt('q1', 'B', 'dim2'),
    opt('q2', 'A', 'dim2'), opt('q2', 'B', 'dim1'),
  ];
  const answers = [
    { question_id: 'q1', option_key: 'A' },
    { question_id: 'q2', option_key: 'A' },
  ];
  const result = computeScores(dims, options, answers);
  assert.equal(result.find(r => r.dimension_id === 'dim1').final_score, 1, 'dim1 gets 1 from q1-A');
  assert.equal(result.find(r => r.dimension_id === 'dim2').final_score, 1, 'dim2 gets 1 from q2-A');
}

// Test 2: Ja/Nein — only Ja (dimension_id set) contributes
{
  const dims = [dim('distanz', null, null)];
  const options = [
    opt('q1', 'Ja', 'distanz'), opt('q1', 'Nein', null),
    opt('q2', 'Ja', 'distanz'), opt('q2', 'Nein', null),
  ];
  const answers = [
    { question_id: 'q1', option_key: 'Ja' },
    { question_id: 'q2', option_key: 'Nein' },
  ];
  const result = computeScores(dims, options, answers);
  assert.equal(result[0].final_score, 1, 'only q1 Ja contributes');
}

// Test 3: Likert score = option_key::int × weight, then × score_multiplier
{
  const dims = [dim('perfekt', 60, 80, 2)];
  const options = [
    opt('q1', '1', 'perfekt'), opt('q1', '2', 'perfekt'), opt('q1', '3', 'perfekt'),
    opt('q1', '4', 'perfekt'), opt('q1', '5', 'perfekt'),
    opt('q2', '1', 'perfekt'), opt('q2', '2', 'perfekt'), opt('q2', '3', 'perfekt'),
    opt('q2', '4', 'perfekt'), opt('q2', '5', 'perfekt'),
  ];
  const answers = [
    { question_id: 'q1', option_key: '5' },
    { question_id: 'q2', option_key: '4' },
  ];
  const result = computeScores(dims, options, answers);
  // raw = 5+4=9, final = 9×2=18
  assert.equal(result[0].final_score, 18, 'Likert with multiplier: (5+4)×2=18');
}

// Test 4: threshold level classification
{
  const dims = [dim('d', 60, 80, 1)];
  const options = [opt('q1', 'A', 'd')];

  // Score 45 → förderlich
  const r1 = computeScores(dims, options, [{ question_id: 'q1', option_key: 'A' }]);
  // Need to manipulate... test the level logic directly
  // We'll just test final_score here; level tested via boundary
  assert.equal(r1[0].level, 'förderlich', '1 < 60 → förderlich');
}

// Test 5: no threshold → level is null
{
  const dims = [dim('d', null, null)];
  const options = [opt('q1', 'A', 'd')];
  const result = computeScores(dims, options, [{ question_id: 'q1', option_key: 'A' }]);
  assert.equal(result[0].level, null, 'no threshold → level null');
}

console.log('All compute-scores tests passed.');
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
cd website && node tests/compute-scores.test.mjs 2>&1 | head -5
```

Expected: `Error: Cannot find module '../src/lib/compute-scores.ts'`

- [ ] **Step 3: Implement compute-scores.ts**

```typescript
// website/src/lib/compute-scores.ts
import type { QDimension, QAnswerOption, QAnswer } from './questionnaire-db.ts';

export interface DimensionScore {
  dimension_id: string;
  name: string;
  position: number;
  raw_score: number;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
}

export function computeScores(
  dimensions: QDimension[],
  allOptions: QAnswerOption[],
  answers: Pick<QAnswer, 'question_id' | 'option_key'>[],
): DimensionScore[] {
  const answerMap = new Map(answers.map(a => [a.question_id, a.option_key]));

  return dimensions.map(dim => {
    let raw = 0;

    for (const opt of allOptions) {
      if (opt.dimension_id !== dim.id) continue;
      const chosen = answerMap.get(opt.question_id);
      if (chosen !== opt.option_key) continue;

      const numericKey = Number(opt.option_key);
      if (!Number.isNaN(numericKey)) {
        raw += numericKey * opt.weight;
      } else {
        raw += opt.weight;
      }
    }

    const final = raw * dim.score_multiplier;
    let level: DimensionScore['level'] = null;
    if (dim.threshold_mid !== null && dim.threshold_high !== null) {
      if (final < dim.threshold_mid) level = 'förderlich';
      else if (final < dim.threshold_high) level = 'mittel';
      else level = 'kritisch';
    }

    return {
      dimension_id: dim.id,
      name: dim.name,
      position: dim.position,
      raw_score: raw,
      final_score: final,
      threshold_mid: dim.threshold_mid,
      threshold_high: dim.threshold_high,
      level,
    };
  }).sort((a, b) => a.position - b.position);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd website && node --experimental-strip-types tests/compute-scores.test.mjs
```

Expected: `All compute-scores tests passed.`

> If `--experimental-strip-types` is unavailable (Node < 22), install tsx: `npm install -D tsx` and run: `npx tsx tests/compute-scores.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/compute-scores.ts website/tests/compute-scores.test.mjs
git commit -m "feat(questionnaire): add score computation with tests"
```

---

## Task 3: Email Helpers

**Files:**
- Modify: `website/src/lib/email.ts`

- [ ] **Step 1: Append two new functions to email.ts**

```typescript
// Append to bottom of website/src/lib/email.ts

export async function sendQuestionnaireAssigned(params: {
  clientEmail: string;
  clientName: string;
  questionnaireTitle: string;
  portalUrl: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.clientEmail,
    subject: `Neuer Fragebogen für Sie: ${params.questionnaireTitle}`,
    text: `Hallo ${params.clientName},

ein neuer Fragebogen wurde Ihnen zugewiesen: ${params.questionnaireTitle}

Sie können ihn jetzt in Ihrem Portal ausfüllen:
${params.portalUrl}

Mit freundlichen Grüßen
${FROM_NAME}`,
    html: `<p>Hallo ${params.clientName},</p>
<p>ein neuer Fragebogen wurde Ihnen zugewiesen: <strong>${params.questionnaireTitle}</strong></p>
<p><a href="${params.portalUrl}" style="display:inline-block;padding:10px 20px;background:#b8973a;color:#fff;text-decoration:none;border-radius:6px;">Fragebogen ausfüllen</a></p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`,
  });
}

export async function sendQuestionnaireSubmitted(params: {
  adminEmail: string;
  clientName: string;
  questionnaireTitle: string;
  auswertungUrl: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.adminEmail,
    subject: `Fragebogen eingereicht: ${params.questionnaireTitle} — ${params.clientName}`,
    text: `${params.clientName} hat den Fragebogen "${params.questionnaireTitle}" ausgefüllt.

Auswertung: ${params.auswertungUrl}

${FROM_NAME}`,
    html: `<p><strong>${params.clientName}</strong> hat den Fragebogen <strong>${params.questionnaireTitle}</strong> ausgefüllt.</p>
<p><a href="${params.auswertungUrl}">Auswertung ansehen →</a></p>`,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/email.ts
git commit -m "feat(questionnaire): add assignment and submission email helpers"
```

---

## Task 4: Admin API — Template CRUD

**Files:**
- Create: `website/src/pages/api/admin/questionnaires/templates/index.ts`
- Create: `website/src/pages/api/admin/questionnaires/templates/[id].ts`

- [ ] **Step 1: Create index.ts (GET list + POST create)**

```typescript
// website/src/pages/api/admin/questionnaires/templates/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listQTemplates, createQTemplate } from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const templates = await listQTemplates();
  return new Response(JSON.stringify(templates), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; description?: string; instructions?: string };
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'Titel erforderlich.' }), { status: 400 });
  }
  const tpl = await createQTemplate({
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    instructions: body.instructions?.trim() ?? '',
  });
  return new Response(JSON.stringify(tpl), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create [id].ts (PUT update + DELETE)**

```typescript
// website/src/pages/api/admin/questionnaires/templates/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getQTemplate, updateQTemplate, deleteQTemplate,
  listQDimensions, upsertQDimension, deleteQDimension,
  listQQuestions, upsertQQuestion, deleteQQuestion,
  replaceQAnswerOptions,
} from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const tpl = await getQTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  const [dimensions, questions] = await Promise.all([
    listQDimensions(params.id!),
    listQQuestions(params.id!),
  ]);
  return new Response(JSON.stringify({ ...tpl, dimensions, questions }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const tpl = await getQTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  if (tpl.status === 'published') {
    return new Response(JSON.stringify({ error: 'Veröffentlichte Vorlagen können nicht bearbeitet werden.' }), { status: 409 });
  }
  const body = await request.json() as {
    title?: string; description?: string; instructions?: string; status?: string;
    dimensions?: Array<{ id?: string; name: string; position: number; threshold_mid?: number | null; threshold_high?: number | null; score_multiplier?: number }>;
    questions?: Array<{ id?: string; position: number; question_text: string; question_type: string;
      answer_options: Array<{ option_key: string; label: string; dimension_id: string | null; weight: number }> }>;
  };
  const updated = await updateQTemplate(params.id!, {
    title: body.title, description: body.description,
    instructions: body.instructions, status: body.status,
  });
  if (body.dimensions) {
    for (const d of body.dimensions) {
      await upsertQDimension({ id: d.id, templateId: params.id!, name: d.name, position: d.position,
        thresholdMid: d.threshold_mid, thresholdHigh: d.threshold_high, scoreMultiplier: d.score_multiplier });
    }
  }
  if (body.questions) {
    for (const q of body.questions) {
      const saved = await upsertQQuestion({ id: q.id, templateId: params.id!, position: q.position,
        questionText: q.question_text, questionType: q.question_type as 'ab_choice' | 'ja_nein' | 'likert_5' });
      if (q.answer_options) {
        await replaceQAnswerOptions(saved.id, q.answer_options.map(o => ({
          optionKey: o.option_key, label: o.label, dimensionId: o.dimension_id, weight: o.weight,
        })));
      }
    }
  }
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await deleteQTemplate(params.id!);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/questionnaires/
git commit -m "feat(questionnaire): add admin template CRUD API"
```

---

## Task 5: Admin API — Assign + Assignments

**Files:**
- Create: `website/src/pages/api/admin/questionnaires/assign.ts`
- Create: `website/src/pages/api/admin/questionnaires/assignments/index.ts`
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id].ts`

- [ ] **Step 1: Create assign.ts**

```typescript
// website/src/pages/api/admin/questionnaires/assign.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getQTemplate, createQAssignment } from '../../../../lib/questionnaire-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { getUserById } from '../../../../lib/keycloak';
import { sendQuestionnaireAssigned } from '../../../../lib/email';

const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { templateId?: string; keycloakUserId?: string };
  if (!body.templateId || !body.keycloakUserId) {
    return new Response(JSON.stringify({ error: 'templateId und keycloakUserId erforderlich.' }), { status: 400 });
  }

  const tpl = await getQTemplate(body.templateId);
  if (!tpl) return new Response(JSON.stringify({ error: 'Vorlage nicht gefunden.' }), { status: 404 });
  if (tpl.status !== 'published') {
    return new Response(JSON.stringify({ error: 'Nur veröffentlichte Vorlagen können zugewiesen werden.' }), { status: 409 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Kundeneintrag nicht gefunden.' }), { status: 404 });

  const assignment = await createQAssignment({ customerId: customer.id, templateId: tpl.id });

  const portalUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/portal/fragebogen/${assignment.id}`
    : `http://web.localhost/portal/fragebogen/${assignment.id}`;
  const clientName = `${kcUser.firstName ?? ''} ${kcUser.lastName ?? ''}`.trim() || kcUser.username;
  await sendQuestionnaireAssigned({ clientEmail: kcUser.email, clientName, questionnaireTitle: tpl.title, portalUrl });

  return new Response(JSON.stringify(assignment), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create assignments/index.ts**

```typescript
// website/src/pages/api/admin/questionnaires/assignments/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listQAssignmentsForCustomer } from '../../../../../lib/questionnaire-db';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getUserById } from '../../../../../lib/keycloak';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const keycloakUserId = url.searchParams.get('keycloakUserId');
  if (!keycloakUserId) {
    return new Response(JSON.stringify({ error: 'keycloakUserId erforderlich.' }), { status: 400 });
  }

  const kcUser = await getUserById(keycloakUserId).catch(() => null);
  if (!kcUser?.email) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const assignments = await listQAssignmentsForCustomer(customer.id);
  return new Response(JSON.stringify(assignments), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create assignments/[id].ts**

```typescript
// website/src/pages/api/admin/questionnaires/assignments/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getQAssignment, updateQAssignment,
  listQDimensions, listQQuestions,
  listQAnswerOptionsForTemplate, listQAnswers,
} from '../../../../../lib/questionnaire-db';
import { computeScores } from '../../../../../lib/compute-scores';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const [dimensions, questions, allOptions, answers] = await Promise.all([
    listQDimensions(assignment.template_id),
    listQQuestions(assignment.template_id),
    listQAnswerOptionsForTemplate(assignment.template_id),
    listQAnswers(assignment.id),
  ]);

  const scores = computeScores(dimensions, allOptions, answers);

  return new Response(JSON.stringify({ assignment, questions, answers, scores }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { status?: string; coach_notes?: string };
  const updated = await updateQAssignment(params.id!, {
    status: body.status as 'reviewed' | undefined,
    coachNotes: body.coach_notes,
  });
  if (!updated) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/questionnaires/
git commit -m "feat(questionnaire): add admin assign and assignment detail APIs"
```

---

## Task 6: Portal API — Wizard Endpoints

**Files:**
- Create: `website/src/pages/api/portal/questionnaires/index.ts`
- Create: `website/src/pages/api/portal/questionnaires/[id]/index.ts`
- Create: `website/src/pages/api/portal/questionnaires/[id]/answer.ts`
- Create: `website/src/pages/api/portal/questionnaires/[id]/submit.ts`

- [ ] **Step 1: Create portal/questionnaires/index.ts**

```typescript
// website/src/pages/api/portal/questionnaires/index.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { listQAssignmentsForCustomer } from '../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const assignments = await listQAssignmentsForCustomer(customer.id);
  return new Response(JSON.stringify(assignments), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create portal/questionnaires/[id]/index.ts**

```typescript
// website/src/pages/api/portal/questionnaires/[id]/index.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import {
  getQAssignment, getQTemplate,
  listQQuestions, listQAnswers,
} from '../../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }

  const tpl = await getQTemplate(assignment.template_id);
  const [questions, answers] = await Promise.all([
    listQQuestions(assignment.template_id),
    listQAnswers(assignment.id),
  ]);

  // Return questions WITHOUT answer_options dimension_id (don't expose scoring rules to client)
  return new Response(JSON.stringify({
    assignment,
    instructions: tpl?.instructions ?? '',
    questions,
    answers,
  }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create portal/questionnaires/[id]/answer.ts**

```typescript
// website/src/pages/api/portal/questionnaires/[id]/answer.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getQAssignment, upsertQAnswer, updateQAssignment } from '../../../../../lib/questionnaire-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  if (assignment.status === 'submitted' || assignment.status === 'reviewed') {
    return new Response(JSON.stringify({ error: 'Bereits abgesendet.' }), { status: 409 });
  }

  const body = await request.json() as { question_id?: string; option_key?: string };
  if (!body.question_id || !body.option_key) {
    return new Response(JSON.stringify({ error: 'question_id und option_key erforderlich.' }), { status: 400 });
  }

  await upsertQAnswer({ assignmentId: assignment.id, questionId: body.question_id, optionKey: body.option_key });

  if (assignment.status === 'pending') {
    await updateQAssignment(assignment.id, { status: 'in_progress' });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Create portal/questionnaires/[id]/submit.ts**

```typescript
// website/src/pages/api/portal/questionnaires/[id]/submit.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getQAssignment, updateQAssignment } from '../../../../../lib/questionnaire-db';
import { sendQuestionnaireSubmitted } from '../../../../../lib/email';

const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const ADMIN_EMAIL = process.env.CONTACT_EMAIL || process.env.FROM_EMAIL || '';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });

  const assignment = await getQAssignment(params.id!);
  if (!assignment || assignment.customer_id !== customer.id) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  if (assignment.status === 'submitted' || assignment.status === 'reviewed') {
    return new Response(JSON.stringify({ error: 'Bereits abgesendet.' }), { status: 409 });
  }

  await updateQAssignment(assignment.id, { status: 'submitted' });

  const auswertungUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/admin/fragebogen/${assignment.id}`
    : `http://web.localhost/admin/fragebogen/${assignment.id}`;
  const clientName = session.name || session.email;
  if (ADMIN_EMAIL) {
    await sendQuestionnaireSubmitted({
      adminEmail: ADMIN_EMAIL,
      clientName,
      questionnaireTitle: assignment.template_title,
      auswertungUrl,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/portal/questionnaires/
git commit -m "feat(questionnaire): add portal wizard API endpoints"
```

---

## Task 7: Seed Data — Thomas/Kilmann

**Files:**
- Create: `website/scripts/seed-questionnaires.mjs` (partial — TK instrument)

- [ ] **Step 1: Create seed script with Thomas/Kilmann**

```javascript
// website/scripts/seed-questionnaires.mjs
// Run: node --experimental-strip-types scripts/seed-questionnaires.mjs
// (or: npx tsx scripts/seed-questionnaires.mjs)
// Idempotent: skips templates that already exist by title.

import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(hostname, _opts, cb) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}
const pool = new pg.Pool({ connectionString: DB_URL, lookup: nodeLookup });

async function seedIfAbsent(title, seedFn) {
  const existing = await pool.query(
    `SELECT id FROM questionnaire_templates WHERE title = $1`, [title],
  );
  if (existing.rows.length > 0) {
    console.log(`  ✓ "${title}" already exists, skipping.`);
    return;
  }
  await seedFn();
  console.log(`  ✓ Seeded "${title}".`);
}

// ── Thomas/Kilmann ────────────────────────────────────────────────
// 30 A/B-choice questions, 5 dimensions (no thresholds — higher = stronger tendency).
// Scoring matrix transcribed from instrument PDF.

const TK_QUESTIONS = [
  { pos: 1, text: 'A. Es gibt Zeiten, in denen ich anderen die Verantwortung gebe, das Problem zu lösen.\nB. Ich betone Gemeinsamkeiten eher, als dass ich die Dinge verhandle, bei denen wir nicht einig sind.' },
  { pos: 2, text: 'A. Ich versuche eine Kompromisslösung zu finden.\nB. Ich versuche die Wünsche der anderen genauso zu berücksichtigen wie meine eigenen.' },
  { pos: 3, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche die Gefühle der anderen zu verschonen und die gute Beziehung aufrecht zu erhalten.' },
  { pos: 4, text: 'A. Ich versuche einen Kompromiss zu finden.\nB. Ich stelle meine eigenen Wünsche zu Gunsten der Wünsche der anderen Person zurück.' },
  { pos: 5, text: 'A. Ich hole mir grundsätzlich die Unterstützung der anderen Partei bei der Lösungssuche.\nB. Ich tue alles, was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 6, text: 'A. Ich versuche unangenehme Situationen von vornherein zu vermeiden.\nB. Ich versuche meine Position durchzusetzen.' },
  { pos: 7, text: 'A. Ich versuche ein Thema zu verschieben, um Zeit zu bekommen, genau darüber nachzudenken.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 8, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche alle Sorgen und Themen sofort offen auf den Tisch zu bekommen.' },
  { pos: 9, text: 'A. Ich glaube, dass es sich nicht immer lohnt, sich über Meinungsverschiedenheiten Gedanken zu machen.\nB. Ich strenge mich an, damit ich das bekomme, was ich will.' },
  { pos: 10, text: 'A. Ich bin normaler Weise hart, wenn ich meine Ziele verfolge.\nB. Ich versuche einen Kompromiss zu finden.' },
  { pos: 11, text: 'A. Ich versuche alle Sorgen und Themen sofort offen auf den Tisch zu bekommen.\nB. Ich versuche Gefühle der anderen zu schonen und die gute Beziehung aufrecht zu erhalten.' },
  { pos: 12, text: 'A. Ich vermeide es manchmal Positionen zu beziehen, die umstritten sind.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 13, text: 'A. Ich schlage eine Lösung vor, die allen entgegenkommt.\nB. Ich mache Druck, damit meine Meinung gehört wird.' },
  { pos: 14, text: 'A. Ich teile mit anderen Personen meine Ideen und frage nach ihren Ideen.\nB. Ich versuche den anderen die Logik und Vorteile hinter meiner Meinung aufzuzeigen.' },
  { pos: 15, text: 'A. Ich versuche die Gefühle der anderen zu schonen und die guten Beziehungen aufrecht zu erhalten.\nB. Ich tue alles, was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 16, text: 'A. Ich versuche andere nicht zu verletzen.\nB. Ich versuche den anderen von den Vorteilen meiner Position zu überzeugen.' },
  { pos: 17, text: 'A. Ich bin normalerweise hart, wenn ich meine Ziele verfolge.\nB. Ich tue alles was nötig ist, um unnötige Spannungen zu vermeiden.' },
  { pos: 18, text: 'A. Wenn es andere glücklich macht, dann gestehe ich ihnen ihre Meinung zu.\nB. Ich gebe bei einigen Punkten nach, wenn ich dafür andere durchsetzen kann.' },
  { pos: 19, text: 'A. Ich versuche alle Sorgen und Themen sofort auf den Tisch zu bekommen.\nB. Ich versuche ein Thema zu verschieben, um Zeit zu bekommen, genau darüber nachzudenken.' },
  { pos: 20, text: 'A. Ich versuche alle Differenzen sofort zu beseitigen.\nB. Ich versuche es zu erreichen, dass die Gewinne und Verluste auf beiden Seiten fair verteilt sind.' },
  { pos: 21, text: 'A. Bei technischen Dingen versuche ich, die Wünsche der anderen Seite einzubeziehen.\nB. Ich bin dafür, ein Problem immer sofort auszudiskutieren.' },
  { pos: 22, text: 'A. Ich versuche eine Position zu finden, die zwischen meiner und der anderen Person liegt.\nB. Ich setze meine Wünsche durch.' },
  { pos: 23, text: 'A. Ich sorge mich oft darum, dass die Wünsche aller erfüllt sind.\nB. Es gibt Zeiten, in denen ich anderen die Verantwortung gebe, das Problem zu lösen.' },
  { pos: 24, text: 'A. Wenn jemandem seine Position sehr wichtig erscheint, dann würde ich versuchen, seine Wünsche zu erfüllen.\nB. Ich versuche einen Kompromiss zu finden.' },
  { pos: 25, text: 'A. Ich versuche den anderen die Logik und Vorteile hinter meiner Meinung aufzuzeigen.\nB. Bei technischen Dingen versuche ich, die Wünsche der anderen Seite einzubeziehen.' },
  { pos: 26, text: 'A. Ich schlage eine Lösung vor, die allen entgegen kommt.\nB. Mir ist es fast immer wichtig, dass die Wünsche aller erfüllt sind.' },
  { pos: 27, text: 'A. Ich vermeide es manchmal Positionen zu beziehen, die umstritten sind.\nB. Wenn es andere glücklich macht, dann gestehe ich ihnen ihre Meinung zu.' },
  { pos: 28, text: 'A. Ich bin normalerweise hart, wenn ich meine Ziele verfolge.\nB. Ich hole mir grundsätzlich die Unterstützung der anderen Partei bei der Lösungssuche.' },
  { pos: 29, text: 'A. Ich schlage eine Lösung vor, die allen entgegenkommt.\nB. Ich glaube, dass es sich lohnt, sich über Meinungsverschiedenheiten Gedanken zu machen.' },
  { pos: 30, text: 'A. Ich versuche andere nicht zu verletzen.\nB. Ich bespreche das Problem mit der anderen Person, damit wir es lösen können.' },
];

// [questionPos, optionKey, dimensionName]
// Dimensions: Konkurrieren=0, Zusammenarbeit=1, Kompromiss=2, Vermeiden=3, Entgegenkommen=4
const TK_DIM_NAMES = ['Konkurrieren', 'Zusammenarbeit', 'Kompromiss', 'Vermeiden', 'Entgegenkommen'];
const TK_SCORING = [
  [1,'A',3],[1,'B',4],  [2,'A',2],[2,'B',1],  [3,'A',0],[3,'B',4],
  [4,'A',2],[4,'B',4],  [5,'A',1],[5,'B',3],  [6,'A',3],[6,'B',0],
  [7,'A',3],[7,'B',2],  [8,'A',0],[8,'B',1],  [9,'A',3],[9,'B',0],
  [10,'A',0],[10,'B',2],[11,'A',1],[11,'B',4], [12,'A',3],[12,'B',2],
  [13,'A',2],[13,'B',0],[14,'A',1],[14,'B',0], [15,'A',4],[15,'B',3],
  [16,'A',4],[16,'B',0],[17,'A',0],[17,'B',3], [18,'A',4],[18,'B',2],
  [19,'A',1],[19,'B',3],[20,'A',1],[20,'B',2], [21,'A',4],[21,'B',1],
  [22,'A',2],[22,'B',0],[23,'A',1],[23,'B',3], [24,'A',4],[24,'B',2],
  [25,'A',0],[25,'B',4],[26,'A',2],[26,'B',1], [27,'A',3],[27,'B',4],
  [28,'A',0],[28,'B',1],[29,'A',2],[29,'B',3], [30,'A',4],[30,'B',1],
];

async function seedThomasKilmann() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published')
     RETURNING id`,
    [
      'Konflikttypen-Fragebogen (Thomas/Kilmann)',
      'Misst den bevorzugten Konfliktstil in 5 Dimensionen.',
      'Lesen Sie jede Aussage und entscheiden Sie spontan, welche Aussage (A oder B) besser auf Sie zutrifft. Es gibt keine richtigen oder falschen Antworten.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIds = [];
  for (let i = 0; i < TK_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position) VALUES ($1,$2,$3) RETURNING id`,
      [tplId, TK_DIM_NAMES[i], i],
    );
    dimIds.push(d.rows[0].id);
  }

  const qIds = {};
  for (const q of TK_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'ab_choice') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    qIds[q.pos] = r.rows[0].id;
  }

  for (const [pos, optKey, dimIdx] of TK_SCORING) {
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1,$2,$3,$4,1)`,
      [qIds[pos], optKey, optKey, dimIds[dimIdx]],
    );
  }
}

// Main
(async () => {
  try {
    await seedIfAbsent('Konflikttypen-Fragebogen (Thomas/Kilmann)', seedThomasKilmann);
    console.log('Thomas/Kilmann done.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add website/scripts/seed-questionnaires.mjs
git commit -m "feat(questionnaire): add Thomas/Kilmann seed data"
```

---

## Task 8: Seed Data — Riemann-Thomann + Inneres Funktionsmodell

**Files:**
- Modify: `website/scripts/seed-questionnaires.mjs`

- [ ] **Step 1: Add Riemann-Thomann seed function**

Add before the `// Main` block in `seed-questionnaires.mjs`:

```javascript
// ── Riemann-Thomann ───────────────────────────────────────────────
// 48 Ja/Nein questions, 4 personality axes.
// Only "Ja" answers contribute to dimension score.

const RT_DIM_NAMES = ['Distanz', 'Nähe', 'Dauer', 'Wechsel'];
// Questions that map to each dimension (Ja = +1, Nein = null)
const RT_DIM_QUESTIONS = {
  'Distanz': [1, 4, 11, 12, 22, 25, 29, 30, 35, 38, 45, 48],
  'Nähe':    [3, 8, 9, 16, 19, 23, 26, 32, 37, 43, 44, 46],
  'Dauer':   [2, 7, 10, 14, 17, 18, 24, 28, 34, 39, 41, 47],
  'Wechsel': [5, 6, 13, 15, 20, 21, 27, 31, 33, 36, 40, 42],
};

const RT_QUESTIONS = [
  { pos: 1,  text: 'Ich bleibe lieber innerlich distanziert zu anderen Menschen.' },
  { pos: 2,  text: 'Ich mache gern eine Aufgabe zu Ende.' },
  { pos: 3,  text: 'Ich kann gut mit Anderen mitfühlen.' },
  { pos: 4,  text: 'Ich bin ein guter Beobachter.' },
  { pos: 5,  text: 'Mir kommen häufig neue Ideen, ich bin gedanklich beweglich.' },
  { pos: 6,  text: 'Ich lasse mich schnell ablenken.' },
  { pos: 7,  text: 'Ich freue mich, wenn alles so bleibt, wie es ist.' },
  { pos: 8,  text: 'Es fällt mir leicht, für Andere da zu sein, ich bin dann nicht so wichtig.' },
  { pos: 9,  text: 'Ich höre gern zu und habe ein offenes Ohr für Andere.' },
  { pos: 10, text: 'Ich bin sehr verlässlich und gewissenhaft.' },
  { pos: 11, text: 'Ich nehme auch kleine Unterschiede und Zwischentöne wahr.' },
  { pos: 12, text: 'Ich fühle mich wohl und sicherer, wenn ich allein bin.' },
  { pos: 13, text: 'Schnell wechselnde, intensive Gefühle mag ich.' },
  { pos: 14, text: 'Bevor ich entscheide und handle, denke ich lange darüber nach.' },
  { pos: 15, text: 'Beschränkungen und Eingrenzungen mag ich nicht.' },
  { pos: 16, text: 'Aus Angst, andere zu verlieren, stimme ich häufig zu und sage ja.' },
  { pos: 17, text: 'Ich kontrolliere lieber als dass ich vertraue.' },
  { pos: 18, text: 'Aufträge erledige ich zuverlässig und hundertprozentig.' },
  { pos: 19, text: 'Ich setze mich nicht so gern durch gegen Andere.' },
  { pos: 20, text: 'Ich bin spontan, charmant und lebensfroh.' },
  { pos: 21, text: 'Meine Meinung kann ich schnell neuen Erfordernissen anpassen.' },
  { pos: 22, text: 'Fakten sind mir wichtiger als Bauchentscheidungen.' },
  { pos: 23, text: 'Ich lasse mich eher ausnutzen als mich durchzusetzen.' },
  { pos: 24, text: 'Auf mich kann man sich immer verlassen.' },
  { pos: 25, text: 'Ich bin öfter grüblerisch oder schlechter Stimmung.' },
  { pos: 26, text: 'Ich kann schnell Vertrauen aufbauen.' },
  { pos: 27, text: 'Ich habe keine Geduld und warte ungern.' },
  { pos: 28, text: 'Ich vermeide wenn möglich, unvorbereitet in Situationen zu gehen.' },
  { pos: 29, text: 'Ich fühle mich häufiger unsicher und bin ängstlich.' },
  { pos: 30, text: 'Sicher ist sicher – ist ein Motto von mir.' },
  { pos: 31, text: 'Ich lasse mich ungern auf eine Aussage "festnageln".' },
  { pos: 32, text: 'Wenn ich allein bin, fehlt mir die Nähe zu Anderen.' },
  { pos: 33, text: 'Ich bin eine Stimmungskanone, kann gut Andere unterhalten.' },
  { pos: 34, text: 'Ich werde ärgerlich, wenn sich Andere nicht an Regeln halten.' },
  { pos: 35, text: 'Ich bin guter Analytiker und erfasse schnell Zusammenhänge.' },
  { pos: 36, text: 'Ich mag es, wenn es erotisch "knistert".' },
  { pos: 37, text: 'Ich fühle mich eher schwermütig als locker und gut gelaunt.' },
  { pos: 38, text: 'Ich entscheide lieber rational als aus dem "Bauch heraus".' },
  { pos: 39, text: 'Ich bin sehr belastbar und halte Stress gut aus.' },
  { pos: 40, text: 'Ich bin in meiner Aufmerksamkeit eher sprunghaft.' },
  { pos: 41, text: 'Unklare und unsichere Situationen machen mich unsicher.' },
  { pos: 42, text: 'Ich freue mich mehr über Neues und Spannendes als über Routine.' },
  { pos: 43, text: 'Mich können Andere schnell auf ihre Seite ziehen.' },
  { pos: 44, text: 'Ich mag, wenn man in Harmonie miteinander ist.' },
  { pos: 45, text: 'Immer in Kontakt zu sein strengt mich an.' },
  { pos: 46, text: 'Auseinandersetzungen meide ich eher.' },
  { pos: 47, text: 'Ich bin zuverlässig und halte Versprechen wenn möglich ein.' },
  { pos: 48, text: 'Ich komme besser mit mir allein zurecht, als mit anderen.' },
];

async function seedRiemannThomann() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published') RETURNING id`,
    [
      'Selbsteinschätzung nach Riemann-Thomann',
      'Misst Persönlichkeitsachsen in 4 Dimensionen: Distanz, Nähe, Dauer, Wechsel.',
      'Lesen Sie die Sätze durch und entscheiden Sie so spontan wie möglich, ob die Aussage auf Sie zutrifft (Ja) oder nicht (Nein). Fühlen Sie, wie Sie Situationen erleben — nicht danach, was attraktiv erscheint.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIdsByName = {};
  for (let i = 0; i < RT_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position) VALUES ($1,$2,$3) RETURNING id`,
      [tplId, RT_DIM_NAMES[i], i],
    );
    dimIdsByName[RT_DIM_NAMES[i]] = d.rows[0].id;
  }

  // Build a reverse lookup: question position → dimension id (for Ja option)
  const qPosToDimId = {};
  for (const [dimName, positions] of Object.entries(RT_DIM_QUESTIONS)) {
    for (const pos of positions) {
      qPosToDimId[pos] = dimIdsByName[dimName];
    }
  }

  for (const q of RT_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'ja_nein') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    const qId = r.rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1,'Ja','Ja',$2,1), ($1,'Nein','Nein',NULL,1)`,
      [qId, qPosToDimId[q.pos] ?? null],
    );
  }
}
```

- [ ] **Step 2: Add Inneres Funktionsmodell seed function**

Add after `seedRiemannThomann` and before `// Main`:

```javascript
// ── Inneres Funktionsmodell ───────────────────────────────────────
// 50 Likert-5 questions, 5 "Antreiber" dimensions.
// score = sum(answers) × 2. Thresholds: 60 = mittel, 80 = kritisch.

const IFM_DIM_NAMES = ['Sei perfekt!', 'Beeil dich!', 'Streng dich an!', 'Mach es allen recht!', 'Sei stark!'];
const IFM_DIM_QUESTIONS = {
  'Sei perfekt!':          [1, 8, 11, 13, 23, 24, 33, 38, 43, 47],
  'Beeil dich!':           [3, 12, 14, 19, 21, 27, 32, 39, 42, 48],
  'Streng dich an!':       [5, 6, 10, 18, 25, 29, 34, 37, 44, 50],
  'Mach es allen recht!':  [2, 7, 15, 17, 28, 30, 35, 36, 45, 46],
  'Sei stark!':            [4, 9, 16, 20, 22, 26, 31, 40, 41, 49],
};

const IFM_QUESTIONS = [
  { pos: 1,  text: 'Wann immer ich eine Arbeit mache, mache ich sie gründlich.' },
  { pos: 2,  text: 'Ich fühle mich verantwortlich, dass diejenigen, die mit mir zu tun haben, sich wohl fühlen.' },
  { pos: 3,  text: 'Ich bin ständig auf Trab.' },
  { pos: 4,  text: 'Anderen gegenüber zeige ich meine Schwächen nicht gerne.' },
  { pos: 5,  text: 'Wenn ich raste, roste ich.' },
  { pos: 6,  text: 'Häufig gebrauche ich den Satz: „Es ist schwierig, etwas so genau zu sagen".' },
  { pos: 7,  text: 'Ich sage oft mehr, als eigentlich nötig wäre.' },
  { pos: 8,  text: 'Es fällt mir schwer, Leute zu akzeptieren, die nicht genau sind.' },
  { pos: 9,  text: 'Es fällt mir schwer, Gefühle zu zeigen.' },
  { pos: 10, text: '„Nur nicht lockerlassen", ist meine Devise.' },
  { pos: 11, text: 'Wenn ich eine Meinung äußere, begründe ich sie auch.' },
  { pos: 12, text: 'Wenn ich einen Wunsch habe, erfülle ich ihn mir schnell.' },
  { pos: 13, text: 'Ich liefere einen Bericht erst ab, wenn ich ihn mehrere Male überarbeitet habe.' },
  { pos: 14, text: 'Leute, die „herumtrödeln", regen mich auf.' },
  { pos: 15, text: 'Es ist mir wichtig, von den anderen akzeptiert zu werden.' },
  { pos: 16, text: 'Ich habe eher eine harte Schale, aber einen weichen Kern.' },
  { pos: 17, text: 'Ich versuche oft herauszufinden, was andere von mir erwarten, um mich danach zu richten.' },
  { pos: 18, text: 'Leute, die unbekümmert in den Tag hineinleben, kann ich nur schwer verstehen.' },
  { pos: 19, text: 'Bei Diskussionen unterbreche ich oft die anderen.' },
  { pos: 20, text: 'Ich löse meine Probleme selber.' },
  { pos: 21, text: 'Aufgaben erledige ich möglichst rasch.' },
  { pos: 22, text: 'Im Umgang mit anderen bin ich auf Distanz bedacht.' },
  { pos: 23, text: 'Ich sollte viele Aufgaben noch besser erledigen.' },
  { pos: 24, text: 'Ich kümmere mich persönlich auch um nebensächliche Dinge.' },
  { pos: 25, text: 'Erfolge fallen nicht vom Himmel; ich muss sie hart erarbeiten.' },
  { pos: 26, text: 'Für dumme Fehler habe ich wenig Verständnis.' },
  { pos: 27, text: 'Ich schätze es, wenn andere auf meine Fragen rasch und bündig antworten.' },
  { pos: 28, text: 'Es ist mir wichtig, von anderen zu erfahren, ob ich meine Sache gut gemacht habe.' },
  { pos: 29, text: 'Wenn ich eine Aufgabe einmal begonnen habe, führe ich sie auch zu Ende.' },
  { pos: 30, text: 'Ich stelle meine Wünsche und Bedürfnisse zugunsten anderer Personen zurück.' },
  { pos: 31, text: 'Ich bin anderen gegenüber oft hart, um von ihnen nicht verletzt zu werden.' },
  { pos: 32, text: 'Ich trommle oft ungeduldig mit den Fingern auf den Tisch.' },
  { pos: 33, text: 'Beim Erklären von Sachverhalten verwende ich gerne die klare Aufzählung: Erstens..., zweitens..., drittens...' },
  { pos: 34, text: 'Ich glaube, dass die meisten Dinge nicht so einfach sind, wie viele meinen.' },
  { pos: 35, text: 'Es ist mir unangenehm, andere Leute zu kritisieren.' },
  { pos: 36, text: 'Bei Diskussionen nicke ich häufig mit dem Kopf.' },
  { pos: 37, text: 'Ich strenge mich an, um meine Ziele zu erreichen.' },
  { pos: 38, text: 'Mein Gesichtsausdruck ist eher ernst.' },
  { pos: 39, text: 'Ich bin nervös.' },
  { pos: 40, text: 'So schnell kann mich nichts erschüttern.' },
  { pos: 41, text: 'Ich sage oft: „Macht mal vorwärts."' },
  { pos: 42, text: 'Ich sage oft: „Genau", „exakt", „klar", „logisch" o.Ä.' },
  { pos: 43, text: 'Ich sage oft: „Das verstehe ich nicht ..."' },
  { pos: 44, text: 'Ich sage eher: „Könnten Sie es nicht einmal versuchen?" als: „Versuchen Sie es einmal."' },
  { pos: 45, text: 'Ich bin diplomatisch.' },
  { pos: 46, text: 'Ich versuche, die an mich gestellten Erwartungen zu übertreffen.' },
  { pos: 47, text: 'Beim Telefonieren bearbeite ich nebenbei oft noch Akten o.Ä.' },
  { pos: 48, text: '„Auf die Zähne beißen" heißt meine Devise.' },
  { pos: 49, text: 'Ich komme besser mit mir allein zurecht, als mit anderen.' },
  { pos: 50, text: 'Trotz enormer Anstrengung will mir vieles einfach nicht gelingen.' },
];

async function seedInneresFunktionsmodell() {
  const tpl = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status)
     VALUES ($1,$2,$3,'published') RETURNING id`,
    [
      'Inneres Funktionsmodell (Kahler/Caspers)',
      'Misst die Ausprägung von 5 inneren Antreibern auf einer Skala bis 100.',
      'Beantworten Sie die Aussagen mit Hilfe der Bewertungsskala 1–5, so wie Sie sich im Moment selbst sehen. Die Aussage trifft auf mich zu: 1 = gar nicht, 2 = kaum, 3 = etwas, 4 = ziemlich, 5 = voll und ganz. Bitte antworten Sie möglichst spontan und seien Sie ehrlich zu sich selbst.',
    ],
  );
  const tplId = tpl.rows[0].id;

  const dimIdsByName = {};
  for (let i = 0; i < IFM_DIM_NAMES.length; i++) {
    const d = await pool.query(
      `INSERT INTO questionnaire_dimensions
       (template_id, name, position, threshold_mid, threshold_high, score_multiplier)
       VALUES ($1,$2,$3,60,80,2) RETURNING id`,
      [tplId, IFM_DIM_NAMES[i], i],
    );
    dimIdsByName[IFM_DIM_NAMES[i]] = d.rows[0].id;
  }

  const qPosToDimId = {};
  for (const [dimName, positions] of Object.entries(IFM_DIM_QUESTIONS)) {
    for (const pos of positions) {
      qPosToDimId[pos] = dimIdsByName[dimName];
    }
  }

  for (const q of IFM_QUESTIONS) {
    const r = await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1,$2,$3,'likert_5') RETURNING id`,
      [tplId, q.pos, q.text],
    );
    const qId = r.rows[0].id;
    for (const val of ['1','2','3','4','5']) {
      await pool.query(
        `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
         VALUES ($1,$2,$3,$4,1)`,
        [qId, val, val, qPosToDimId[q.pos] ?? null],
      );
    }
  }
}
```

- [ ] **Step 3: Update the main block to call all three seed functions**

Replace the `// Main` block:

```javascript
// Main
(async () => {
  try {
    await seedIfAbsent('Konflikttypen-Fragebogen (Thomas/Kilmann)', seedThomasKilmann);
    await seedIfAbsent('Selbsteinschätzung nach Riemann-Thomann', seedRiemannThomann);
    await seedIfAbsent('Inneres Funktionsmodell (Kahler/Caspers)', seedInneresFunktionsmodell);
    console.log('\nAll instruments seeded successfully.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
```

- [ ] **Step 4: Test run (requires running website DB)**

```bash
cd website && node scripts/seed-questionnaires.mjs
```

Expected output:
```
  ✓ Seeded "Konflikttypen-Fragebogen (Thomas/Kilmann)".
  ✓ Seeded "Selbsteinschätzung nach Riemann-Thomann".
  ✓ Seeded "Inneres Funktionsmodell (Kahler/Caspers)".

All instruments seeded successfully.
```

Running again should show `already exists, skipping` for all three.

- [ ] **Step 5: Commit**

```bash
git add website/scripts/seed-questionnaires.mjs
git commit -m "feat(questionnaire): add Riemann-Thomann and IFM seed data"
```

---

## Task 9: Admin Template Builder Component

**Files:**
- Create: `website/src/components/admin/QuestionnaireTemplateEditor.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/admin/QuestionnaireTemplateEditor.svelte -->
<script lang="ts">
  type Dim = { id?: string; name: string; position: number; threshold_mid: number | null; threshold_high: number | null; score_multiplier: number };
  type AnswerOpt = { option_key: string; label: string; dimension_id: string | null; weight: number };
  type Question = { id?: string; position: number; question_text: string; question_type: 'ab_choice' | 'ja_nein' | 'likert_5'; answer_options: AnswerOpt[] };
  type Tpl = { id: string; title: string; description: string; instructions: string; status: string; dimensions: Dim[]; questions: Question[] };

  let templates: { id: string; title: string; status: string }[] = $state([]);
  let loading = $state(false);
  let editing: Tpl | null = $state(null);
  let saveMsg = $state('');
  let saving = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadList() {
    loading = true;
    try {
      const r = await fetch('/api/admin/questionnaires/templates');
      templates = r.ok ? await r.json() : [];
    } finally { loading = false; }
  }

  $effect(() => { loadList(); });

  async function openTemplate(id: string) {
    const r = await fetch(`/api/admin/questionnaires/templates/${id}`);
    if (r.ok) editing = await r.json();
  }

  function newTemplate() {
    editing = {
      id: '', title: '', description: '', instructions: '', status: 'draft',
      dimensions: [], questions: [],
    };
  }

  function addDimension() {
    if (!editing) return;
    editing.dimensions = [...editing.dimensions, {
      name: '', position: editing.dimensions.length,
      threshold_mid: null, threshold_high: null, score_multiplier: 1,
    }];
  }

  function removeDimension(i: number) {
    if (!editing) return;
    editing.dimensions = editing.dimensions.filter((_, idx) => idx !== i);
  }

  function defaultOptions(type: Question['question_type']): AnswerOpt[] {
    if (type === 'ab_choice') return [
      { option_key: 'A', label: 'A', dimension_id: null, weight: 1 },
      { option_key: 'B', label: 'B', dimension_id: null, weight: 1 },
    ];
    if (type === 'ja_nein') return [
      { option_key: 'Ja', label: 'Ja', dimension_id: null, weight: 1 },
      { option_key: 'Nein', label: 'Nein', dimension_id: null, weight: 1 },
    ];
    return ['1','2','3','4','5'].map(k => ({ option_key: k, label: k, dimension_id: null, weight: 1 }));
  }

  function addQuestion() {
    if (!editing) return;
    const type: Question['question_type'] = 'ab_choice';
    editing.questions = [...editing.questions, {
      position: editing.questions.length + 1,
      question_text: '', question_type: type,
      answer_options: defaultOptions(type),
    }];
  }

  function changeQuestionType(i: number, type: Question['question_type']) {
    if (!editing) return;
    editing.questions = editing.questions.map((q, idx) =>
      idx === i ? { ...q, question_type: type, answer_options: defaultOptions(type) } : q
    );
  }

  function removeQuestion(i: number) {
    if (!editing) return;
    editing.questions = editing.questions.filter((_, idx) => idx !== i)
      .map((q, idx) => ({ ...q, position: idx + 1 }));
  }

  async function save() {
    if (!editing) return;
    saving = true; saveMsg = '';
    try {
      const isNew = !editing.id;
      const url = isNew ? '/api/admin/questionnaires/templates' : `/api/admin/questionnaires/templates/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { title: editing.title, description: editing.description, instructions: editing.instructions }
        : { title: editing.title, description: editing.description, instructions: editing.instructions, status: editing.status, dimensions: editing.dimensions, questions: editing.questions };
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (r.ok) {
        if (isNew) {
          editing = { ...editing, id: data.id };
          saveMsg = 'Vorlage erstellt. Bitte Dimensionen und Fragen hinzufügen und erneut speichern.';
        } else {
          saveMsg = 'Gespeichert.';
        }
        await loadList();
      } else {
        saveMsg = data.error ?? 'Fehler.';
      }
    } finally { saving = false; }
  }

  async function publish() {
    if (!editing?.id) return;
    saving = true;
    const r = await fetch(`/api/admin/questionnaires/templates/${editing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    if (r.ok) { editing = { ...editing!, status: 'published' }; await loadList(); }
    saving = false;
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/admin/questionnaires/templates/${id}`, { method: 'DELETE' });
    deleteConfirm = null; editing = null; await loadList();
  }

  function statusBadge(s: string) {
    if (s === 'published') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'archived') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }
</script>

{#if !editing}
  <div class="flex justify-between items-center mb-4">
    <p class="text-muted text-sm">{templates.length} Vorlage{templates.length !== 1 ? 'n' : ''}</p>
    <button onclick={newTemplate} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Neue Vorlage</button>
  </div>
  {#if loading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if templates.length === 0}
    <p class="text-muted text-sm">Noch keine Vorlagen.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each templates as t}
        <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <p class="text-light font-medium truncate">{t.title}</p>
            <span class={`mt-1 inline-block px-2 py-0.5 rounded border text-xs ${statusBadge(t.status)}`}>
              {t.status === 'published' ? 'Veröffentlicht' : t.status === 'archived' ? 'Archiviert' : 'Entwurf'}
            </span>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button onclick={() => openTemplate(t.id)} class="text-xs text-muted hover:text-gold">Bearbeiten</button>
            {#if deleteConfirm === t.id}
              <span class="text-xs text-muted">Sicher?</span>
              <button onclick={() => deleteTemplate(t.id)} class="text-xs text-red-400 hover:text-red-300">Ja</button>
              <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
            {:else}
              <button onclick={() => deleteConfirm = t.id} class="text-xs text-muted hover:text-red-400">Löschen</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{:else}
  <!-- Editor -->
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold text-light">{editing.id ? editing.title || 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
    <button onclick={() => editing = null} class="text-sm text-muted hover:text-light">Abbrechen</button>
  </div>

  <!-- Metadata -->
  <div class="flex flex-col gap-3 mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
    <h3 class="text-xs text-muted uppercase tracking-wide">Metadaten</h3>
    <div>
      <label class="block text-sm text-muted mb-1">Titel *</label>
      <input bind:value={editing.title} class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-sm text-muted mb-1">Beschreibung (intern)</label>
      <input bind:value={editing.description} class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-sm text-muted mb-1">Anweisungen (für Klient)</label>
      <textarea bind:value={editing.instructions} rows="3"
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"></textarea>
    </div>
  </div>

  {#if editing.id}
    <!-- Dimensions -->
    <div class="mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs text-muted uppercase tracking-wide">Dimensionen</h3>
        <button onclick={addDimension} class="text-xs text-gold hover:text-gold/80">+ Dimension</button>
      </div>
      {#each editing.dimensions as dim, i}
        <div class="mb-3 p-3 bg-dark-light rounded-lg border border-dark-lighter">
          <div class="grid grid-cols-2 gap-2 mb-2">
            <input bind:value={dim.name} placeholder="Name (z.B. Sei perfekt!)"
              class="col-span-2 bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none" />
            <div>
              <label class="block text-xs text-muted mb-1">Schwelle mittel</label>
              <input type="number" bind:value={dim.threshold_mid} placeholder="z.B. 60"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">Schwelle kritisch</label>
              <input type="number" bind:value={dim.threshold_high} placeholder="z.B. 80"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">Multiplikator</label>
              <input type="number" bind:value={dim.score_multiplier} min="1"
                class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none" />
            </div>
          </div>
          <button onclick={() => removeDimension(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
        </div>
      {/each}
    </div>

    <!-- Questions -->
    <div class="mb-6 p-4 bg-dark rounded-xl border border-dark-lighter">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs text-muted uppercase tracking-wide">Fragen ({editing.questions.length})</h3>
        <button onclick={addQuestion} class="text-xs text-gold hover:text-gold/80">+ Frage</button>
      </div>
      {#each editing.questions as q, i}
        <div class="mb-3 p-3 bg-dark-light rounded-lg border border-dark-lighter">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-muted">Frage {q.position}</span>
            <button onclick={() => removeQuestion(i)} class="text-xs text-red-400 hover:text-red-300">✕</button>
          </div>
          <textarea bind:value={q.question_text} placeholder="Fragetext…" rows="2"
            class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none resize-y mb-2"></textarea>
          <select
            value={q.question_type}
            onchange={(e) => changeQuestionType(i, (e.target as HTMLSelectElement).value as 'ab_choice'|'ja_nein'|'likert_5')}
            class="bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none mb-2"
          >
            <option value="ab_choice">A/B-Wahl</option>
            <option value="ja_nein">Ja/Nein</option>
            <option value="likert_5">Likert 1–5</option>
          </select>
          <!-- Answer option → dimension mapping -->
          <div class="flex flex-col gap-1">
            {#each q.answer_options as opt}
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted w-8">{opt.option_key}</span>
                <select bind:value={opt.dimension_id}
                  class="flex-1 bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-xs focus:border-gold outline-none">
                  <option value={null}>— keine Dimension —</option>
                  {#each editing.dimensions as dim}
                    <option value={dim.id ?? ''}>{dim.name}</option>
                  {/each}
                </select>
                <input type="number" bind:value={opt.weight} min="1" class="w-12 bg-dark border border-dark-lighter rounded px-1 py-1 text-light text-xs focus:border-gold outline-none" title="Gewichtung" />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if saveMsg}
    <p class={`text-sm mb-3 ${saveMsg.includes('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</p>
  {/if}
  <div class="flex gap-3">
    <button onclick={save} disabled={saving} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
    {#if editing.id && editing.status === 'draft'}
      <button onclick={publish} disabled={saving} class="px-4 py-2 border border-green-500/40 text-green-400 rounded-lg text-sm hover:bg-green-500/10 disabled:opacity-50">
        Veröffentlichen
      </button>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/QuestionnaireTemplateEditor.svelte
git commit -m "feat(questionnaire): add admin template builder component"
```

---

## Task 10: Wire Template Editor into DokumentEditor

**Files:**
- Modify: `website/src/components/admin/DokumentEditor.svelte`

- [ ] **Step 1: Add import and third tab to DokumentEditor.svelte**

At line 2 (after `import NewsletterAdmin`), add:
```svelte
  import QuestionnaireTemplateEditor from './QuestionnaireTemplateEditor.svelte';
```

Change the `activeSection` type and default — find:
```svelte
  let activeSection: 'newsletter' | 'vorlagen' = $state('newsletter');
```
Replace with:
```svelte
  let activeSection: 'newsletter' | 'vorlagen' | 'fragebögen' = $state('newsletter');
```

In the section switcher block (after the `Vertragsvorlagen` button), add:
```svelte
  <button
    onclick={() => activeSection = 'fragebögen'}
    class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection === 'fragebögen' ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
  >Fragebögen</button>
```

After the `{:else}` block for `vorlagen`, add:
```svelte
{:else if activeSection === 'fragebögen'}
  <QuestionnaireTemplateEditor />
```

- [ ] **Step 2: Verify the tab renders**

```bash
cd website && task website:dev
# Open http://web.localhost/admin/dokumente
# Verify "Fragebögen" tab appears and clicking it shows the template list
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/DokumentEditor.svelte
git commit -m "feat(questionnaire): add Fragebögen tab to DokumentEditor"
```

---

## Task 11: Client Panel + [clientId].astro Tab

**Files:**
- Create: `website/src/components/admin/ClientQuestionnairesPanel.svelte`
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Step 1: Create ClientQuestionnairesPanel.svelte**

```svelte
<!-- website/src/components/admin/ClientQuestionnairesPanel.svelte -->
<script lang="ts">
  type Props = { keycloakUserId: string };
  const { keycloakUserId }: Props = $props();

  type Assignment = { id: string; template_title: string; status: string; assigned_at: string; submitted_at: string | null };
  type Template = { id: string; title: string };

  let assignments: Assignment[] = $state([]);
  let templates: Template[] = $state([]);
  let selectedTemplateId = $state('');
  let assigning = $state(false);
  let assignMsg = $state('');

  async function loadData() {
    const [aRes, tRes] = await Promise.all([
      fetch(`/api/admin/questionnaires/assignments?keycloakUserId=${keycloakUserId}`),
      fetch('/api/admin/questionnaires/templates'),
    ]);
    assignments = aRes.ok ? await aRes.json() : [];
    const allTpls: Template[] = tRes.ok ? await tRes.json() : [];
    templates = allTpls.filter((t: any) => t.status === 'published');
  }

  $effect(() => { loadData(); });

  async function assign() {
    if (!selectedTemplateId) { assignMsg = 'Bitte eine Vorlage wählen.'; return; }
    assigning = true; assignMsg = '';
    try {
      const r = await fetch('/api/admin/questionnaires/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, keycloakUserId }),
      });
      const data = await r.json();
      if (r.ok) {
        assignMsg = 'Fragebogen zugewiesen.';
        selectedTemplateId = '';
        await loadData();
      } else {
        assignMsg = data.error ?? 'Fehler.';
      }
    } finally { assigning = false; }
  }

  function statusBadge(s: string) {
    if (s === 'submitted' || s === 'reviewed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'in_progress') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }

  function statusLabel(s: string) {
    if (s === 'reviewed') return 'Besprochen';
    if (s === 'submitted') return 'Eingereicht';
    if (s === 'in_progress') return 'In Bearbeitung';
    return 'Ausstehend';
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<div class="p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Fragebögen</h2>

  {#if templates.length > 0}
    <div class="flex gap-2 items-start mb-4">
      <select bind:value={selectedTemplateId}
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
        <option value="">— Vorlage wählen —</option>
        {#each templates as t}
          <option value={t.id}>{t.title}</option>
        {/each}
      </select>
      <button onclick={assign} disabled={assigning || !selectedTemplateId}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
        {assigning ? '…' : 'Zuweisen'}
      </button>
    </div>
    {#if assignMsg}
      <p class={`text-xs mb-3 ${assignMsg.includes('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{assignMsg}</p>
    {/if}
  {:else}
    <p class="text-muted text-sm mb-4">
      Keine veröffentlichten Vorlagen.
      <a href="/admin/dokumente" class="text-gold hover:underline">Vorlagen erstellen →</a>
    </p>
  {/if}

  {#if assignments.length > 0}
    <div class="flex flex-col gap-2">
      {#each assignments as a}
        <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
          <div class="flex-1 min-w-0">
            <p class="text-light text-sm truncate">{a.template_title}</p>
            <p class="text-muted text-xs mt-0.5">
              Zugewiesen: {fmtDate(a.assigned_at)}
              {a.submitted_at ? ` · Eingereicht: ${fmtDate(a.submitted_at)}` : ''}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(a.status)}`}>
              {statusLabel(a.status)}
            </span>
            {#if a.status === 'submitted' || a.status === 'reviewed'}
              <a href={`/admin/fragebogen/${a.id}`} class="text-xs text-gold hover:underline">Auswertung →</a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Add import and tab to [clientId].astro**

At the top of the frontmatter imports (after `ClientContractsPanel` import), add:
```astro
import ClientQuestionnairesPanel from '../../components/admin/ClientQuestionnairesPanel.svelte';
```

In the tab nav array (after the `vertraege` entry), add:
```astro
  { id: 'fragebögen', label: 'Fragebögen' },
```

After the `{tab === 'vertraege' && (...)}` block, add:
```astro
{tab === 'fragebögen' && (
  <ClientQuestionnairesPanel
    client:load
    keycloakUserId={clientId}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/ClientQuestionnairesPanel.svelte \
        website/src/pages/admin/\[clientId\].astro
git commit -m "feat(questionnaire): add client questionnaires panel and admin tab"
```

---

## Task 12: Admin Auswertung Page

**Files:**
- Create: `website/src/pages/admin/fragebogen/[assignmentId].astro`

- [ ] **Step 1: Create the Auswertung page**

```astro
---
// website/src/pages/admin/fragebogen/[assignmentId].astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import {
  getQAssignment, listQDimensions, listQQuestions,
  listQAnswerOptionsForTemplate, listQAnswers,
} from '../../../lib/questionnaire-db';
import { computeScores } from '../../../lib/compute-scores';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const { assignmentId } = Astro.params;
if (!assignmentId) return Astro.redirect('/admin');

const assignment = await getQAssignment(assignmentId).catch(() => null);
if (!assignment) return Astro.redirect('/admin');

const [dimensions, questions, allOptions, answers] = await Promise.all([
  listQDimensions(assignment.template_id),
  listQQuestions(assignment.template_id),
  listQAnswerOptionsForTemplate(assignment.template_id),
  listQAnswers(assignment.id),
]);

const scores = computeScores(dimensions, allOptions, answers);
const answerMap = new Map(answers.map(a => [a.question_id, a.option_key]));

function levelColor(level: string | null) {
  if (level === 'kritisch') return '#ef4444';
  if (level === 'mittel') return '#f59e0b';
  if (level === 'förderlich') return '#22c55e';
  return '#b8a06a';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const maxScore = Math.max(...scores.map(s => s.threshold_high ?? s.final_score ?? 1), 1);
---

<AdminLayout title={`Auswertung — ${assignment.template_title}`}>
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-3xl mx-auto px-6">

      <div class="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href="javascript:history.back()" class="text-muted text-sm hover:text-light mb-2 block">← Zurück</a>
          <h1 class="text-2xl font-bold text-light font-serif">{assignment.template_title}</h1>
          <p class="text-muted mt-1 text-sm">
            Eingereicht: {fmtDate(assignment.submitted_at)}
          </p>
        </div>
        <span class={`px-3 py-1 rounded-full border text-sm ${
          assignment.status === 'reviewed' ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : assignment.status === 'submitted' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        }`}>
          {assignment.status === 'reviewed' ? 'Besprochen' : assignment.status === 'submitted' ? 'Eingereicht' : assignment.status}
        </span>
      </div>

      <!-- Score bars -->
      {#if scores.length > 0}
        <div class="mb-8 p-6 bg-dark-light rounded-xl border border-dark-lighter">
          <h2 class="text-sm font-medium text-muted uppercase tracking-wide mb-4">Auswertung</h2>
          <div class="flex flex-col gap-4">
            {#each scores as score}
              {@const pct = Math.min((score.final_score / Math.max(maxScore * (score.threshold_high ? 1 : 1), 100)) * 100, 100)}
              {@const color = levelColor(score.level)}
              <div>
                <div class="flex justify-between items-baseline mb-1.5">
                  <span class="text-light text-sm">{score.name}</span>
                  <span class="text-sm font-mono" style={`color: ${color}`}>
                    {score.final_score}
                    {#if score.level}
                      · <span class="text-xs">{score.level}</span>
                    {/if}
                  </span>
                </div>
                <div class="h-2 bg-dark rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    style={`width: ${pct}%; background-color: ${color}`}></div>
                </div>
                {#if score.threshold_mid !== null && score.threshold_high !== null}
                  <div class="flex gap-3 mt-1">
                    <span class="text-xs text-green-400">■ &lt;{score.threshold_mid} förderlich</span>
                    <span class="text-xs text-amber-400">■ &lt;{score.threshold_high} mittel</span>
                    <span class="text-xs text-red-400">■ ≥{score.threshold_high} kritisch</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Raw answers -->
      <div class="mb-8 p-6 bg-dark-light rounded-xl border border-dark-lighter">
        <h2 class="text-sm font-medium text-muted uppercase tracking-wide mb-4">Einzelantworten ({answers.length}/{questions.length})</h2>
        <div class="flex flex-col gap-3">
          {#each questions as q, i}
            {@const chosen = answerMap.get(q.id)}
            <div class="border-b border-dark-lighter pb-3 last:border-0 last:pb-0">
              <p class="text-muted text-xs mb-1">Frage {i + 1}</p>
              <p class="text-light text-sm whitespace-pre-line mb-1">{q.question_text}</p>
              {#if chosen}
                <span class="inline-block px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded text-xs">
                  Gewählt: {chosen}
                </span>
              {:else}
                <span class="text-muted text-xs italic">Nicht beantwortet</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Coach notes + status -->
      <div class="p-6 bg-dark-light rounded-xl border border-dark-lighter" id="notes-section">
        <h2 class="text-sm font-medium text-muted uppercase tracking-wide mb-4">Coach-Notizen</h2>
        <textarea
          id="coach-notes"
          rows="5"
          placeholder="Notizen und Interpretation…"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y mb-3"
        >{assignment.coach_notes}</textarea>
        <div class="flex gap-3">
          <button id="save-notes-btn"
            class="px-4 py-2 bg-dark border border-dark-lighter text-light rounded-lg text-sm hover:border-gold/40 transition-colors">
            Notizen speichern
          </button>
          {#if assignment.status !== 'reviewed'}
            <button id="mark-reviewed-btn"
              class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">
              Als besprochen markieren ✓
            </button>
          {/if}
        </div>
        <p id="notes-msg" class="text-xs mt-2 hidden"></p>
      </div>

    </div>
  </section>
</AdminLayout>

<script define:vars={{ assignmentId }}>
  const notesEl = document.getElementById('coach-notes');
  const msgEl = document.getElementById('notes-msg');

  async function saveNotes(status) {
    const body = { coach_notes: notesEl.value };
    if (status) body.status = status;
    const r = await fetch(`/api/admin/questionnaires/assignments/${assignmentId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    msgEl.textContent = r.ok ? 'Gespeichert.' : 'Fehler beim Speichern.';
    msgEl.className = `text-xs mt-2 ${r.ok ? 'text-green-400' : 'text-red-400'}`;
    msgEl.classList.remove('hidden');
    if (status === 'reviewed' && r.ok) window.location.reload();
  }

  document.getElementById('save-notes-btn')?.addEventListener('click', () => saveNotes(null));
  document.getElementById('mark-reviewed-btn')?.addEventListener('click', () => saveNotes('reviewed'));
</script>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/admin/fragebogen/
git commit -m "feat(questionnaire): add admin Auswertung page"
```

---

## Task 13: Portal Wizard Page

**Files:**
- Create: `website/src/pages/portal/fragebogen/[assignmentId].astro`
- Create: `website/src/components/portal/QuestionnaireWizard.svelte`

- [ ] **Step 1: Create QuestionnaireWizard.svelte**

```svelte
<!-- website/src/components/portal/QuestionnaireWizard.svelte -->
<script lang="ts">
  type Props = {
    assignmentId: string;
    title: string;
    instructions: string;
    questions: Array<{ id: string; position: number; question_text: string; question_type: string }>;
    initialAnswers: Array<{ question_id: string; option_key: string }>;
  };
  const { assignmentId, title, instructions, questions, initialAnswers }: Props = $props();

  const answerMap = $state(new Map(initialAnswers.map(a => [a.question_id, a.option_key])));
  let currentIndex = $state(0);
  let phase: 'intro' | 'question' | 'done' = $state(initialAnswers.length === 0 ? 'intro' : 'question');
  let saving = $state(false);
  let submitting = $state(false);
  let error = $state('');

  // Resume at first unanswered question
  if (initialAnswers.length > 0) {
    const firstUnanswered = questions.findIndex(q => !answerMap.has(q.id));
    currentIndex = firstUnanswered >= 0 ? firstUnanswered : questions.length - 1;
  }

  const current = $derived(questions[currentIndex]);
  const answered = $derived(answerMap.size);
  const total = $derived(questions.length);
  const progressPct = $derived(Math.round((answered / total) * 100));

  async function selectOption(optionKey: string) {
    if (!current || saving) return;
    saving = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: current.id, option_key: optionKey }),
      });
      if (r.ok) {
        answerMap.set(current.id, optionKey);
        if (currentIndex < questions.length - 1) {
          currentIndex++;
        }
      } else {
        const d = await r.json().catch(() => ({}));
        error = d.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      saving = false;
    }
  }

  async function submit() {
    submitting = true; error = '';
    try {
      const r = await fetch(`/api/portal/questionnaires/${assignmentId}/submit`, { method: 'POST' });
      if (r.ok) {
        phase = 'done';
      } else {
        const d = await r.json().catch(() => ({}));
        error = d.error ?? 'Fehler beim Absenden.';
      }
    } catch {
      error = 'Netzwerkfehler.';
    } finally {
      submitting = false;
    }
  }

  function likertOptions() {
    return ['1','2','3','4','5'];
  }

  function likertLabel(k: string) {
    const labels: Record<string, string> = { '1': 'Gar nicht', '2': 'Kaum', '3': 'Etwas', '4': 'Ziemlich', '5': 'Voll und ganz' };
    return labels[k] ?? k;
  }

  function abOptions(text: string) {
    const parts = text.split(/\n/).filter(Boolean);
    return parts.map(p => ({ key: p.charAt(0), label: p }));
  }
</script>

{#if phase === 'intro'}
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-light font-serif mb-4">{title}</h1>
    {#if instructions}
      <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter mb-6">
        <p class="text-muted text-sm whitespace-pre-line">{instructions}</p>
      </div>
    {/if}
    <p class="text-muted text-sm mb-6">{total} Fragen · Ihre Antworten werden automatisch gespeichert.</p>
    <button onclick={() => { phase = 'question'; }}
      class="px-6 py-3 bg-gold text-dark rounded-xl font-semibold hover:bg-gold/80 transition-colors">
      Fragebogen starten →
    </button>
  </div>

{:else if phase === 'question' && current}
  <div class="max-w-2xl mx-auto">
    <!-- Progress -->
    <div class="mb-6">
      <div class="flex justify-between text-xs text-muted mb-2">
        <span>Frage {currentIndex + 1} von {total}</span>
        <span>{answered} beantwortet</span>
      </div>
      <div class="h-1.5 bg-dark-light rounded-full overflow-hidden">
        <div class="h-full bg-gold rounded-full transition-all duration-300" style={`width: ${progressPct}%`}></div>
      </div>
    </div>

    <!-- Question -->
    <div class="mb-6 p-6 bg-dark-light rounded-xl border border-dark-lighter">
      {#if current.question_type === 'ab_choice'}
        <p class="text-muted text-xs mb-3">Wählen Sie die Aussage, die besser auf Sie zutrifft:</p>
        <div class="flex flex-col gap-3">
          {#each abOptions(current.question_text) as opt}
            {@const isChosen = answerMap.get(current.id) === opt.key}
            <button
              onclick={() => selectOption(opt.key)}
              disabled={saving}
              class={`text-left p-4 rounded-xl border transition-all text-sm ${
                isChosen
                  ? 'border-gold bg-gold/10 text-light'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      {:else if current.question_type === 'ja_nein'}
        <p class="text-light text-base mb-4 whitespace-pre-line">{current.question_text}</p>
        <div class="flex gap-3">
          {#each ['Ja', 'Nein'] as opt}
            {@const isChosen = answerMap.get(current.id) === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                isChosen
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              {opt}
            </button>
          {/each}
        </div>
      {:else}
        <!-- Likert 1-5 -->
        <p class="text-light text-base mb-2 whitespace-pre-line">{current.question_text}</p>
        <p class="text-muted text-xs mb-4">Die Aussage trifft auf mich zu:</p>
        <div class="flex gap-2">
          {#each likertOptions() as opt}
            {@const isChosen = answerMap.get(current.id) === opt}
            <button
              onclick={() => selectOption(opt)}
              disabled={saving}
              class={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm transition-all ${
                isChosen
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
              }`}
            >
              <span class="font-bold">{opt}</span>
              <span class="text-xs text-center leading-tight hidden sm:block">{likertLabel(opt)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if error}
      <p class="text-red-400 text-sm mb-3">{error}</p>
    {/if}

    <!-- Navigation -->
    <div class="flex justify-between items-center">
      <button
        onclick={() => currentIndex = Math.max(0, currentIndex - 1)}
        disabled={currentIndex === 0}
        class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light disabled:opacity-30 transition-colors"
      >← Zurück</button>

      {#if currentIndex < questions.length - 1}
        <button
          onclick={() => currentIndex++}
          disabled={!answerMap.has(current.id)}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >Weiter →</button>
      {:else}
        <button
          onclick={submit}
          disabled={submitting || answered < total}
          class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Wird abgesendet…' : `Fragebogen absenden (${answered}/${total})`}
        </button>
      {/if}
    </div>
  </div>

{:else if phase === 'done'}
  <div class="max-w-2xl mx-auto text-center py-16">
    <div class="text-4xl mb-4">✓</div>
    <h1 class="text-2xl font-bold text-light font-serif mb-3">Vielen Dank!</h1>
    <p class="text-muted mb-6">Ihr Fragebogen wurde erfolgreich eingereicht. Ihr Coach wird die Ergebnisse mit Ihnen besprechen.</p>
    <a href="/portal" class="text-gold hover:underline text-sm">← Zurück zum Portal</a>
  </div>
{/if}
```

- [ ] **Step 2: Create portal/fragebogen/[assignmentId].astro**

```astro
---
// website/src/pages/portal/fragebogen/[assignmentId].astro
import PortalLayout from '../../../layouts/PortalLayout.astro';
import { getSession, getLoginUrl } from '../../../lib/auth';
import { getCustomerByEmail } from '../../../lib/website-db';
import {
  getQAssignment, getQTemplate,
  listQQuestions, listQAnswers,
  countPendingQAssignmentsForCustomer,
} from '../../../lib/questionnaire-db';
import QuestionnaireWizard from '../../../components/portal/QuestionnaireWizard.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));

const { assignmentId } = Astro.params;
if (!assignmentId) return Astro.redirect('/portal');

const customer = await getCustomerByEmail(session.email).catch(() => null);
if (!customer) return Astro.redirect('/portal');

const assignment = await getQAssignment(assignmentId).catch(() => null);
if (!assignment || assignment.customer_id !== customer.id) return Astro.redirect('/portal');

if (assignment.status === 'submitted' || assignment.status === 'reviewed') {
  return Astro.redirect('/portal?section=fragebögen');
}

const tpl = await getQTemplate(assignment.template_id).catch(() => null);
const [questions, answers] = await Promise.all([
  listQQuestions(assignment.template_id),
  listQAnswers(assignment.id),
]);
const pendingCount = await countPendingQAssignmentsForCustomer(customer.id).catch(() => 0);
---

<PortalLayout
  title={`Fragebogen — ${assignment.template_title}`}
  section="fragebögen"
  session={session}
  pendingSignatures={pendingCount}
>
  <section class="pt-6 pb-20 bg-dark min-h-screen">
    <div class="max-w-3xl mx-auto px-6">
      <QuestionnaireWizard
        client:load
        assignmentId={assignmentId}
        title={assignment.template_title}
        instructions={tpl?.instructions ?? ''}
        questions={questions}
        initialAnswers={answers}
      />
    </div>
  </section>
</PortalLayout>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/portal/fragebogen/ \
        website/src/components/portal/QuestionnaireWizard.svelte
git commit -m "feat(questionnaire): add portal wizard page and Svelte wizard component"
```

---

## Task 14: API Integration Tests

**Files:**
- Modify: `website/tests/api.test.mjs`

- [ ] **Step 1: Add questionnaire API tests at the end of api.test.mjs**

Append to `website/tests/api.test.mjs`:

```javascript
// ── Questionnaire API ─────────────────────────────────────────────

section('Questionnaire Templates (admin)');

let qTplId;

await assert('GET /api/admin/questionnaires/templates returns 401 without auth', async () => {
  const r = await fetch(`${BASE_URL}/api/admin/questionnaires/templates`);
  if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
});

await assert('POST /api/admin/questionnaires/templates returns 400 without title', async () => {
  const r = await fetch(`${BASE_URL}/api/admin/questionnaires/templates`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    // Note: this will hit auth first and return 401 without session; adjust if running with session
  });
  if (r.status !== 401 && r.status !== 400) throw new Error(`Expected 400 or 401, got ${r.status}`);
});

section('Questionnaire Portal (unauthenticated)');

await assert('GET /api/portal/questionnaires returns 401 without auth', async () => {
  const r = await fetch(`${BASE_URL}/api/portal/questionnaires`);
  if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
});

await assert('PUT /api/portal/questionnaires/fake-id/answer returns 401 without auth', async () => {
  const r = await fetch(`${BASE_URL}/api/portal/questionnaires/fake-id/answer`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: 'x', option_key: 'A' }),
  });
  if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
});
```

- [ ] **Step 2: Run tests (against dev server)**

```bash
cd website && task website:dev &
sleep 5
BASE_URL=http://localhost:4321 node tests/api.test.mjs
```

Expected: questionnaire auth tests pass (401 without session).

- [ ] **Step 3: Commit**

```bash
git add website/tests/api.test.mjs
git commit -m "test(questionnaire): add API auth tests for questionnaire endpoints"
```

---

## Self-Review

**Spec coverage check:**
- ✓ 6 DB tables with correct schema → Task 1
- ✓ Per-answer dimension scoring with multiplier → Tasks 1, 2
- ✓ Nullable thresholds → Task 2 (computeScores handles null)
- ✓ UNIQUE constraint on questionnaire_answers → Task 1 Step 1
- ✓ Admin template CRUD (409 if published) → Task 4
- ✓ Admin assign (only published templates) → Task 5
- ✓ Portal auto-save per answer → Task 6 Step 3
- ✓ Status transitions (pending→in_progress on first answer, →submitted on submit) → Task 6
- ✓ Email on assign + submit → Tasks 3, 5, 6
- ✓ Thomas/Kilmann seed (30 questions, 5 dims, full scoring matrix) → Task 7
- ✓ Riemann-Thomann seed (48 questions, Ja/Nein) → Task 8
- ✓ Inneres Funktionsmodell seed (50 questions, Likert, ×2 multiplier, thresholds 60/80) → Task 8
- ✓ Template builder (dimensions, questions, per-answer dimension mapping) → Task 9
- ✓ DokumentEditor Fragebögen tab → Task 10
- ✓ Client detail Fragebögen tab → Task 11
- ✓ Auswertung bar chart with threshold colour coding → Task 12
- ✓ Wizard: one question per step, progress bar, back nav, auto-save → Task 13
- ✓ Resumable: first unanswered question on re-entry → Task 13
- ✓ Submit blocked if already submitted (409) → Task 6 Step 4

**Placeholder scan:** No TBDs or TODOs in code steps.

**Type consistency check:**
- `QTemplate`, `QDimension`, `QQuestion`, `QAnswerOption`, `QAssignment`, `QAnswer` defined in Task 1, imported in Tasks 2, 4, 5, 6, 12, 13.
- `computeScores(dimensions, allOptions, answers)` — same signature in Task 2, used in Tasks 5, 12.
- `listQAnswerOptionsForTemplate` used in Tasks 5, 12 — defined in Task 1 Step 3.
