---
title: System-Test Questionnaires Implementation Plan
domains: [test]
status: completed
pr_number: null
---

# System-Test Questionnaires Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `test_step` question type to the existing questionnaire system, seed two system-test templates (Admin-Funktionen + Nutzerfunktionen), and show a live test-results panel in the Monitoring tab with bug-ticket creation for failures.

**Architecture:** Extend the existing `questionnaire_questions` / `questionnaire_answers` tables with nullable test_step columns. A new `questionnaire_test_status` table tracks the last result and last success date per question. On portal submission the status table is updated. The Monitoring tab gets a new `TestResultsPanel.svelte` component that fetches `/api/admin/test-results` and renders per-question status with the existing bug-ticket modal pattern.

**Tech Stack:** PostgreSQL 16, Astro 5, Svelte 5 (runes), TypeScript, Tailwind CSS, existing `questionnaire-db.ts` patterns.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/questionnaire-db.ts` | **Modify** | Add types, columns, tables, functions, seed |
| `website/src/pages/api/portal/questionnaires/[id]/answer.ts` | **Modify** | Accept optional `details_text` |
| `website/src/pages/api/portal/questionnaires/[id]/submit.ts` | **Modify** | Call `updateTestStatuses` on submit |
| `website/src/pages/api/admin/questionnaires/templates/[id].ts` | **Modify** | Pass test_step fields through save |
| `website/src/components/portal/QuestionnaireWizard.svelte` | **Modify** | Render `test_step` questions |
| `website/src/components/admin/QuestionnaireTemplateEditor.svelte` | **Modify** | Edit `test_step` questions |
| `website/src/pages/admin/fragebogen/[assignmentId].astro` | **Modify** | Show test results view |
| `website/src/pages/api/admin/test-results.ts` | **Create** | GET test statuses for monitoring |
| `website/src/components/admin/TestResultsPanel.svelte` | **Create** | Monitoring section UI |
| `website/src/components/admin/MonitoringDashboard.svelte` | **Modify** | Import + render TestResultsPanel |

---

## Task 1: DB Schema + Functions + Seed

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts`

- [ ] **Step 1.1 — Update `QuestionType` and add new interfaces**

Replace the existing type/interface definitions at the top of `questionnaire-db.ts` (lines 19-80):

```typescript
export type QuestionType = 'ab_choice' | 'ja_nein' | 'likert_5' | 'test_step';
export type TestStepResult = 'erfüllt' | 'teilweise' | 'nicht_erfüllt';
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed';

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
```

- [ ] **Step 1.2 — Update `initDb()` with new columns and table**

In the `initDb()` function, after the existing `CREATE TABLE IF NOT EXISTS questionnaire_answers` block (around line 146), add:

```typescript
  // New columns for test_step question type
  await pool.query(`ALTER TABLE questionnaire_questions
    ADD COLUMN IF NOT EXISTS test_expected_result TEXT,
    ADD COLUMN IF NOT EXISTS test_function_url TEXT,
    ADD COLUMN IF NOT EXISTS test_role TEXT`);
  await pool.query(`ALTER TABLE questionnaire_answers
    ADD COLUMN IF NOT EXISTS details_text TEXT`);
  await pool.query(`ALTER TABLE questionnaire_templates
    ADD COLUMN IF NOT EXISTS is_system_test BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_test_status (
      question_id UUID PRIMARY KEY REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      last_result TEXT NOT NULL,
      last_result_at TIMESTAMPTZ NOT NULL,
      last_success_at TIMESTAMPTZ,
      last_assignment_id UUID
    )
  `);
  await seedSystemTestTemplates();
```

- [ ] **Step 1.3 — Update `listQQuestions` to return new columns**

Replace the existing `listQQuestions` function:

```typescript
export async function listQQuestions(templateId: string): Promise<QQuestion[]> {
  const r = await pool.query(
    `SELECT id, template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_role, created_at
     FROM questionnaire_questions WHERE template_id = $1 ORDER BY position`,
    [templateId],
  );
  return r.rows;
}
```

- [ ] **Step 1.4 — Update `upsertQQuestion` to handle test_step fields**

Replace the existing `upsertQQuestion` function:

