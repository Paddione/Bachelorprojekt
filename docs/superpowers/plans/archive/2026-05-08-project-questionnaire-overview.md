---
title: Project & Ticket Overview — Questionnaire Section Implementation Plan
domains: [website, db]
status: active
pr_number: null
---

# Project & Ticket Overview — Questionnaire Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the linked questionnaire (questions, answers, scores, coach notes) inline on `/admin/projekte/<id>` and `/admin/tickets/<id>`, so the project's questionnaire origin is visible without leaving the page.

**Architecture:** One new read-only DB helper (`listQAssignmentsForProject`) plus one shared Astro section component (`ProjectQuestionnairesPanel.astro`) embedded on both host pages. No schema migrations, no new API routes. The component reuses the score bar markup from the existing `/admin/fragebogen/[assignmentId].astro` review page, kept inline rather than abstracted.

**Tech Stack:** Astro 5 frontmatter rendering, Svelte islands (existing), TypeScript, PostgreSQL (`pg` client via `pool` in `website/src/lib/questionnaire-db.ts`), Tailwind tokens already used in the codebase (`bg-dark-light`, `border-dark-lighter`, `text-light`, `text-muted`, `text-gold`).

**Spec:** [`docs/superpowers/specs/2026-05-08-project-questionnaire-overview-design.md`](../specs/2026-05-08-project-questionnaire-overview-design.md)

**Parallelism note:** Task 1 and Task 2 are sequential. Task 3 and Task 4 can run in parallel — they touch different host pages and both depend on Task 2 (the shared component) being on disk.

---

## Task 1: Add `listQAssignmentsForProject` DB helper

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` (add function after `listQAssignmentsForCustomer`, around line 488)

- [ ] **Step 1: Read the existing `listQAssignmentsForCustomer` to mirror its shape exactly**

The new helper must return rows in the same `QAssignment` shape (joined `template_title`). Look at lines 476–488 of `website/src/lib/questionnaire-db.ts`.

- [ ] **Step 2: Add the new function**

Insert this immediately after `listQAssignmentsForCustomer` (the existing function ends with a closing brace around line 488):

```typescript
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
```

- [ ] **Step 3: Type-check the change**

Run from repo root:

```bash
cd website && npx tsc --noEmit -p tsconfig.json
```

Expected: zero errors. If `tsc` reports issues outside `questionnaire-db.ts`, ignore — only the new function and its call sites must be clean.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/questionnaire-db.ts
git commit -m "feat(questionnaire): add listQAssignmentsForProject helper

Reverse lookup for project → questionnaire context. Filters out
system-test templates (QA runs, not project context)."
```

---

## Task 2: Build `ProjectQuestionnairesPanel.astro`

**Files:**
- Create: `website/src/components/admin/ProjectQuestionnairesPanel.astro`

- [ ] **Step 1: Create the component file with the props contract and markup**

Write the full component:

```astro
---
// website/src/components/admin/ProjectQuestionnairesPanel.astro
//
// Shared section for /admin/projekte/[id] and /admin/tickets/[id].
// Renders nothing when `assignments` is empty.
//
// Score-bar rendering mirrors /admin/fragebogen/[assignmentId].astro lines 84–117
// so the panel matches the full review page visually.

import type { QAssignment, QQuestion, QAnswer, QAnswerOption } from '../../lib/questionnaire-db';
import type { ScoreRow } from '../../lib/compute-scores';

interface AssignmentBundle {
  assignment: QAssignment;
  questions: QQuestion[];
  options: QAnswerOption[];
  answers: QAnswer[];
  scores: ScoreRow[];
}

interface Props {
  assignments: AssignmentBundle[];
}

const { assignments } = Astro.props;

function fmtDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function levelColor(level: string | null): string {
  if (level === 'kritisch') return '#ef4444';
  if (level === 'mittel') return '#f59e0b';
  if (level === 'förderlich') return '#22c55e';
  return '#b8a06a';
}

const STATUS_CLS: Record<string, string> = {
  pending:     'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  submitted:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  reviewed:    'bg-green-500/10 text-green-400 border-green-500/20',
  archived:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  dismissed:   'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Wartend',
  in_progress: 'In Bearbeitung',
  submitted:   'Eingereicht',
  reviewed:    'Besprochen',
  archived:    'Archiviert',
  dismissed:   'Abgelehnt',
};
---

{assignments.length > 0 && (
  <section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 mb-6" id="questionnaires-panel">
    <h2 class="text-sm font-semibold text-light mb-4 font-serif uppercase tracking-wide">
      Fragebögen ({assignments.length})
    </h2>

    <div class="flex flex-col gap-6">
      {assignments.map(({ assignment, questions, options, answers, scores }) => {
        const answerMap = new Map(answers.map(a => [a.question_id, a]));
        const optionMap = new Map(options.map(o => [`${o.question_id}:${o.option_key}`, o]));
        const isMuted   = assignment.status === 'archived' || assignment.status === 'dismissed';
        const showQA    = ['in_progress', 'submitted', 'reviewed', 'archived'].includes(assignment.status);
        const showScores = scores.length > 0 && ['submitted', 'reviewed', 'archived'].includes(assignment.status);
        const dateLabel = assignment.submitted_at
          ? `Eingereicht ${fmtDate(assignment.submitted_at)}`
          : `Zugewiesen ${fmtDate(assignment.assigned_at)}`;
        const maxScore = Math.max(...scores.map(s => s.threshold_high ?? s.final_score ?? 1), 1);

        return (
          <div class={`border border-dark-lighter rounded-xl p-5 ${isMuted ? 'opacity-60' : ''}`}>
            {/* Header */}
            <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div class="min-w-0">
                <h3 class="text-light font-medium">{assignment.template_title}</h3>
                <p class="text-muted text-xs mt-0.5">{dateLabel}</p>
              </div>
              <span class={`px-2.5 py-0.5 rounded-full border text-xs ${STATUS_CLS[assignment.status] ?? ''}`}>
                {STATUS_LABEL[assignment.status] ?? assignment.status}
              </span>
            </div>

            {/* Dismissed reason */}
            {assignment.status === 'dismissed' && assignment.dismiss_reason && (
              <p class="text-xs text-muted italic mb-3">Abgelehnt: {assignment.dismiss_reason}</p>
            )}

            {/* Score bars */}
            {showScores && (
              <div class="mb-4">
                <div class="flex flex-col gap-3">
                  {scores.map(score => {
                    const pct = Math.min((score.final_score / Math.max(maxScore, 1)) * 100, 100);
                    const color = levelColor(score.level);
                    return (
                      <div>
                        <div class="flex justify-between items-baseline mb-1">
                          <span class="text-light text-xs">{score.name}</span>
                          <span class="text-xs font-mono" style={`color: ${color}`}>
                            {score.final_score}{score.level && ` · ${score.level}`}
                          </span>
                        </div>
                        <div class="h-1.5 bg-dark rounded-full overflow-hidden">
                          <div class="h-full rounded-full"
                            style={`width: ${pct}%; background-color: ${color}`}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coach notes preview */}
            {assignment.coach_notes && assignment.coach_notes.trim().length > 0 && (
              <div class="mb-4 p-3 bg-dark rounded border border-dark-lighter">
                <p class="text-xs text-muted uppercase tracking-wide mb-1">Coach-Notizen</p>
                <p class="text-sm text-light/90 whitespace-pre-wrap">{assignment.coach_notes}</p>
              </div>
            )}

            {/* Q&A list — collapsible */}
            {showQA && questions.length > 0 && (
              <details class="mt-2">
                <summary class="cursor-pointer text-xs text-gold hover:text-gold-light select-none">
                  Fragen &amp; Antworten anzeigen ({answers.length}/{questions.length})
                </summary>
                <div class="mt-3 flex flex-col gap-3">
                  {questions.map((q, i) => {
                    const ans = answerMap.get(q.id);
                    const chosen = ans?.option_key ?? null;
                    const opt = chosen ? optionMap.get(`${q.id}:${chosen}`) : null;
                    const label = opt?.label ?? chosen;
                    return (
                      <div class="border-b border-dark-lighter/50 pb-2 last:border-0 last:pb-0">
                        <p class="text-muted text-xs mb-0.5">Frage {i + 1}</p>
                        <p class="text-light text-sm whitespace-pre-line mb-1">{q.question_text}</p>
                        {chosen === 'skipped' ? (
                          <span class="inline-block px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs">
                            Übersprungen
                          </span>
                        ) : chosen ? (
                          <span class="inline-block px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded text-xs">
                            {label}
                          </span>
                        ) : (
                          <span class="text-muted text-xs italic">Nicht beantwortet</span>
                        )}
                        {ans?.details_text && (
                          <p class="text-muted text-xs mt-1 whitespace-pre-line">{ans.details_text}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* Link to full review */}
            <div class="mt-3 flex justify-end">
              <a href={`/admin/fragebogen/${assignment.id}`}
                class="text-xs text-gold/80 hover:text-gold underline">
                Volle Review öffnen →
              </a>
            </div>
          </div>
        );
      })}
    </div>
  </section>
)}
```

