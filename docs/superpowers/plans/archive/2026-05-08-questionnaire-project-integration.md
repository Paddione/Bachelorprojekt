---
title: Questionnaire → Project Integration & Content Update — Implementation Plan
domains: [website, db]
status: active
pr_number: null
---

# Questionnaire → Project Integration & Content Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link every questionnaire assignment to an auto-created project in the tickets system, add an archive status and per-question task-creation to the review page, and update the 10 system-test templates with staleness fixes plus two new categories (LiveKit and Projektmanagement).

**Architecture:** The `assign.ts` API endpoint creates a `tickets.tickets` project before calling `createQAssignment`, passing the new project_id in. `questionnaire_assignments` gains a nullable `project_id` FK and an `archived_at` timestamp. The review page (`[assignmentId].astro`) gains a project badge, per-question "Als Aufgabe anlegen" buttons wired to a new API route, and an "Archivieren" action. System-test seed data grows from 10 to 12 templates.

**Tech Stack:** TypeScript, Astro, PostgreSQL (via `pg` pool), Vitest (unit tests). Run tests with `bun run test` inside `website/`. Deploy with `task website:redeploy ENV=mentolder` (then korczewski).

---

## File map

| File | Action | What changes |
|---|---|---|
| `website/src/lib/questionnaire-db.ts` | Modify | DB migration cols; `QAssignment` type; `AssignmentStatus`; `createQAssignment`; `updateQAssignment`; all SELECT queries |
| `website/src/pages/api/admin/questionnaires/assign.ts` | Modify | Create project before assignment, pass `projectId` |
| `website/src/pages/api/admin/questionnaires/assignments/[id]/create-task.ts` | Create | New route: create a task in the linked project |
| `website/src/pages/admin/fragebogen/[assignmentId].astro` | Modify | Project badge; "Als Aufgabe anlegen" buttons; "Archivieren" button |
| `website/src/lib/system-test-seed-data.ts` | Modify | Fix 4 stale items; add ST 11 + ST 12 |
| `website/src/lib/system-test-seed-data.test.ts` | Modify | Update expected counts (10→12, 89→104) |

---

### Task 1: DB migration + types in questionnaire-db.ts

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts`

Add two nullable columns to `questionnaire_assignments` and update all TypeScript types that reference assignment rows.

- [ ] **Step 1: Add `'archived'` to `AssignmentStatus` and `project_id` / `archived_at` to `QAssignment`**

In `website/src/lib/questionnaire-db.ts`, change lines near the top:

```typescript
export type AssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'archived' | 'dismissed';
```

And extend `QAssignment`:

```typescript
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
```

- [ ] **Step 2: Add column migrations inside `initDb()`**

Find the block with `ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS dismissed_at` and add right after it:

```typescript
await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL`);
await pool.query(`ALTER TABLE questionnaire_assignments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
```

- [ ] **Step 3: Update all SELECT queries that return assignment rows**

There are three: `createQAssignment`, `getQAssignment`, and `updateQAssignment`. Each has a `RETURNING` or `SELECT` list. Add `a.project_id, a.archived_at` (or just `project_id, archived_at` in the RETURNING clause).

**`createQAssignment` RETURNING clause** — change:
```typescript
`INSERT INTO questionnaire_assignments (customer_id, template_id)
 VALUES ($1, $2)
 RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
           submitted_at, reviewed_at, dismissed_at, dismiss_reason`,
```
to:
```typescript
`INSERT INTO questionnaire_assignments (customer_id, template_id, project_id)
 VALUES ($1, $2, $3)
 RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
           submitted_at, reviewed_at, archived_at, dismissed_at, dismiss_reason, project_id`,
