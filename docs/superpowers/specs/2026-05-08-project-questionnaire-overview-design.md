# Project & Ticket Overview — Questionnaire Section

**Date:** 2026-05-08
**Author:** Patrick (with Claude)
**Replaces:** nothing — extends `2026-05-08-questionnaire-project-integration-design.md`
**Related:** that prior spec wired questionnaire → project (assignment auto-creates a project, review page gets per-question actions). This spec adds the reverse direction: project → questionnaire context.

## Goal

When an admin opens `/admin/projekte/<id>` or `/admin/tickets/<id>` for a project that was auto-created from a questionnaire assignment, surface the questionnaire's questions and answers inline so the project's origin context is visible without leaving the page.

Today the link is one-way: the review page (`/admin/fragebogen/<assignmentId>`) shows the project link, but the project page knows nothing about the questionnaire.

## Non-Goals

- No write actions in the new section. "Create task / mark reviewed / archive" stay on the existing review page.
- No editing of coach notes from the project page (read-only preview).
- No retroactive linking for legacy projects whose `questionnaire_assignments.project_id` is NULL.
- No changes to the assignment data model, project data model, or API surfaces beyond one new read-only DB function.

## Architecture

### One shared component, two host pages

A single Astro component renders the section. Both host pages drop it in.

- **`website/src/components/admin/ProjectQuestionnairesPanel.astro`** (new)
- Embedded in `website/src/pages/admin/projekte/[id].astro` after the Sub-projects/Direct-tasks blocks.
- Embedded in `website/src/pages/admin/tickets/[id].astro` in the main column, after the Description card.

Same data, same rendering, in both contexts.

### Data flow

```
Page frontmatter (Astro):
  projectId
    │
    ▼
listQAssignmentsForProject(projectId)            (new helper)
    │  → QAssignment[]   (ordered by assigned_at DESC)
    │
    ▼  for each assignment in parallel:
listQQuestions(template_id)
listQAnswerOptionsForTemplate(template_id)
listQAnswers(assignment.id)
computeScores(dimensions, options, answers)      (only when scorable)
    │
    ▼
ProjectQuestionnairesPanel  (assignments enriched with q/a/scores)
    │
    ▼
For each assignment, a card:
  ┌─ Header  : <template title> · <status badge> · <date>
  ├─ Scores  : score bars per dimension (if any)
  ├─ Notes   : coach_notes preview (if non-empty)
  └─ <details> Q&A list:
       <question_text> → <answered option label> [+ details_text]
   "Volle Review öffnen" → /admin/fragebogen/<assignmentId>
```

### New DB helper

In `website/src/lib/questionnaire-db.ts`, mirroring the shape of the existing `listQAssignmentsForCustomer`:

```typescript
export async function listQAssignmentsForProject(projectId: string): Promise<QAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.status, a.coach_notes, a.assigned_at, a.submitted_at, a.reviewed_at,
            a.archived_at, a.dismissed_at, a.dismiss_reason, a.project_id
       FROM questionnaire_assignments a
       JOIN questionnaire_templates t ON t.id = a.template_id
      WHERE a.project_id = $1
      ORDER BY a.assigned_at DESC`,
    [projectId],
  );
  return r.rows;
}
```

No new API endpoint — the page does the fetch in its frontmatter.

### Component contract

`ProjectQuestionnairesPanel.astro` receives one prop:

```typescript
interface Props {
  assignments: Array<{
    id: string;
    templateTitle: string;
    status: AssignmentStatus;
    assignedAt: Date;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    coachNotes: string | null;
    questions: QQuestion[];
    options: QOption[];           // for the template
    answers: QAnswer[];           // for this assignment
    scores: ScoreRow[] | null;    // null when not scorable (e.g. system-test)
  }>;
}
```

Empty array → component renders nothing (no header, no empty state). This keeps legacy projects clean.

### Card states

| Assignment status   | Score bars | Q&A list      | Card style |
|---------------------|------------|---------------|------------|
| `pending`           | hidden     | hidden        | muted, "Wartend auf Antworten" |
| `in_progress`       | hidden     | partial (only answered questions) | normal |
| `submitted`         | shown      | full          | normal |
| `reviewed`          | shown      | full          | normal, ✓ badge |
| `archived`          | shown      | full, collapsed by default | muted |
| `dismissed`         | hidden     | hidden        | muted, "Verworfen: <dismiss_reason>" |

### Excluded: system-test templates

Assignments where `templates.is_system_test = true` aren't shown. They aren't project-context — they're QA runs against the platform. The `listQAssignmentsForProject` query filters via `AND t.is_system_test = false`.

### Reuse of existing renderers

Score bars and the answered-option lookup logic are lifted from the existing review page (`/admin/fragebogen/[assignmentId].astro`) so the panel matches what the user already sees on the full review. Where the rendering is non-trivial (score bars, option-key → label resolution), the helper is extracted into a small shared `.astro` partial so both pages render identically.

## File changes

| File | Action | Note |
|---|---|---|
| `website/src/lib/questionnaire-db.ts` | Modify | Add `listQAssignmentsForProject(projectId)`. Reuses existing field shape. |
| `website/src/components/admin/ProjectQuestionnairesPanel.astro` | Create | Shared section component. |
| `website/src/pages/admin/projekte/[id].astro` | Modify | Frontmatter: fetch assignments + per-assignment q/a/scores. Render panel after existing sections. |
| `website/src/pages/admin/tickets/[id].astro` | Modify | Same fetch + render in main column. |

No schema migrations. No new API routes. No portal-side changes.

## Operational rollout

Plain code change. After merge:

```bash
task feature:website
```

No DB migration, no kubectl steps. The new query reads existing rows.

## Testing

### Unit (BATS / vitest if available)

- `listQAssignmentsForProject` — given a seeded project_id with two assignments (one coaching, one system-test), returns only the coaching one in `assigned_at DESC` order.

### E2E (Playwright)

Add to the existing questionnaire test group:

1. Admin assigns a coaching template to a customer → verify project auto-created.
2. Portal user submits the questionnaire end-to-end.
3. Admin opens `/admin/projekte/<projectId>` → assert:
   - Card with template title is visible.
   - Score bars rendered.
   - Expanded `<details>` shows each question text and the chosen option label.
   - "Volle Review öffnen" link points at `/admin/fragebogen/<assignmentId>`.
4. Same admin opens `/admin/tickets/<projectId>` → assert the same panel renders.
5. Project with no questionnaire (manually created) → panel does not render.

## Risks

- **Per-assignment fetch fan-out.** Each assignment triggers 4 queries (`listQQuestions`, `listQAnswerOptionsForTemplate`, `listQAnswers`, `computeScores`). For a typical project (1 coaching questionnaire) that's 5 queries total — no concern. If a future workflow attaches many follow-up questionnaires to one project, the page load grows linearly. Acceptable until a project routinely exceeds ~10 assignments; revisit if that happens.
- **Long question/answer text.** Q&A rendering uses `whitespace-pre-wrap` inside `<details>`, so the section can grow tall. The default-collapsed `<details>` mitigates first-paint length.
- **Tickets-page layout fit.** The ticket detail page main column is narrower (`lg:col-span-2` of 3). The panel must read well at that width — same Tailwind primitives as the project page section, but the inner Q&A table should stack on narrow viewports rather than overflow.