- [ ] **Step 2: Verify exported types in `questionnaire-db.ts` cover what the component imports**

The component imports `QAssignment`, `QQuestion`, `QAnswer`, `QAnswerOption`. Confirm these are all exported from `website/src/lib/questionnaire-db.ts` (top of file, around lines 20–91). If `QAnswerOption` is not exported, find its exact name (search for `interface .*Option` in that file) and adjust the import. Likely correct names: `QOption` or `QAnswerOption`. Use whatever the file actually exports.

```bash
grep -nE "^export (type|interface) Q" website/src/lib/questionnaire-db.ts
```

Expected output should list the four types. If naming differs, update the component import line.

- [ ] **Step 3: Verify `ScoreRow` exists in `compute-scores.ts`**

```bash
grep -nE "^export (type|interface) " website/src/lib/compute-scores.ts
```

If the type is named differently (e.g. `Score`), update the import in the component. Match what's actually exported.

- [ ] **Step 4: Type-check the new component**

```bash
cd website && npx astro check 2>&1 | grep -A2 ProjectQuestionnairesPanel
```

Expected: no errors. If `astro check` is slow, alternatively `npx tsc --noEmit -p tsconfig.json` covers it (component types resolve through Astro's type generation).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/ProjectQuestionnairesPanel.astro
git commit -m "feat(admin): add ProjectQuestionnairesPanel component

Shared section for project + ticket detail pages. Renders linked
questionnaire(s) inline: title, status, scores, coach notes, and
collapsible Q&A. Empty array -> renders nothing."
```

---

## Task 3: Embed panel in `/admin/projekte/[id].astro`

**Files:**
- Modify: `website/src/pages/admin/projekte/[id].astro` (frontmatter imports + fetch; render after Direct-tasks section, before Zeiterfassung)

- [ ] **Step 1: Add imports to the frontmatter**

In `website/src/pages/admin/projekte/[id].astro`, the imports section is lines 1–11. Add these lines after the existing imports:

```astro
import {
  listQAssignmentsForProject,
  listQQuestions,
  listQAnswerOptionsForTemplate,
  listQAnswers,
  listQDimensions,
} from '../../../lib/questionnaire-db';
import { computeScores } from '../../../lib/compute-scores';
import ProjectQuestionnairesPanel from '../../../components/admin/ProjectQuestionnairesPanel.astro';
```

- [ ] **Step 2: Add the questionnaire fetch alongside the existing `Promise.all` blocks**

The existing fetch lives inside the `try` at lines 34–50. Add a new block that runs in parallel with the existing `else` branch (the non-`besprechungen` case), so questionnaire data is loaded for the default project tab.

Find this block (around lines 42–50):

```typescript
} else {
  [subProjects, directTasks, timeEntries, timeStats, attachments] = await Promise.all([
    listSubProjects(id),
    listDirectTasks(id),
    listTimeEntries(id),
    getProjectTotalMinutes(id),
    listProjectAttachments(id),
  ]);
}
```

Right after that block (still inside `if (project) { ... else { ... }`), but **outside** the destructuring assignment (so it runs after subprojects load), add:

```typescript
}