[params.customerId, params.templateId, params.projectId ?? null],
```

Also add `projectId?: string` to the params type:
```typescript
export async function createQAssignment(params: {
  customerId: string; templateId: string; projectId?: string;
}): Promise<QAssignment> {
```

**`getQAssignment` SELECT** — in the `SELECT a.id, a.customer_id, ...` query, add `, a.archived_at, a.project_id`:
```typescript
`SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
        a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
        a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
 FROM questionnaire_assignments a
 JOIN questionnaire_templates t ON t.id = a.template_id
 WHERE a.id = $1`,
```

**`listQAssignmentsForCustomer` SELECT** — same addition:
```typescript
`SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
        a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
        a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
 FROM questionnaire_assignments a
 JOIN questionnaire_templates t ON t.id = a.template_id
 WHERE a.customer_id = $1
 ORDER BY a.assigned_at DESC`,
```

**`updateQAssignment` RETURNING clause** — add `archived_at, project_id`:
```typescript
`UPDATE questionnaire_assignments SET ${sets.join(', ')}
 WHERE id = $${vals.length}
 RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
           submitted_at, reviewed_at, archived_at, dismissed_at, dismiss_reason, project_id`,
```

- [ ] **Step 4: Handle `archived_at` in `updateQAssignment`**

Find the block that sets `submitted_at`, `reviewed_at`, `dismissed_at` and add:
```typescript
if (params.status === 'archived') sets.push(`archived_at = now()`);
```

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts
git commit -m "feat(questionnaire): add project_id + archived_at columns and archived status"
```

---

### Task 2: Auto-create project on assignment in assign.ts

**Files:**
- Modify: `website/src/pages/api/admin/questionnaires/assign.ts`

The endpoint already has everything needed: `customer.id`, `tpl.title`, `tpl.is_system_test`, `clientName`, and `PROD_DOMAIN`. Create the project before creating the assignment.

- [ ] **Step 1: Add imports**

At the top of `assign.ts`, add `createProject` to the import from `website-db`:
```typescript
import { getCustomerByEmail, createProject } from '../../../../lib/website-db';
```

Also add a brand constant near the PROD_DOMAIN line:
```typescript
const BRAND = process.env.BRAND || 'mentolder';
```

- [ ] **Step 2: Create project and pass projectId to createQAssignment**

Replace this line:
```typescript
const assignment = await createQAssignment({ customerId: customer.id, templateId: tpl.id });
```

With:
```typescript
const projectTitle = tpl.is_system_test
  ? tpl.title
  : `${tpl.title} — ${clientName}`;

const projectId = await createProject({
  brand: BRAND,
  name: projectTitle,
  status: 'entwurf',
  priority: 'mittel',
  customerId: customer.id,
}).catch((err) => {
  console.error('[assign] project creation failed, continuing without project_id:', err);
  return null;
});

const assignment = await createQAssignment({
  customerId: customer.id,
  templateId: tpl.id,
  projectId: projectId ?? undefined,
});
```

- [ ] **Step 3: Verify locally**

Start the dev server (`task website:dev`) and assign a template to a test user. Check that `/admin/projekte` shows the new project. Check `questionnaire_assignments` in the DB has `project_id` set.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/questionnaires/assign.ts
git commit -m "feat(questionnaire): auto-create tickets project on assignment"
```

---

### Task 3: New API route — create-task

**Files:**
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id]/create-task.ts`

This route creates a `ProjectTask` under the assignment's linked project. One task per question, triggered by the admin in the review UI.

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "website/src/pages/api/admin/questionnaires/assignments/[id]"
```

Create `website/src/pages/api/admin/questionnaires/assignments/[id]/create-task.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getQAssignment, getQQuestion } from '../../../../../../lib/questionnaire-db';
import { createProjectTask } from '../../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const assignment = await getQAssignment(params.id!).catch(() => null);
  if (!assignment) return new Response(JSON.stringify({ error: 'Auftrag nicht gefunden.' }), { status: 404 });
  if (!assignment.project_id) {
    return new Response(JSON.stringify({ error: 'Kein Projekt verknüpft.' }), { status: 409 });
  }

  const body = await request.json() as { questionId?: string };
  if (!body.questionId) {
    return new Response(JSON.stringify({ error: 'questionId erforderlich.' }), { status: 400 });
  }

  const question = await getQQuestion(body.questionId).catch(() => null);
  if (!question) return new Response(JSON.stringify({ error: 'Frage nicht gefunden.' }), { status: 404 });

  const taskName = question.question_text.length > 120
    ? question.question_text.slice(0, 117) + '…'
    : question.question_text;

  const taskId = await createProjectTask({
    projectId: assignment.project_id,
    name: taskName,
    description: question.test_expected_result ?? undefined,
    status: 'entwurf',
    priority: 'mittel',
  });

  return new Response(JSON.stringify({ taskId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Export `getQQuestion` from questionnaire-db.ts**

Check if `getQQuestion` already exists. If not, add it after `listQQuestions`:

```typescript
export async function getQQuestion(id: string): Promise<QQuestion | null> {
  const r = await pool.query(
    `SELECT id, template_id, position, question_text, question_type,
            test_expected_result, test_function_url, test_menu_path, test_role, created_at
     FROM questionnaire_questions WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add "website/src/pages/api/admin/questionnaires/assignments/[id]/create-task.ts" \
        website/src/lib/questionnaire-db.ts
git commit -m "feat(questionnaire): POST create-task route for assignment review"
```

---

### Task 4: Review page enhancements ([assignmentId].astro)

**Files:**
- Modify: `website/src/pages/admin/fragebogen/[assignmentId].astro`

Add three things: (1) project badge at top, (2) "Als Aufgabe anlegen" button per question row, (3) "Archivieren" button in the notes section.

- [ ] **Step 1: Add project badge**

In the frontmatter, `assignment` already has `project_id`. In the HTML, find the header block (the `div.mb-8` with title + status badge) and add the project link below the `<p>Eingereicht:…</p>` line:

```astro
{assignment.project_id && (
  <a
    href={`/admin/projekte/${assignment.project_id}`}
    class="inline-flex items-center gap-1 mt-2 text-xs text-gold/70 hover:text-gold underline"
  >
    → Verknüpftes Projekt öffnen
  </a>
)}
```

- [ ] **Step 2: Add "Als Aufgabe anlegen" button per question**

Locate the question rendering loop (it renders each question with its answer). For each `test_step` question that has been answered, add the button after the answer display. Find the block where `.file-bug-btn` is rendered (it's inside the step question loop) and add alongside it:

```astro
{assignment.project_id && (
  <button
    class="create-task-btn text-xs px-2 py-1 bg-dark border border-dark-lighter text-light/70 rounded hover:border-gold/40 hover:text-light transition-colors"
    data-question-id={q.id}
    data-assignment-id={assignmentId}
  >
    + Aufgabe
  </button>
)}
<span id={`task-result-${q.id}`} class="text-xs text-green-400 hidden"></span>
```

- [ ] **Step 3: Add "Archivieren" button to notes section**

Find the `{assignment.status !== 'reviewed' && (...)}` block for the "Als besprochen markieren" button, and after it add:

```astro
{assignment.status === 'reviewed' && (
  <button id="archive-btn"
    class="px-4 py-2 bg-dark border border-dark-lighter text-muted rounded-lg text-sm hover:border-gold/40 hover:text-light transition-colors">
    Archivieren
  </button>
)}
```

Also update the status badge color block to handle `'archived'`:

```astro
assignment.status === 'archived' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
```

- [ ] **Step 4: Wire up JS for new buttons**

In the `<script define:vars={{ assignmentId }}>` block, add after the existing `closeBugModal` function:

```javascript
// Task creation
document.querySelectorAll('.create-task-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const questionId = btn.dataset.questionId;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch(
        `/api/admin/questionnaires/assignments/${assignmentId}/create-task`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId }),
        },
      );
      const data = await r.json().catch(() => ({}));
      const resultEl = document.getElementById(`task-result-${questionId}`);
      if (r.ok && data.taskId) {
        btn.remove();
        if (resultEl) {
          resultEl.textContent = '✓ Aufgabe angelegt';
          resultEl.classList.remove('hidden');
        }
      } else {
        btn.disabled = false;
        btn.textContent = '+ Aufgabe';
        if (resultEl) {
          resultEl.textContent = data.error || 'Fehler';
          resultEl.className = 'text-xs text-red-400';
          resultEl.classList.remove('hidden');
        }
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '+ Aufgabe';
    }
  });
});