```typescript
export async function upsertQQuestion(params: {
  id?: string; templateId: string; position: number;
  questionText: string; questionType: QuestionType;
  testExpectedResult?: string | null;
  testFunctionUrl?: string | null;
  testRole?: 'admin' | 'user' | null;
}): Promise<QQuestion> {
  const returning = `RETURNING id, template_id, position, question_text, question_type,
                     test_expected_result, test_function_url, test_role, created_at`;
  if (params.id) {
    const r = await pool.query(
      `UPDATE questionnaire_questions
       SET position=$1, question_text=$2, question_type=$3,
           test_expected_result=$4, test_function_url=$5, test_role=$6
       WHERE id=$7 ${returning}`,
      [params.position, params.questionText, params.questionType,
       params.testExpectedResult ?? null, params.testFunctionUrl ?? null,
       params.testRole ?? null, params.id],
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO questionnaire_questions
       (template_id, position, question_text, question_type, test_expected_result, test_function_url, test_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ${returning}`,
    [params.templateId, params.position, params.questionText, params.questionType,
     params.testExpectedResult ?? null, params.testFunctionUrl ?? null, params.testRole ?? null],
  );
  return r.rows[0];
}
```

- [ ] **Step 1.5 — Update `upsertQAnswer` to handle `details_text`**

Replace the existing `upsertQAnswer` function:

```typescript
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
```

- [ ] **Step 1.6 — Update `listQAnswers` to return `details_text`**

Replace the existing `listQAnswers` function:

```typescript
export async function listQAnswers(assignmentId: string): Promise<QAnswer[]> {
  const r = await pool.query(
    `SELECT id, assignment_id, question_id, option_key, details_text, saved_at
     FROM questionnaire_answers WHERE assignment_id = $1`,
    [assignmentId],
  );
  return r.rows;
}
```

- [ ] **Step 1.7 — Add `updateTestStatuses` function**

Add after `listQAnswers`:

```typescript
export async function updateTestStatuses(assignmentId: string): Promise<void> {
  const r = await pool.query(
    `SELECT qa.question_id, qa.option_key, qa.saved_at
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
  }
}
```

- [ ] **Step 1.8 — Add `listTestStatusesForMonitoring` function**

Add after `updateTestStatuses`:

```typescript
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
```

- [ ] **Step 1.9 — Add `seedSystemTestTemplates()` function**

Add this before `initDb()`:

```typescript
async function seedSystemTestTemplates(): Promise<void> {
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM questionnaire_templates WHERE is_system_test = true`,
  );
  if ((existing.rows[0]?.cnt ?? 0) > 0) return;

  // ── Template 1: Admin-Funktionen ─────────────────────────────────────────
  const tpl1 = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
     VALUES ($1,$2,$3,'published',true)
     RETURNING id`,
    [
      'System-Testprotokoll: Admin-Funktionen',
      'Vollständiger Testdurchlauf aller Admin-Interaktionen (zwei Browser-Profile: Admin + Testnutzer).',
      'Führe jeden Schritt mit dem Admin-Browser-Profil durch, sofern nicht anders angegeben. Wähle das Ergebnis und trage bei Bedarf Details ein.',
    ],
  );
  const t1 = tpl1.rows[0].id as string;

  const adminSteps: Array<[string, string, string, 'admin' | 'user']> = [
    ['SSO-Login als Administrator durchführen',
     'Weiterleitung zum Admin-Dashboard nach Keycloak-Authentifizierung; Sitzung wird korrekt gesetzt.',
     '/admin', 'admin'],
    ['Dashboard aufrufen und Übersichtskennzahlen prüfen',
     'KPIs (Clients, offene Bugs, Meetings u. a.) werden korrekt geladen und angezeigt.',
     '/admin', 'admin'],
    ['Neuen Client anlegen',
     'Client erscheint in der Clientliste; Pflichtfelder werden serverseitig validiert.',
     '/admin/clients', 'admin'],
    ['Meeting anlegen und speichern',
     'Meeting erscheint in der Meetingliste mit korrekten Datums- und Teilnehmerinfos.',
     '/admin/meetings', 'admin'],
    ['Termin anlegen',
     'Termin wird gespeichert und ist in der Terminliste sichtbar.',
     '/admin/termine', 'admin'],
    ['Projekt anlegen und einem Client zuordnen',
     'Projekt erscheint in der Projektliste und ist dem Client korrekt zugeordnet.',
     '/admin/projekte', 'admin'],
    ['Rechnung erstellen und PDF-Vorschau aufrufen',
     'Rechnung wird angelegt; PDF-Vorschau lädt ohne Fehler.',
     '/admin/rechnungen', 'admin'],
    ['Dokument im Dokumenteneditor anlegen und Inhalt speichern',
     'Dokument wird gespeichert und kann wieder geöffnet werden.',
     '/admin/dokumente', 'admin'],
    ['Admin-Kalender öffnen und Terminanzeige prüfen',
     'Kalender lädt; vorhandene Termine werden korrekt dargestellt.',
     '/admin/kalender', 'admin'],
    ['Inbox öffnen und mindestens ein Item als erledigt markieren',
     'Item wechselt den Status; Inbox-Counter aktualisiert sich korrekt.',
     '/admin/inbox', 'admin'],
    ['Website-Startseite im Admin bearbeiten und Änderung speichern',
     'Änderungen werden persistiert; öffentliche Seite zeigt den aktualisierten Inhalt.',
     '/admin/website/startseite', 'admin'],
    ['Neues Fragebogen-Template anlegen (Titel, mind. 1 Frage)',
     'Template wird gespeichert und erscheint in der Template-Liste.',
     '/admin/fragebogen', 'admin'],
    ['Veröffentlichtes Fragebogen-Template einem Client zuweisen',
     'Assignment wird erstellt; Client sieht den Fragebogen im Portal (ggf. E-Mail-Benachrichtigung).',
     '/admin/clients', 'admin'],
    ['Aus dem Monitoring-Dashboard ein Bug-Ticket erstellen',
     'Ticket mit Format BR-YYYYMMDD-xxxx wird angelegt und ist unter Bugs sichtbar.',
     '/admin/monitoring', 'admin'],
    ['Offenes Bug-Ticket als erledigt markieren (mit Auflösungsnotiz)',
     'Ticket-Status wechselt auf "resolved"; Auflösungsnotiz wird gespeichert.',
     '/admin/bugs', 'admin'],
    ['Monitoring — Pod-Statusliste prüfen',
     'Alle Pods zeigen "Running" oder "Healthy"; keine dauerhaften CrashLoops sichtbar.',
     '/admin/monitoring', 'admin'],
    ['Monitoring — ein Deployment per Rolling Restart neu starten',
     'Restart-Trigger wird bestätigt; Pod kommt wieder hoch (Status Ready).',
     '/admin/monitoring', 'admin'],
    ['Staleness-Report im Monitoring aufrufen und Befunde lesen',
     'Bericht wird geladen; Empfehlungen oder OK-Status je System sind sichtbar.',
     '/admin/monitoring', 'admin'],
    ['Admin-Einstellungen öffnen und Konfiguration speichern',
     'Einstellungen werden persistiert und nach Reload korrekt geladen.',
     '/admin/einstellungen', 'admin'],
    ['Auf eine Nutzer-Chat-Nachricht aus der Inbox antworten',
     'Antwort wird gesendet; Nutzer sieht die Antwort im Chat-Widget (Schritt 13/15 in Protokoll 2).',
     '/admin/inbox', 'admin'],
  ];

  for (let i = 0; i < adminSteps.length; i++) {
    const [text, expected, url, role] = adminSteps[i];
    await pool.query(
      `INSERT INTO questionnaire_questions
         (template_id, position, question_text, question_type, test_expected_result, test_function_url, test_role)
       VALUES ($1,$2,$3,'test_step',$4,$5,$6)`,
      [t1, i + 1, text, expected, url, role],
    );
  }

  // ── Template 2: Nutzerfunktionen + Externe Dienste ────────────────────────
  const tpl2 = await pool.query(
    `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
     VALUES ($1,$2,$3,'published',true)
     RETURNING id`,
    [
      'System-Testprotokoll: Nutzerfunktionen + Externe Dienste',
      'Vollständiger Testdurchlauf aller nutzerorientierten Funktionen. Testnutzer-Browser-Profil + Admin-Profil für markierte Schritte.',
      'Führe Schritte mit dem Testnutzer-Browser durch, sofern nicht "Admin" angegeben. Für Admin-Schritte: zum Admin-Tab wechseln, Schritt ausführen, zurückwechseln.',
    ],
  );
  const t2 = tpl2.rows[0].id as string;

  const userSteps: Array<[string, string, string, 'admin' | 'user']> = [
    ['Als Testnutzer per Keycloak SSO im Portal anmelden',
     'Login-Flow läuft durch; Weiterleitung zum Portal-Dashboard ohne Fehlermeldung.',
     '/portal', 'user'],
    ['Portal-Dashboard laden und Inhalte prüfen',
     'Dashboard zeigt zugewiesene Fragebögen, Dokumente und Projekte des Nutzers.',
     '/portal', 'user'],
    ['Zugewiesenen Fragebogen im Portal vollständig ausfüllen und absenden',
     'Fragebogen-Status wechselt auf "eingereicht"; Bestätigungsseite erscheint.',
     '/portal', 'user'],
    ['Als Admin das Ergebnis des eingereichten Fragebogens prüfen',
     'Auswertung mit Einzelantworten und Scoring-Dimensionen korrekt dargestellt.',
     '/admin/clients', 'admin'],
    ['Als Testnutzer Nextcloud per Keycloak SSO öffnen',
     'Automatischer Login ohne zusätzliche Credentials; Dateiansicht lädt vollständig.',
     'https://files.localhost', 'user'],
    ['Testdatei in Nextcloud hochladen',
     'Datei erscheint in der Dateiliste; Fortschrittsbalken läuft durch.',
     'https://files.localhost', 'user'],
    ['Nextcloud-Kalender öffnen und Ansicht laden',
     'Kalender-App öffnet; Monats- oder Wochenansicht wird ohne Fehler angezeigt.',
     'https://files.localhost/apps/calendar', 'user'],
    ['Nextcloud-Kontakte öffnen und Kontaktliste prüfen',
     'Kontakte-App öffnet; Kontaktliste wird geladen.',
     'https://files.localhost/apps/contacts', 'user'],
    ['In Nextcloud Talk einen Raum öffnen und Kamera/Mikrofon freigeben',
     'Signaling-Verbindung wird hergestellt; lokales Video erscheint im Raum.',
     'https://files.localhost/apps/talk', 'user'],
    ['Eine Office-Datei via Collabora Online in Nextcloud öffnen und bearbeiten',
     'Collabora-Editor öffnet innerhalb der Dateiansicht; Änderungen werden gespeichert.',
     'https://files.localhost', 'user'],
    ['Als Testnutzer Vaultwarden per Keycloak SSO öffnen',
     'Automatischer Login; Passwort-Tresor wird vollständig geladen.',
     'https://vault.localhost', 'user'],
    ['Neuen Passwort-Eintrag in Vaultwarden anlegen und speichern',
     'Eintrag erscheint in der Tresorübersicht; Passwort ist abrufbar.',
     'https://vault.localhost', 'user'],
    ['Im Website-Chat-Widget als Testnutzer eine Nachricht senden',
     'Nachricht erscheint im Chat-Verlauf; Admin sieht sie in der Inbox (Admin-Tab prüfen).',
     'https://web.localhost', 'user'],
    ['Als Admin auf die Nutzer-Chat-Nachricht antworten (Schritt 13)',
     'Antwort wird gesendet; Nutzer-Chat-Widget zeigt die Admin-Antwort.',
     '/admin/inbox', 'admin'],
    ['Im Testnutzer-Browser prüfen, ob die Admin-Antwort erscheint',
     'Admin-Antwort ist im Chat-Widget des Nutzers sichtbar ohne Seitenreload.',
     'https://web.localhost', 'user'],
    ['Keycloak Account-Verwaltung als Testnutzer öffnen',
     'Profil-Daten sind einsehbar; Passwort-Änderung und Sitzungsverwaltung zugänglich.',
     'https://auth.localhost/realms/workspace/account', 'user'],
    ['Zur Unterschrift zugesendetes Dokument in DocuSeal unterzeichnen',
     'Signatur wird gespeichert; Dokument-Status wechselt auf "Abgeschlossen".',
     'https://sign.localhost', 'user'],
    ['Als Admin die Signatur des Dokuments in DocuSeal prüfen',
     'Signaturstatus wird angezeigt; Dokument ist als "Completed" markiert.',
     'https://sign.localhost', 'admin'],
    ['Öffentliche Website-Startseite im Browser aufrufen',
     'Startseite lädt vollständig; alle Sektionen und Bilder werden angezeigt.',
     'https://web.localhost', 'user'],
    ['Kontaktformular auf der Website ausfüllen und absenden',
     'Formular wird validiert; Bestätigung erscheint; Admin erhält Benachrichtigung.',
     'https://web.localhost', 'user'],
  ];

  for (let i = 0; i < userSteps.length; i++) {
    const [text, expected, url, role] = userSteps[i];
    await pool.query(
      `INSERT INTO questionnaire_questions
         (template_id, position, question_text, question_type, test_expected_result, test_function_url, test_role)
       VALUES ($1,$2,$3,'test_step',$4,$5,$6)`,
      [t2, i + 1, text, expected, url, role],
    );
  }
}
```

- [ ] **Step 1.10 — Verify: restart the website pod and check tables**

```bash
task workspace:restart -- website
task workspace:psql -- website
```

In psql:
```sql
SELECT title, is_system_test FROM questionnaire_templates WHERE is_system_test = true;
-- Expected: 2 rows
SELECT COUNT(*) FROM questionnaire_questions WHERE question_type = 'test_step';
-- Expected: 40
\d questionnaire_test_status
-- Expected: table exists with columns question_id, last_result, last_result_at, last_success_at, last_assignment_id
```

- [ ] **Step 1.11 — Commit**

```bash
git add website/src/lib/questionnaire-db.ts
git commit -m "feat(questionnaire): add test_step type, status tracking, seed system-test templates"
```

---

## Task 2: Portal Answer & Submit APIs

**Files:**
- Modify: `website/src/pages/api/portal/questionnaires/[id]/answer.ts`
- Modify: `website/src/pages/api/portal/questionnaires/[id]/submit.ts`

- [ ] **Step 2.1 — Update answer API to pass `details_text`**

Replace the full content of `answer.ts`:

```typescript
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

  const body = await request.json() as { question_id?: string; option_key?: string; details_text?: string };
  if (!body.question_id || !body.option_key) {
    return new Response(JSON.stringify({ error: 'question_id und option_key erforderlich.' }), { status: 400 });
  }

  await upsertQAnswer({
    assignmentId: assignment.id,
    questionId: body.question_id,
    optionKey: body.option_key,
    detailsText: body.details_text ?? null,
  });

  if (assignment.status === 'pending') {
    await updateQAssignment(assignment.id, { status: 'in_progress' });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2.2 — Update submit API to trigger test status update**

Replace the full content of `submit.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import {
  getQAssignment, updateQAssignment, updateTestStatuses,
} from '../../../../../lib/questionnaire-db';
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
  // Update test status tracking (no-op for non-test_step templates)
  await updateTestStatuses(assignment.id).catch(err =>
    console.error('[submit] updateTestStatuses failed:', err),
  );

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

- [ ] **Step 2.3 — Commit**

```bash
git add website/src/pages/api/portal/questionnaires/[id]/answer.ts \
        website/src/pages/api/portal/questionnaires/[id]/submit.ts
git commit -m "feat(questionnaire): pass details_text through answer API; update test statuses on submit"
```

---

## Task 3: Admin Templates API — test_step field passthrough

**Files:**
- Modify: `website/src/pages/api/admin/questionnaires/templates/[id].ts`

- [ ] **Step 3.1 — Update PUT handler body type and `upsertQQuestion` call**

Replace the existing `PUT` handler (lines 24-60):

```typescript
export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const tpl = await getQTemplate(params.id!);
  if (!tpl) return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  if (tpl.status === 'published' && !tpl.is_system_test) {
    return new Response(JSON.stringify({ error: 'Veröffentlichte Vorlagen können nicht bearbeitet werden.' }), { status: 409 });
  }
  if (tpl.is_system_test) {
    return new Response(JSON.stringify({ error: 'System-Testvorlagen können nicht bearbeitet werden.' }), { status: 409 });
  }
  const body = await request.json() as {
    title?: string; description?: string; instructions?: string; status?: string;
    dimensions?: Array<{ id?: string; name: string; position: number; threshold_mid?: number | null; threshold_high?: number | null; score_multiplier?: number }>;
    questions?: Array<{
      id?: string; position: number; question_text: string; question_type: string;
      answer_options: Array<{ option_key: string; label: string; dimension_id: string | null; weight: number }>;
      test_expected_result?: string | null;
      test_function_url?: string | null;
      test_role?: 'admin' | 'user' | null;
    }>;
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
      const saved = await upsertQQuestion({
        id: q.id, templateId: params.id!, position: q.position,
        questionText: q.question_text, questionType: q.question_type as import('../../../../../lib/questionnaire-db').QuestionType,
        testExpectedResult: q.test_expected_result,
        testFunctionUrl: q.test_function_url,
        testRole: q.test_role,
      });
      if (q.question_type !== 'test_step' && q.answer_options) {
        await replaceQAnswerOptions(saved.id, q.answer_options.map(o => ({
          optionKey: o.option_key, label: o.label, dimensionId: o.dimension_id, weight: o.weight,
        })));
      }
    }
  }
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3.2 — Commit**

```bash
git add website/src/pages/api/admin/questionnaires/templates/[id].ts
git commit -m "feat(questionnaire): admin template API handles test_step fields; blocks system-test edits"
```

---

## Task 4: Template Editor — test_step UI

**Files:**
- Modify: `website/src/components/admin/QuestionnaireTemplateEditor.svelte`

- [ ] **Step 4.1 — Extend the `Question` type in the editor**

At the top of `<script>`, replace:
```typescript
type Question = { id?: string; position: number; question_text: string; question_type: 'ab_choice' | 'ja_nein' | 'likert_5'; answer_options: AnswerOpt[] };
```
with:
```typescript
type Question = {
  id?: string; position: number; question_text: string;
  question_type: 'ab_choice' | 'ja_nein' | 'likert_5' | 'test_step';
  answer_options: AnswerOpt[];
  test_expected_result?: string | null;
  test_function_url?: string | null;
  test_role?: 'admin' | 'user' | null;
};
```

- [ ] **Step 4.2 — Update `defaultOptions` for `test_step`**

In `defaultOptions`, add the `test_step` case:
```typescript
function defaultOptions(type: Question['question_type']): AnswerOpt[] {
  if (type === 'ab_choice') return [
    { option_key: 'A', label: 'A', dimension_id: null, weight: 1 },
    { option_key: 'B', label: 'B', dimension_id: null, weight: 1 },
  ];
  if (type === 'ja_nein') return [
    { option_key: 'Ja', label: 'Ja', dimension_id: null, weight: 1 },
    { option_key: 'Nein', label: 'Nein', dimension_id: null, weight: 1 },
  ];
  if (type === 'test_step') return [];
  return ['1','2','3','4','5'].map(k => ({ option_key: k, label: k, dimension_id: null, weight: 1 }));
}
```

- [ ] **Step 4.3 — Update `addQuestion` default type to preserve to first non-test_step**

The `addQuestion` function doesn't need changing. The type dropdown in the template will expose test_step.

- [ ] **Step 4.4 — Update the question type `<select>` to include test_step**

In the template, find the `<select>` inside the questions loop:
```svelte
<select
  value={q.question_type}
  onchange={(e) => changeQuestionType(i, (e.target as HTMLSelectElement).value as 'ab_choice'|'ja_nein'|'likert_5')}
  class="bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none mb-2"
>
  <option value="ab_choice">A/B-Wahl</option>
  <option value="ja_nein">Ja/Nein</option>
  <option value="likert_5">Likert 1–5</option>
</select>
```

Replace with:
```svelte
<select
  value={q.question_type}
  onchange={(e) => changeQuestionType(i, (e.target as HTMLSelectElement).value as Question['question_type'])}
  class="bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none mb-2"
>
  <option value="ab_choice">A/B-Wahl</option>
  <option value="ja_nein">Ja/Nein</option>
  <option value="likert_5">Likert 1–5</option>
  <option value="test_step">Test-Schritt</option>
</select>
```

- [ ] **Step 4.5 — Add test_step fields in the question editor block**

After the `<select>` for question type, and before the answer-options block, add a conditional test_step editor. Replace the answer-options block:

```svelte
<!-- Answer option → dimension mapping (not for test_step) -->
{#if q.question_type === 'test_step'}
  <div class="flex flex-col gap-2 mt-2">
    <div>
      <label class="block text-xs text-muted mb-1">Erwartetes Ergebnis *</label>
      <textarea bind:value={q.test_expected_result} rows="2" placeholder="Was soll nach dem Test zu sehen sein?"
        class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none resize-y"></textarea>
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Funktions-URL</label>
      <input bind:value={q.test_function_url} placeholder="z. B. /admin/monitoring"
        class="w-full bg-dark border border-dark-lighter rounded px-2 py-1.5 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Rolle</label>
      <select bind:value={q.test_role}
        class="w-full bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-sm focus:border-gold outline-none">
        <option value="admin">Admin</option>
        <option value="user">Nutzer</option>
      </select>
    </div>
  </div>
{:else}
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
{/if}
```

- [ ] **Step 4.6 — Include test_step fields in the `save()` body**

In the `save()` function, find the `body` construction for `PUT`. The questions array currently maps only `id, position, question_text, question_type, answer_options`. Add the test_step fields:

```javascript
questions: editing.questions.map(q => ({
  id: q.id,
  position: q.position,
  question_text: q.question_text,
  question_type: q.question_type,
  answer_options: q.answer_options,
  test_expected_result: q.test_expected_result ?? null,
  test_function_url: q.test_function_url ?? null,
  test_role: q.test_role ?? null,
})),
```

- [ ] **Step 4.7 — Commit**

```bash
git add website/src/components/admin/QuestionnaireTemplateEditor.svelte
git commit -m "feat(questionnaire-editor): add test_step question type editor fields"
```

---

## Task 5: Portal Wizard — test_step rendering

**Files:**
- Modify: `website/src/components/portal/QuestionnaireWizard.svelte`

- [ ] **Step 5.1 — Extend Props type and add test_step state**

In `<script>`, replace the Props type and add test state:

```typescript
type QuestionData = {
  id: string;
  position: number;
  question_text: string;
  question_type: string;
  test_expected_result?: string | null;
  test_function_url?: string | null;
  test_role?: string | null;
};

type Props = {
  assignmentId: string;
  title: string;
  instructions: string;
  questions: QuestionData[];
  initialAnswers: Array<{ question_id: string; option_key: string; details_text?: string | null }>;
};
const { assignmentId, title, instructions, questions, initialAnswers }: Props = $props();

let answers = $state<Record<string, string>>(
  Object.fromEntries(initialAnswers.map(a => [a.question_id, a.option_key]))
);
let testDetails = $state<Record<string, string>>(
  Object.fromEntries(
    initialAnswers.filter(a => a.details_text).map(a => [a.question_id, a.details_text!])
  )
);
let pendingTestOption = $state<string>('');
```

- [ ] **Step 5.2 — Add `saveTestStep` function**

Add after `selectOption`:

```typescript
async function saveTestStep(questionId: string) {
  if (!pendingTestOption && !(questionId in answers)) return;
  const optionKey = pendingTestOption || answers[questionId];
  if (!optionKey) return;
  saving = true; error = '';
  try {
    const r = await fetch(`/api/portal/questionnaires/${assignmentId}/answer`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: questionId,
        option_key: optionKey,
        details_text: testDetails[questionId] ?? null,
      }),
    });
    if (r.ok) {
      answers[questionId] = optionKey;
      pendingTestOption = '';
      if (currentIndex < questions.length - 1) currentIndex++;
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
```

- [ ] **Step 5.3 — Add `$effect` to reset `pendingTestOption` when question changes**

After the `currentIndex` resume logic, add:

```typescript
$effect(() => {
  // Reset pending test option when navigating to a different question
  void currentIndex;
  pendingTestOption = answers[questions[currentIndex]?.id] ?? '';
});
```

- [ ] **Step 5.4 — Render `test_step` questions in the question phase**

In the `{:else if phase === 'question' && current}` block, after the existing `{:else}` (Likert) block and before the closing `</div>` of the question card, add the test_step branch. Replace the entire question type rendering block:

```svelte
<!-- Question card content -->
<div class="mb-6 p-6 bg-dark-light rounded-xl border border-dark-lighter">
  {#if current.question_type === 'test_step'}
    <!-- Role badge -->
    <div class="flex items-center gap-2 mb-4">
      <span class={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
        current.test_role === 'admin'
          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      }`}>
        {current.test_role === 'admin' ? '🔧 Admin-Schritt' : '👤 Nutzer-Schritt'}
      </span>
    </div>
    <!-- What to test -->
    <p class="text-xs text-muted uppercase tracking-wide mb-1">Was zu testen:</p>
    <p class="text-light text-base mb-4 font-medium">{current.question_text}</p>
    <!-- Expected result -->
    {#if current.test_expected_result}
      <div class="mb-4 p-3 rounded-lg bg-dark border border-dark-lighter">
        <p class="text-xs text-muted uppercase tracking-wide mb-1">Erwartetes Ergebnis:</p>
        <p class="text-muted text-sm">{current.test_expected_result}</p>
      </div>
    {/if}
    <!-- Function link -->
    {#if current.test_function_url}
      <a href={current.test_function_url} target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 text-gold text-xs hover:underline mb-5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
          <path d="M6.5 2.5h-4v11h11v-4M9.5 2.5H13.5V6.5M13.5 2.5L7 9"/>
        </svg>
        Funktion öffnen
      </a>
    {/if}
    <!-- Result options -->
    <p class="text-xs text-muted uppercase tracking-wide mb-2">Testergebnis:</p>
    <div class="flex flex-col gap-2 mb-4">
      {#each [
        { key: 'erfüllt', label: 'Test erfüllt', cls: 'border-green-500 bg-green-900/20 text-green-400' },
        { key: 'teilweise', label: 'Test zum Teil erfüllt', cls: 'border-amber-500 bg-amber-900/20 text-amber-400' },
        { key: 'nicht_erfüllt', label: 'Test nicht erfüllt', cls: 'border-red-500 bg-red-900/20 text-red-400' },
      ] as opt}
        {@const isChosen = (pendingTestOption || answers[current.id]) === opt.key}
        <button
          onclick={() => { pendingTestOption = opt.key; }}
          disabled={saving}
          class={`text-left px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer flex items-center gap-3 ${
            isChosen ? opt.cls : 'border-dark-lighter bg-dark text-muted hover:border-gold/40 hover:text-light'
          } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span class={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isChosen ? 'border-current bg-current' : 'border-muted/40'}`}></span>
          {opt.label}
        </button>
      {/each}
    </div>
    <!-- Details textarea -->
    <div>
      <label class="block text-xs text-muted mb-1">Details / Beobachtungen (optional)</label>
      <textarea
        value={testDetails[current.id] ?? ''}
        oninput={(e) => { testDetails[current.id] = (e.target as HTMLTextAreaElement).value; }}
        rows="3"
        placeholder="Fehlermeldungen, Screenshots-Hinweise oder Beobachtungen…"
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"
      ></textarea>
    </div>
  {:else if current.question_type === 'ab_choice'}
    <p class="text-muted text-xs mb-3">Wählen Sie die Aussage, die besser auf Sie zutrifft:</p>
    <div class="flex flex-col gap-3">
      {#each abOptions(current.question_text) as opt}
        {@const isChosen = answers[current.id] === opt.key}
        <button
          onclick={() => selectOption(opt.key)}
          disabled={saving}
          class={`text-left p-4 rounded-xl border-2 transition-all text-sm cursor-pointer flex items-start gap-3 ${
            isChosen
              ? 'border-gold bg-gold/20 text-light shadow-[0_0_0_1px_theme(colors.gold/0.3)]'
              : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
          } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span class={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold ${
            isChosen ? 'border-gold bg-gold text-dark' : 'border-muted/40'
          }`}>
            {#if isChosen}✓{/if}
          </span>
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  {:else if current.question_type === 'ja_nein'}
    <p class="text-light text-base mb-4 whitespace-pre-line">{current.question_text}</p>
    <div class="flex gap-3">
      {#each ['Ja', 'Nein'] as opt}
        {@const isChosen = answers[current.id] === opt}
        <button
          onclick={() => selectOption(opt)}
          disabled={saving}
          class={`flex-1 py-4 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
            isChosen
              ? 'border-gold bg-gold text-dark shadow-md'
              : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
          } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {#if isChosen}<span class="mr-1">✓</span>{/if}{opt}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Likert 1-5 -->
    <p class="text-light text-base mb-2 whitespace-pre-line">{current.question_text}</p>
    <p class="text-muted text-xs mb-4">Die Aussage trifft auf mich zu:</p>
    <div class="flex gap-2">
      {#each likertOptions() as opt}
        {@const isChosen = answers[current.id] === opt}
        <button
          onclick={() => selectOption(opt)}
          disabled={saving}
          class={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm transition-all cursor-pointer ${
            isChosen
              ? 'border-gold bg-gold text-dark shadow-md'
              : 'border-dark-lighter bg-dark text-muted hover:border-gold/50 hover:text-light hover:bg-dark-lighter'
          } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span class="font-bold text-base">{opt}</span>
          <span class="text-xs text-center leading-tight hidden sm:block">{likertLabel(opt)}</span>
        </button>
      {/each}
    </div>
    <div class="flex justify-between text-xs text-muted mt-2 px-1">
      <span>Gar nicht</span>
      <span>Voll und ganz</span>
    </div>
  {/if}
</div>
```

- [ ] **Step 5.5 — Update the navigation block for test_step**

Replace the navigation `<div class="flex justify-between...">` block to handle test_step advance:

```svelte
<!-- Navigation -->
<div class="flex justify-between items-center">
  <button
    onclick={() => { currentIndex = Math.max(0, currentIndex - 1); pendingTestOption = ''; }}
    disabled={currentIndex === 0}
    class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light disabled:opacity-30 transition-colors cursor-pointer"
  >← Zurück</button>

  {#if current.question_type === 'test_step'}
    {#if currentIndex < questions.length - 1}
      <button
        onclick={() => saveTestStep(current.id)}
        disabled={saving || (!pendingTestOption && !(current.id in answers))}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
      >{saving ? 'Speichere…' : 'Speichern & Weiter →'}</button>
    {:else}
      <button
        onclick={async () => { await saveTestStep(current.id); }}
        disabled={saving || (!pendingTestOption && !(current.id in answers))}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
      >{saving ? 'Speichere…' : 'Letzten Schritt speichern ✓'}</button>
    {/if}
  {:else if currentIndex < questions.length - 1}
    <button
      onclick={() => currentIndex++}
      disabled={!(current.id in answers)}
      class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
    >Weiter →</button>
  {:else}
    <div class="flex flex-col items-end gap-1">
      {#if !allAnswered}
        <p class="text-muted text-xs">Noch {total - answered} Frage(n) offen</p>
      {/if}
      <button
        onclick={submit}
        disabled={submitting || !allAnswered}
        class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
      >
        {submitting ? 'Wird abgesendet…' : allAnswered ? 'Fragebogen absenden ✓' : `Absenden (${answered}/${total})`}
      </button>
    </div>
  {/if}
</div>
```

**Note:** For a mixed template (test_step + other types), the final submit button logic already covers the last step (submit) if the last question is not test_step. For a pure test_step template, after saving the last step the user should then see the submit button. Adjust: after `saveTestStep` advances to the next question, if there is no next question the UI stays on the last step. The user saved it, now `answers[current.id]` is set. The existing `allAnswered` derived value covers whether all are answered, and `submit` is shown when `currentIndex === questions.length - 1` and it's not a test_step question OR after all test_steps are saved. To handle pure test_step templates, add a "Absenden" button below for the submit action when all questions are answered:

After the navigation block, add:
```svelte
{#if allAnswered && questions.every(q => q.question_type === 'test_step') && phase === 'question'}
  <div class="mt-4 flex justify-end">
    <button
      onclick={submit}
      disabled={submitting}
      class="px-6 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-40 transition-colors cursor-pointer"
    >
      {submitting ? 'Wird abgesendet…' : 'Testprotokoll absenden ✓'}
    </button>
  </div>
{/if}
```

- [ ] **Step 5.6 — Commit**

```bash
git add website/src/components/portal/QuestionnaireWizard.svelte
git commit -m "feat(wizard): render test_step questions with role badge, expected result, 3-option result, details"
```

---

## Task 6: Test-Results API Endpoint

**Files:**
- Create: `website/src/pages/api/admin/test-results.ts`

- [ ] **Step 6.1 — Create the endpoint**

```typescript
// website/src/pages/api/admin/test-results.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listTestStatusesForMonitoring } from '../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const results = await listTestStatusesForMonitoring();
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 6.2 — Commit**

```bash
git add website/src/pages/api/admin/test-results.ts
git commit -m "feat(api): GET /api/admin/test-results for monitoring panel"
```

---

## Task 7: TestResultsPanel Component

**Files:**
- Create: `website/src/components/admin/TestResultsPanel.svelte`

- [ ] **Step 7.1 — Create the component**

```svelte
<!-- website/src/components/admin/TestResultsPanel.svelte -->
<script lang="ts">
  type TestStep = {
    question_id: string;
    question_text: string;
    test_expected_result: string | null;
    test_function_url: string | null;
    test_role: 'admin' | 'user' | null;
    position: number;
    last_result: 'erfüllt' | 'teilweise' | 'nicht_erfüllt' | null;
    last_result_at: string | null;
    last_success_at: string | null;
  };

  type TemplateResult = {
    template_id: string;
    template_title: string;
    questions: TestStep[];
  };

  let results: TemplateResult[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  // Bug ticket modal state
  let modalStep: TestStep | null = $state(null);
  let modalDescription = $state('');
  let modalCategory = $state('fehler');
  let modalLoading = $state(false);
  let modalError: string | null = $state(null);
  let modalSuccessId: string | null = $state(null);
  let modalCloseTimer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    try {
      loading = true; error = null;
      const r = await fetch('/api/admin/test-results');
      if (r.ok) results = await r.json();
      else error = `Fehler ${r.status}`;
    } catch {
      error = 'Netzwerkfehler';
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });

  function fmtDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function resultLabel(r: TestStep['last_result']) {
    if (r === 'erfüllt') return 'Erfüllt';
    if (r === 'teilweise') return 'Teilweise';
    if (r === 'nicht_erfüllt') return 'Nicht erfüllt';
    return 'Noch nicht getestet';
  }

  function resultClasses(r: TestStep['last_result']) {
    if (r === 'erfüllt') return 'bg-green-900/30 text-green-400 border-green-500/30';
    if (r === 'teilweise') return 'bg-amber-900/30 text-amber-400 border-amber-500/30';
    if (r === 'nicht_erfüllt') return 'bg-red-900/30 text-red-400 border-red-500/30';
    return 'bg-dark text-muted border-dark-lighter';
  }

  function openBugModal(step: TestStep) {
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    modalStep = step;
    modalDescription = `Test-Schritt ${step.position}: ${step.question_text}\n\nErgebnis: ${resultLabel(step.last_result)}\n\nErwartet: ${step.test_expected_result ?? '—'}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  function closeModal() {
    if (modalCloseTimer) { clearTimeout(modalCloseTimer); modalCloseTimer = null; }
    modalStep = null;
    modalSuccessId = null;
    modalError = null;
  }

  async function submitTicket() {
    if (!modalStep) return;
    modalLoading = true; modalError = null;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const data = await res.json();
      if (!res.ok) { modalError = data.error ?? 'Unbekannter Fehler'; return; }
      modalSuccessId = data.ticketId;
      modalCloseTimer = setTimeout(closeModal, 3000);
    } catch {
      modalError = 'Netzwerkfehler';
    } finally {
      modalLoading = false;
    }
  }

  let expandedTemplates = $state<Set<string>>(new Set());
  function toggleTemplate(id: string) {
    if (expandedTemplates.has(id)) {
      expandedTemplates.delete(id);
    } else {
      expandedTemplates.add(id);
    }
    expandedTemplates = new Set(expandedTemplates);
  }

  $effect(() => {
    // Auto-expand all on first load
    if (results.length > 0 && expandedTemplates.size === 0) {
      expandedTemplates = new Set(results.map(r => r.template_id));
    }
  });
</script>

<div class="mb-8">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-sm font-medium text-muted uppercase tracking-wide">System-Testprotokolle</h2>
    <button onclick={load} class="text-xs text-muted hover:text-gold transition-colors">↻ Aktualisieren</button>
  </div>

  {#if loading}
    <p class="text-muted text-sm animate-pulse">Lade Testergebnisse…</p>
  {:else if error}
    <p class="text-red-400 text-sm">{error}</p>
  {:else if results.length === 0}
    <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter text-muted text-sm">
      Keine System-Testvorlagen gefunden. Führe <code class="text-gold">task workspace:restart -- website</code> aus, um die Seed-Templates zu erstellen.
    </div>
  {:else}
    {#each results as tpl}
      {@const total = tpl.questions.length}
      {@const passed = tpl.questions.filter(q => q.last_result === 'erfüllt').length}
      {@const untested = tpl.questions.filter(q => !q.last_result).length}
      {@const issues = tpl.questions.filter(q => q.last_result && q.last_result !== 'erfüllt').length}
      <div class="mb-4 bg-dark-light rounded-xl border border-dark-lighter overflow-hidden">
        <!-- Template header -->
        <button
          onclick={() => toggleTemplate(tpl.template_id)}
          class="w-full flex items-center justify-between p-4 hover:bg-dark/40 transition-colors text-left"
        >
          <div class="flex items-center gap-3">
            <span class="text-light font-medium text-sm">{tpl.template_title}</span>
            <div class="flex gap-1.5">
              {#if passed > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400 border border-green-500/20">
                  {passed} ✓
                </span>
              {/if}
              {#if issues > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400 border border-red-500/20">
                  {issues} ✗
                </span>
              {/if}
              {#if untested > 0}
                <span class="px-2 py-0.5 rounded-full text-xs bg-dark text-muted border border-dark-lighter">
                  {untested} offen
                </span>
              {/if}
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            class={`w-4 h-4 text-muted transition-transform ${expandedTemplates.has(tpl.template_id) ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>

        {#if expandedTemplates.has(tpl.template_id)}
          <div class="border-t border-dark-lighter divide-y divide-dark-lighter">
            {#each tpl.questions as step}
              <div class="flex items-start gap-3 px-4 py-3">
                <!-- Status indicator -->
                <div class="flex-shrink-0 mt-0.5">
                  {#if step.last_result === 'erfüllt'}
                    <div class="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-green-400"><path d="M3 8l3.5 3.5L13 5"/></svg>
                    </div>
                  {:else if step.last_result === 'teilweise'}
                    <div class="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <span class="text-amber-400 text-xs font-bold leading-none">~</span>
                    </div>
                  {:else if step.last_result === 'nicht_erfüllt'}
                    <div class="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-red-400"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                    </div>
                  {:else}
                    <div class="w-5 h-5 rounded-full bg-dark border border-dark-lighter flex items-center justify-center">
                      <span class="text-muted text-xs">—</span>
                    </div>
                  {/if}
                </div>

                <!-- Step info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-0.5">
                    <span class="text-muted text-xs">#{step.position}</span>
                    <span class={`px-1.5 py-0 rounded text-xs border ${
                      step.test_role === 'admin'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {step.test_role === 'admin' ? 'Admin' : 'Nutzer'}
                    </span>
                    {#if step.test_function_url}
                      <a href={step.test_function_url} target="_blank" rel="noopener noreferrer"
                        class="text-xs text-gold hover:underline truncate max-w-[200px]">
                        {step.test_function_url}
                      </a>
                    {/if}
                  </div>
                  <p class="text-light text-sm leading-snug">{step.question_text}</p>

                  <!-- Date info -->
                  <div class="flex items-center gap-3 mt-1 flex-wrap">
                    {#if step.last_result}
                      <span class={`text-xs px-2 py-0.5 rounded border ${resultClasses(step.last_result)}`}>
                        {resultLabel(step.last_result)}
                        {#if step.last_result_at}· {fmtDate(step.last_result_at)}{/if}
                      </span>
                    {/if}
                    {#if step.last_success_at && step.last_result !== 'erfüllt'}
                      <span class="text-xs text-muted">Zuletzt erfolgreich: {fmtDate(step.last_success_at)}</span>
                    {:else if step.last_result === 'erfüllt' && step.last_result_at}
                      <span class="text-xs text-green-500/70">Erfolgreich getestet: {fmtDateTime(step.last_result_at)}</span>
                    {/if}
                    {#if !step.last_result}
                      <span class="text-xs text-muted italic">Noch nicht getestet</span>
                    {/if}
                  </div>
                </div>

                <!-- Bug ticket button for failures/partial -->
                {#if step.last_result && step.last_result !== 'erfüllt'}
                  <button
                    onclick={() => openBugModal(step)}
                    class="flex-shrink-0 text-xs text-muted hover:text-red-400 border border-dark-lighter hover:border-red-500/40 rounded px-2 py-1 transition-colors"
                    title="Bug-Ticket erstellen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                      <circle cx="8" cy="9" r="3.5"/><path d="M8 5.5V3.5M5 7H2.5M11 7h2.5M5.5 5l-2-2M10.5 5l2-2M5 12l-2 1.5M11 12l2 1.5"/>
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<!-- Bug ticket modal -->
{#if modalStep}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    role="dialog" aria-modal="true">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl shadow-2xl w-full max-w-lg p-6"
      tabindex="-1">
      {#if modalSuccessId}
        <div class="text-center py-4">
          <div class="text-3xl mb-3">✓</div>
          <p class="text-green-400 font-semibold mb-1">Ticket erstellt</p>
          <p class="text-muted text-sm font-mono">{modalSuccessId}</p>
          <a href="/admin/bugs" class="text-gold text-xs hover:underline mt-2 block">Zu den Bugs →</a>
        </div>
      {:else}
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-light font-semibold">Bug-Ticket erstellen</h3>
            <p class="text-muted text-xs mt-1">Test-Schritt #{modalStep.position}: {modalStep.question_text}</p>
          </div>
          <button onclick={closeModal} class="text-muted hover:text-light p-1">✕</button>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-muted mb-1">Beschreibung</label>
          <textarea
            bind:value={modalDescription}
            rows="5"
            maxlength="2000"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-y"
          ></textarea>
          <p class="text-right text-xs text-muted mt-1">{modalDescription.length}/2000</p>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-muted mb-1">Kategorie</label>
          <select bind:value={modalCategory}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
            <option value="fehler">Fehler</option>
            <option value="verbesserung">Verbesserung</option>
            <option value="erweiterungswunsch">Erweiterungswunsch</option>
          </select>
        </div>
        {#if modalError}
          <p class="text-red-400 text-sm mb-3">{modalError}</p>
        {/if}
        <div class="flex gap-3 justify-end">
          <button onclick={closeModal}
            class="px-4 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light">
            Abbrechen
          </button>
          <button onclick={submitTicket} disabled={modalLoading}
            class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-500 disabled:opacity-50">
            {modalLoading ? 'Erstelle…' : 'Ticket erstellen'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 7.2 — Commit**

```bash
git add website/src/components/admin/TestResultsPanel.svelte
git commit -m "feat(monitoring): add TestResultsPanel for system-test results with bug-ticket modal"
```

---

## Task 8: Add TestResultsPanel to MonitoringDashboard

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 8.1 — Import TestResultsPanel**

At the top of `<script lang="ts">` in `MonitoringDashboard.svelte`, add:

```typescript
import TestResultsPanel from './TestResultsPanel.svelte';
```

- [ ] **Step 8.2 — Add the panel to the template**

Find the section that renders the staleness report (it ends with `</div>` after the staleness section). After the closing div of that section (and before the deployment-action modal), add:

```svelte
<!-- System test results -->
<div class="mb-8 p-6 bg-dark-light rounded-xl border border-dark-lighter">
  <TestResultsPanel />
</div>
```

Place this section **before** the deployments section so it's prominent at the top of the monitoring page, OR after the staleness section at the bottom for logical grouping. Recommended: after the staleness report.

- [ ] **Step 8.3 — Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(monitoring): embed TestResultsPanel in monitoring dashboard"
```

---

## Task 9: Admin Fragebogen View — test_step results display

**Files:**
- Modify: `website/src/pages/admin/fragebogen/[assignmentId].astro`

- [ ] **Step 9.1 — Detect test_step template and extend data fetching**

In the frontmatter, extend imports and data fetching to include the template's `is_system_test` flag and the full question data:

After line `import { computeScores } from '../../../lib/compute-scores';`, the template already has:
```javascript
const [dimensions, questions, allOptions, answers] = await Promise.all([...]);
```

Add a template fetch if not already present:
```javascript
const tpl = await getQTemplate(assignment.template_id).catch(() => null);
const isSystemTest = tpl?.is_system_test ?? false;
```

Also update `getQTemplate` import (it's already in `questionnaire-db` exports).

- [ ] **Step 9.2 — Replace the Einzelantworten section with test_step-aware display**

Replace the existing `<!-- Raw answers -->` section (lines 103-123):

```astro
<!-- Raw answers / Test results -->
<div class="mb-8 p-6 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted uppercase tracking-wide mb-4">
    {isSystemTest ? 'Testergebnisse' : 'Einzelantworten'} ({answers.length}/{questions.length})
  </h2>
  <div class="flex flex-col gap-3">
    {questions.map((q, i) => {
      const answer = answers.find(a => a.question_id === q.id);
      const chosen = answer?.option_key ?? null;
      const details = answer?.details_text ?? null;

      if (q.question_type === 'test_step') {
        const resultColor =
          chosen === 'erfüllt' ? '#22c55e'
          : chosen === 'teilweise' ? '#f59e0b'
          : chosen === 'nicht_erfüllt' ? '#ef4444'
          : '#6b7280';
        const resultLabel =
          chosen === 'erfüllt' ? 'Test erfüllt'
          : chosen === 'teilweise' ? 'Test zum Teil erfüllt'
          : chosen === 'nicht_erfüllt' ? 'Test nicht erfüllt'
          : null;
        return (
          <div class="border-b border-dark-lighter pb-4 last:border-0 last:pb-0">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-muted text-xs">Schritt {i + 1}</span>
              <span class={`px-2 py-0.5 rounded text-xs border ${
                q.test_role === 'admin'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {q.test_role === 'admin' ? 'Admin' : 'Nutzer'}
              </span>
              {q.test_function_url && (
                <a href={q.test_function_url} target="_blank" rel="noopener noreferrer"
                  class="text-xs text-gold hover:underline">{q.test_function_url}</a>
              )}
            </div>
            <p class="text-light text-sm font-medium mb-1">{q.question_text}</p>
            {q.test_expected_result && (
              <p class="text-muted text-xs mb-2 italic">Erwartet: {q.test_expected_result}</p>
            )}
            {chosen ? (
              <div>
                <span class="inline-block px-2 py-0.5 rounded border text-xs font-semibold"
                  style={`color: ${resultColor}; border-color: ${resultColor}40; background-color: ${resultColor}15`}>
                  {resultLabel}
                </span>
                {details && (
                  <p class="text-muted text-xs mt-1 whitespace-pre-line">{details}</p>
                )}
              </div>
            ) : (
              <span class="text-muted text-xs italic">Noch nicht getestet</span>
            )}
          </div>
        );
      }

      return (
        <div class="border-b border-dark-lighter pb-3 last:border-0 last:pb-0">
          <p class="text-muted text-xs mb-1">Frage {i + 1}</p>
          <p class="text-light text-sm whitespace-pre-line mb-1">{q.question_text}</p>
          {chosen ? (
            <span class="inline-block px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded text-xs">
              Gewählt: {chosen}
            </span>
          ) : (
            <span class="text-muted text-xs italic">Nicht beantwortet</span>
          )}
        </div>
      );
    })}
  </div>
</div>
```

**Note on imports:** Add `getQTemplate` to the import from `questionnaire-db` at the top of the file if it's not already imported.

- [ ] **Step 9.3 — Commit**

```bash
git add website/src/pages/admin/fragebogen/[assignmentId].astro
git commit -m "feat(admin-fragebogen): show test_step results with role badge, expected result, color-coded outcome"
```

---

## Task 10: Verify End-to-End Flow

- [ ] **Step 10.1 — Rebuild and restart website**

```bash
task website:redeploy
```

Wait ~30s for pod to become ready.

- [ ] **Step 10.2 — Verify seed templates in DB**

```bash
task workspace:psql -- website
```
```sql
SELECT title, status, is_system_test FROM questionnaire_templates WHERE is_system_test = true;
-- Expected: 2 rows, both published
SELECT COUNT(*), question_type FROM questionnaire_questions GROUP BY question_type;
-- Expected: includes 40 test_step rows
```

- [ ] **Step 10.3 — Verify monitoring section**

Open `/admin/monitoring` — the "System-Testprotokolle" section should appear at the bottom showing both templates with all 40 questions marked "Noch nicht getestet".

- [ ] **Step 10.4 — Assign and fill a test questionnaire**

1. In `/admin/clients`, create a test client.
2. Assign the "System-Testprotokoll: Admin-Funktionen" template to that client.
3. In a second browser profile, log in as the test user and open `/portal/fragebogen/[id]`.
4. Confirm the wizard shows the role badge, expected result, function link, and the 3-option result buttons.
5. Answer a few steps (mix of erfüllt / teilweise / nicht_erfüllt) + add details text.
6. Submit the questionnaire.

- [ ] **Step 10.5 — Verify monitoring updates**

Refresh `/admin/monitoring`. The test steps you answered should now show:
- Green checkmark + date for "erfüllt" steps
- Amber/red indicators for partial/failed steps
- "Zuletzt erfolgreich" date tracking correct

Click the bug icon on a failed step — the modal should pre-fill with description and allow creating a ticket.

- [ ] **Step 10.6 — Verify admin fragebogen view**

Open `/admin/fragebogen/[assignment-id]` (linked from client detail). Each test_step should show its role badge, function URL, expected result, color-coded outcome, and details text.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Two questionnaire templates seeded (Admin-Funktionen 20 steps, Nutzerfunktionen 20 steps)
- ✅ Each step: what to test, expected result, function URL, role badge (Admin/Nutzer)
- ✅ Details text input field
- ✅ Three options: erfüllt / teilweise / nicht_erfüllt  
- ✅ Monitoring section with test results
- ✅ Last successful test date shown
- ✅ Last result date shown
- ✅ Bug ticket creation for non-erfüllt results (matches existing modal pattern)
- ✅ Filling anytime (assignment-based, create new assignment for each run)

**Gaps / Notes:**
- The wizard "submit" for pure test_step templates requires the user to save the last step via "Letzten Schritt speichern" AND then click "Testprotokoll absenden". The submit button only appears after all steps are answered. This is intentional: it prevents partial submissions from updating the monitoring.
- System test templates are published + is_system_test=true, so the admin can't accidentally edit them via the editor UI.
- The `details_text` column on `questionnaire_answers` is added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, safe for repeated restarts.
- For future test runs: the admin creates a new assignment from the client detail page. The monitoring always reflects the most recent submission.