// Questionnaire bundle for the panel — only on the default tab
if (tab !== 'besprechungen' && project) {
  try {
    const assignments = await listQAssignmentsForProject(id);
    questionnaireBundles = await Promise.all(assignments.map(async a => {
      const [questions, options, answers, dimensions] = await Promise.all([
        listQQuestions(a.template_id),
        listQAnswerOptionsForTemplate(a.template_id),
        listQAnswers(a.id),
        listQDimensions(a.template_id),
      ]);
      return { assignment: a, questions, options, answers, scores: computeScores(dimensions, options, answers) };
    }));
  } catch (err) {
    console.error('[admin/projekte/[id]] questionnaire fetch failed:', err);
    questionnaireBundles = [];
  }
}
```

Note: the closing `}` at the very top of this snippet **replaces** the existing `}` that closes the `else` branch. The structure becomes:

```
try {
  ...
  if (project) {
    if (tab === 'besprechungen') { ... }
    else { [subProjects, ...] = await Promise.all([...]); }
    // ← new questionnaire block goes here
  }
} catch (err) { ... }
```

- [ ] **Step 3: Declare `questionnaireBundles` near the other top-level lets**

The existing top-level `let` declarations are around lines 22–32. Add this declaration with them:

```typescript
let questionnaireBundles: Array<{
  assignment: any;
  questions: any[];
  options: any[];
  answers: any[];
  scores: any[];
}> = [];
```

(Using `any` here matches the loose typing pattern already in this file — see `unassignedMeetings`, lines 30. Tightening to imported types is fine but not required.)

- [ ] **Step 4: Render the panel in the default tab**

Find the `tab !== 'besprechungen'` branch in the JSX (around line 183, the line `<>` that opens the default tab content). Right **before** the `{/* ── Sub-projects ── */}` comment (line ~260), add:

```astro
<ProjectQuestionnairesPanel assignments={questionnaireBundles} />
```

This places the panel above the sub-projects list, immediately after the Edit form — natural spot for "context first, structure second".

- [ ] **Step 5: Type-check + smoke-build**

```bash
cd website && npx astro check 2>&1 | tail -20
```

Expected: no new errors related to projekte/[id].astro.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/projekte/[id].astro
git commit -m "feat(admin/projekte): show linked questionnaires inline

Adds the ProjectQuestionnairesPanel section to /admin/projekte/<id>.
Empty for projects without linked questionnaires."
```

---

## Task 4: Embed panel in `/admin/tickets/[id].astro`

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro` (frontmatter imports + fetch; render in main column after Description card)

This task can run **in parallel with Task 3** — it touches a different file but depends only on Task 2 being on disk.

- [ ] **Step 1: Add imports to the frontmatter**

In `website/src/pages/admin/tickets/[id].astro`, after the existing imports (lines 1–6), add:

```astro
import {
  listQAssignmentsForProject,
  listQQuestions,
  listQAnswerOptionsForTemplate,
  listQAnswers,
  listQDimensions,
} from '../../../lib/questionnaire-db';
import { computeScores } from '../../../lib/compute-scores';
import ProjectQuestionnairesPanel from '../../../components/admin/ProjectQuestionnairesPanel.astro';
```

- [ ] **Step 2: Fetch questionnaire bundles after `getTicketDetail`**

The existing fetch is at lines 16–19:

```typescript
const [ticket, timeline] = await Promise.all([
  getTicketDetail(BRAND, id),
  getTicketTimeline(BRAND, id),
]);

if (!ticket) return Astro.redirect('/admin/tickets');
```

After the redirect guard, add:

```typescript
let questionnaireBundles: Array<{
  assignment: any;
  questions: any[];
  options: any[];
  answers: any[];
  scores: any[];
}> = [];

// Only fetch for project-type tickets — coaching questionnaires only link to projects.
if (ticket.type === 'project') {
  try {
    const assignments = await listQAssignmentsForProject(ticket.id);
    questionnaireBundles = await Promise.all(assignments.map(async a => {
      const [questions, options, answers, dimensions] = await Promise.all([
        listQQuestions(a.template_id),
        listQAnswerOptionsForTemplate(a.template_id),
        listQAnswers(a.id),
        listQDimensions(a.template_id),
      ]);
      return { assignment: a, questions, options, answers, scores: computeScores(dimensions, options, answers) };
    }));
  } catch (err) {
    console.error('[admin/tickets/[id]] questionnaire fetch failed:', err);
    questionnaireBundles = [];
  }
}
```

The `ticket.type === 'project'` gate avoids running the JOIN query for every bug/task ticket (the FK only ever points at type='project' rows).

- [ ] **Step 3: Render the panel in the main column**

The main column structure starts at line 105 with `<div class="lg:col-span-2 space-y-6">`. The first child is the Description card (lines 108–120). Right **after** the Description card's closing `</div>`, add:

```astro
<ProjectQuestionnairesPanel assignments={questionnaireBundles} />
```

The panel sits above the children-tree / linked-tickets / timeline / attachments cards.

- [ ] **Step 4: Type-check**

```bash
cd website && npx astro check 2>&1 | tail -20
```

Expected: no new errors related to tickets/[id].astro.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/admin/tickets/[id].astro
git commit -m "feat(admin/tickets): show linked questionnaires inline

Adds ProjectQuestionnairesPanel to /admin/tickets/<id> for tickets
of type='project'. Skipped for bug/task/feature tickets — those
never have linked questionnaires."
```