// Archive
document.getElementById('archive-btn')?.addEventListener('click', async () => {
  const r = await fetch(`/api/admin/questionnaires/assignments/${assignmentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'archived' }),
  });
  if (r.ok) window.location.reload();
});
```

- [ ] **Step 5: Verify the review page in the browser**

Start `task website:dev`. Create a test assignment, submit answers in the portal, then open the review page in admin. Verify:
- Project badge links to `/admin/projekte/<id>` when project_id is set.
- "+ Aufgabe" button appears on each answered question.
- Clicking it creates a task and shows "✓ Aufgabe angelegt".
- After marking "Als besprochen markieren", the "Archivieren" button appears.
- Clicking "Archivieren" reloads the page and shows `archived` status badge.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/fragebogen/\[assignmentId\].astro
git commit -m "feat(questionnaire): project badge, task creation, and archive action in review page"
```

---

### Task 5: Content updates — system-test-seed-data.ts

**Files:**
- Modify: `website/src/lib/system-test-seed-data.ts`

Four stale fixes + two new templates.

- [ ] **Step 1: Fix ST 3 title**

Change:
```typescript
title: 'System-Test 3: Kommunikation — Fragebogen-Widget, Inbox & E-Mail',
```
To:
```typescript
title: 'System-Test 3: Kommunikation — Chat-Widget, Inbox & E-Mail',
```

- [ ] **Step 2: Fix ST 2 step 6 expected_result**

Find step 6 in the ST 2 template (the "Projekt anlegen" step). Update `expected_result`:
```typescript
expected_result: 'Projekt erscheint in /admin/projekte; Tickets-System-Projekt mit Status „Entwurf" angelegt; Zuordnung zum Client sichtbar.',
```

- [ ] **Step 3: Fix ST 4 step 2 expected_result**

Find step 2 in the ST 4 template (the "Template veröffentlichen + Client zuweisen" step). Update `expected_result`:
```typescript
expected_result: 'Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard; verknüpftes Projekt automatisch unter /admin/projekte angelegt.',
```

- [ ] **Step 4: Fix ST 9 step 6 expected_result**

Find the last step of ST 9 (the "Test-Results-Panel" step). Update `expected_result`:
```typescript
expected_result: 'Alle 12 Templates sichtbar mit last_result/last_success_at; Drilldown auf Question-Level möglich.',
```

- [ ] **Step 5: Add ST 11 — LiveKit & Streaming (7 steps)**

After the closing `},` of ST 10, before the final `];`, add:

```typescript
  {
    title: 'System-Test 11: LiveKit & Streaming',
    description: 'Vollständiger Test des LiveKit-Streaming-Stacks: Admin-Steuerseite, Stream starten/stoppen, Viewer-Portal, RTMP-Ingress, Recording-Liste und Pod-Status.',
    instructions: 'Schritte 1, 4, 5, 6, 7 im Admin-Browser. Schritt 2 startet den Stream — danach Schritt 3 im Testnutzer-Browser. Schritt 6 beendet den Stream.',
    steps: [
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) — prüfe ob der Stream-Status „offline" angezeigt wird und die Seite ohne Fehler lädt.',
        expected_result: 'Seite lädt; Stream-Status „offline"; keine Fehlermeldungen.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: 'Klicke auf der Admin-Stream-Seite (Link) den Start-Button — prüfe ob der Status auf „live" wechselt und ein Stream-Token generiert wird.',
        expected_result: 'Status wechselt auf „live"; Stream-Token sichtbar.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: 'Öffne das Viewer-Portal (Link) im Testnutzer-Browser während der Stream läuft — prüfe ob der Stream-Player sichtbar ist und keine Verbindungsfehler erscheinen. → Nutzer: zweites Browser-Profil.',
        expected_result: 'Stream-Player sichtbar; Verbindung aufgebaut; kein Fehler im Browser.',
        test_function_url: '/portal/stream', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Stream muss laufen (Schritt 2 abgeschlossen).',
      },
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) — prüfe ob der RTMP-Ingress-Status und die RTMP-URL angezeigt werden.',
        expected_result: 'RTMP-URL sichtbar; Ingress-Status angezeigt (aktiv oder bereit).',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) → klicke „Aufnahmen" oder scrolle zur Recordings-Liste — prüfe ob vorhandene MP4-Dateien aufgelistet werden oder eine leere Liste ohne Fehler erscheint.',
        expected_result: 'Recordings-Liste lädt; MP4-Dateien sichtbar oder leere Liste ohne Fehler.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: 'Klicke auf der Admin-Stream-Seite (Link) den Stop-Button — prüfe ob der Status auf „offline" wechselt und das Viewer-Portal „kein Stream" anzeigt.',
        expected_result: 'Status wechselt auf „offline"; Viewer-Portal zeigt „kein Stream aktiv".',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) — prüfe ob der `livekit-server` Pod im Status „Running" ist und kein CrashLoop vorliegt.',
        expected_result: '`livekit-server` Pod im Status „Running"; kein CrashLoop.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 12: Projektmanagement',
    description: 'Vollständiger Test des Projektmanagement-Moduls: Projekte, Teilprojekte, Aufgaben, Zeiterfassung, Meeting-Verknüpfung und Archivierung.',
    instructions: 'Alle Schritte im Admin-Browser. Öffne jeweils den Link im Schritt. Schritte bauen aufeinander auf — in Reihenfolge abarbeiten.',
    steps: [
      {
        question_text: 'Öffne Projekte (Link) → klicke „Neues Projekt" → fülle Titel und Client aus → speichere — prüfe ob das Projekt in der Liste erscheint.',
        expected_result: 'Projekt erscheint in der Liste; Pflichtfeld-Validierung serverseitig.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Öffne das neu angelegte Projekt (Link) → wechsle zum Reiter „Teilprojekte" → klicke „Neues Teilprojekt" → trage Titel ein und speichere — prüfe ob das Teilprojekt erscheint.',
        expected_result: 'Teilprojekt erscheint unter dem Reiter „Teilprojekte" des Projekts.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Aufgaben" → klicke „Neue Aufgabe" → fülle Titel und Priorität aus → speichere — prüfe ob die Aufgabe mit Status „Entwurf" erscheint.',
        expected_result: 'Aufgabe erscheint in der Liste; Status „Entwurf"; Aufgaben-Counter aktualisiert.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → klicke auf die Aufgabe → ändere den Status auf „Erledigt" → speichere — prüfe ob der Aufgaben-Counter sofort sinkt.',
        expected_result: 'Status wechselt sofort auf „Erledigt"; offene Aufgaben-Counter sinkt.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Zeiterfassung" → klicke „Zeit buchen" → trage Dauer und Beschreibung ein → speichere — prüfe ob der Gesamtzeit-Counter aktualisiert wird.',
        expected_result: 'Zeiteintrag gespeichert; Gesamtzeit-Counter des Projekts erhöht sich.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → ändere den Projekt-Status auf „Aktiv" → speichere — prüfe ob das Status-Badge aktualisiert wird und das Projekt in der aktiven Filter-Ansicht erscheint.',
        expected_result: 'Status-Badge zeigt „Aktiv"; Projekt erscheint in gefilterten „Aktiv"-Ansicht.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Besprechungen" → klicke „Meeting verknüpfen" → wähle ein vorhandenes Meeting aus — prüfe ob es im Reiter erscheint.',
        expected_result: 'Meeting erscheint im Reiter „Besprechungen" des Projekts.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → ändere den Status auf „Archiviert" → speichere — prüfe ob das Projekt aus der Standard-Liste verschwindet und in der Archiv-Ansicht sichtbar ist.',
        expected_result: 'Projekt verschwindet aus Standard-Liste; in Archiv-Ansicht sichtbar.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
    ],
  },
```

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/system-test-seed-data.ts
git commit -m "feat(system-tests): fix stale questions; add ST 11 LiveKit and ST 12 Projektmanagement"
```

---

### Task 6: Update tests for new template count

**Files:**
- Modify: `website/src/lib/system-test-seed-data.test.ts`

- [ ] **Step 1: Update expected counts**

Change the three assertions:

```typescript
const EXPECTED_STEP_COUNTS = [6, 10, 5, 5, 5, 12, 16, 14, 6, 10, 7, 8];
```

```typescript
it('exports exactly 12 templates', () => {
  expect(SYSTEM_TEST_TEMPLATES).toHaveLength(12);
});
```

```typescript
it('totals 104 steps across all templates', () => {
  const total = SYSTEM_TEST_TEMPLATES.reduce((sum, t) => sum + t.steps.length, 0);
  expect(total).toBe(104);
});
```

- [ ] **Step 2: Run tests**

```bash
cd website && bun run test src/lib/system-test-seed-data.test.ts
```

Expected: all tests pass. If any fail, check that:
- `SYSTEM_TEST_TEMPLATES` has 12 entries
- Step counts array matches the actual step counts in the seed file

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/system-test-seed-data.test.ts
git commit -m "test(system-tests): update expected counts for 12 templates and 104 steps"
```

---

### Task 7: Rollout — reseed templates on live clusters

After all code is merged and deployed:

- [ ] **Step 1: Delete stale system-test templates on mentolder**

```bash
kubectl --context mentolder -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c \
  "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