---

## Task 5: Manual verification + deploy

**Files:** none (deployment + browser check)

- [ ] **Step 1: Start the dev server and verify locally**

```bash
task website:dev
```

Open `http://localhost:4321/admin/projekte/<id>` for a project that has a completed questionnaire. Confirm:

1. Section "Fragebögen (1)" appears between the project edit form and the sub-projects list.
2. Status badge says "Eingereicht" or "Besprochen" with the correct color.
3. Score bars render (if the template is scored).
4. The `<details>` opens to show questions + chosen answers.
5. "Volle Review öffnen →" link goes to `/admin/fragebogen/<assignmentId>`.
6. A project with no questionnaire shows nothing — no empty header, no "0 questionnaires" placeholder.

Then visit `http://localhost:4321/admin/tickets/<sameId>` and confirm the same panel renders in the main column.

- [ ] **Step 2: Deploy to mentolder, then korczewski**

Per the project's website-deploy workflow:

```bash
task website:deploy ENV=mentolder
task website:deploy ENV=korczewski
```

Wait for both to finish. Each rebuilds the image and rolls the website pod.

- [ ] **Step 3: Live verification**

Open `https://web.mentolder.de/admin/projekte/<id>` (the project the user just completed a questionnaire for) and confirm the new section renders with real data. Repeat for `https://web.korczewski.de/admin/projekte/<id>` if the same flow is exercised there.

- [ ] **Step 4: Commit + PR + auto-merge**

The branch already has the four feature commits. Push and open the PR:

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
gh pr create --title "feat(admin): inline questionnaire panel on project + ticket pages" --body "$(cat <<'EOF'
## Summary
- New DB helper `listQAssignmentsForProject` (filters out system-test templates).
- New shared `ProjectQuestionnairesPanel.astro` component renders title, status, score bars, coach notes, and collapsible Q&A per linked assignment.
- Embedded on `/admin/projekte/<id>` (above sub-projects) and `/admin/tickets/<id>` (after Description, only for `type='project'` tickets).

Spec: docs/superpowers/specs/2026-05-08-project-questionnaire-overview-design.md
Plan: docs/superpowers/plans/2026-05-08-project-questionnaire-overview.md

## Test plan
- [ ] Open a project with a completed questionnaire on web.mentolder.de — section renders with score bars + Q&A.
- [ ] Open the same record under /admin/tickets/<id> — panel renders.
- [ ] Open a project without a questionnaire — no section, no empty state.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --auto
```

---

## Self-review (filled in after writing the plan)

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| `listQAssignmentsForProject` helper | Task 1 |
| Filter out `is_system_test` | Task 1 (SQL `WHERE` clause) |
| Shared `ProjectQuestionnairesPanel.astro` | Task 2 |
| Empty assignments → renders nothing | Task 2 (top-level `{assignments.length > 0 && ...}`) |
| Per-status card states (pending/in_progress/submitted/reviewed/archived/dismissed) | Task 2 (`STATUS_CLS`, `STATUS_LABEL`, `showQA`, `showScores`, `isMuted`, `dismiss_reason` block) |
| Score bars reuse from review page | Task 2 (mirrored markup, same `levelColor`) |
| Embed on `/admin/projekte/<id>` | Task 3 |
| Embed on `/admin/tickets/<id>` | Task 4 |
| `type='project'` gate on tickets page | Task 4 (perf consideration from spec risks) |
| Manual E2E verification | Task 5 |
| `task website:deploy ENV=mentolder + korczewski` | Task 5 |

**Placeholder scan:** No "TBD", "TODO", "implement later". All code blocks are complete and runnable. Function/property names (`listQAssignmentsForProject`, `assignment.template_title`, `assignment.coach_notes`, `assignment.dismiss_reason`, `STATUS_CLS`, `STATUS_LABEL`, `levelColor`) are consistent across tasks.

**Type consistency:** `QAssignment`/`QQuestion`/`QAnswer` come from `questionnaire-db.ts` — Task 2 Step 2 instructs the implementer to confirm the option type's exact export name (`QOption` vs `QAnswerOption`) before relying on it, since I don't have it cached. `ScoreRow` is similarly verified in Task 2 Step 3.

**Spec gap:** None found. The "no new API routes / no schema migrations" promise from the spec is honored — every change is read-only DB + UI.