```

- [ ] **Step 2: Restart website pod on mentolder**

```bash
kubectl --context mentolder -n website rollout restart deployment/website
```

- [ ] **Step 3: Verify on mentolder**

```bash
kubectl --context mentolder -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c \
  "SELECT title FROM questionnaire_templates WHERE is_system_test = true ORDER BY created_at;"
```

Expected: 12 rows returned.

- [ ] **Step 4: Repeat for korczewski**

```bash
kubectl --context korczewski -n workspace-korczewski exec deployment/shared-db -- \
  psql -U postgres -d website -c \
  "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
kubectl --context korczewski -n website rollout restart deployment/website
```

- [ ] **Step 5: Verify in `/admin/monitoring`**

Open `https://web.mentolder.de/admin/monitoring` → Test-Results-Panel → confirm 12 templates visible with `last_result = NULL`.

---

### Task 8: End-to-end smoke test

Validate the full new feature chain is working.

- [ ] **Step 1: Assign a questionnaire and verify project creation**

In `/admin/fragebogen`, assign a coaching template to a test client. Then open `/admin/projekte` and verify a new project with the template title appears.

- [ ] **Step 2: Submit as client and open review**

In `/portal`, log in as the test client, open the assigned questionnaire, answer all questions, submit. Then open `/admin/fragebogen/<assignmentId>` as admin.

- [ ] **Step 3: Verify project badge**

Check that the "→ Verknüpftes Projekt öffnen" link appears at the top of the review page and navigates to the correct project.

- [ ] **Step 4: Create a task from a question**

Click "+ Aufgabe" on one question. Verify "✓ Aufgabe angelegt" appears. Open `/admin/projekte/<projectId>` and confirm the task is listed with the question text as its name.

- [ ] **Step 5: Archive the assignment**

Click "Als besprochen markieren ✓", then "Archivieren". Verify the status badge updates to `archived`.

- [ ] **Step 6: Assign a system-test template and verify project**

In `/admin/fragebogen`, assign "System-Test 1: Authentifizierung & SSO" to the admin user (themselves). Verify a project titled "System-Test 1: Authentifizierung & SSO" appears in `/admin/projekte`.
