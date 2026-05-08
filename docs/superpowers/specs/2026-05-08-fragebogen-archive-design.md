# Fragebogen Archive — Frozen KPI Datapoints

**Date:** 2026-05-08
**Status:** Draft

## Problem

Today an admin can mark a submitted Fragebogen as `reviewed` and then "Archivieren". But the workflow has three gaps:

1. The "Archivieren" button is only shown after `reviewed`, not directly on `submitted` ("Abgegeben").
2. Archived assignments still appear inline in admin views (just muted via `opacity-60`), so they aren't out of view.
3. The "Erneut durchführen" button calls `reopenQAssignment(id)` which **deletes the answers** and clears `archived_at`. After re-running, the historical datapoint is destroyed — there is no way to keep the old result and create a new one for KPI work.
4. For `is_system_test` Fragebögen, rrweb replays land in `questionnaire_test_evidence` per `(assignment_id, question_id, attempt)`, but the replay drawer (`SystemtestReplayDrawer.svelte`) is currently only mounted on `/admin/systemtest/board`. The `/admin/fragebogen/[assignmentId]` detail page does not surface the videoproof, so an archived datapoint is not inspectable end-to-end.

A coach needs to be able to (a) freeze a submitted Fragebogen as a permanent historical datapoint, (b) get it out of the active list, (c) reassign the same template to the same customer for the next datapoint without resetting the previous one, and (d) for system-test runs, see the rrweb video proof attached to the archived datapoint.

## Non-goals

- Replacing or refactoring the existing destructive `reopenQAssignment` behavior — it is still needed for systemtest retest_attempt and pre-archive resets.
- A bulk archive UI.
- Per-user customizable archive views.
- Unarchiving (i.e., turning an archived row back into `reviewed`). If a user wants to act on an archived row, they reassign — they don't unarchive.

## Approach

One archive action per assignment freezes the result into an immutable datapoint. A separate "Erneut zuweisen" action creates a brand-new assignment row for the same template+customer (+project), leaving the archived one untouched. KPI consumers read a SQL view that flattens snapshotted dimension scores per archived assignment.

### Data model

New table `questionnaire_assignment_scores` snapshots dimension scores at archive time. Without this, edits to `questionnaire_dimensions` (weights, thresholds) or `questionnaire_answer_options` would retroactively shift historical KPIs.

```sql
CREATE TABLE IF NOT EXISTS questionnaire_assignment_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
  dimension_id   UUID NOT NULL,         -- soft reference, no FK (see note)
  dimension_name TEXT NOT NULL,
  final_score    INTEGER NOT NULL,
  threshold_mid  INTEGER,
  threshold_high INTEGER,
  level          TEXT, -- 'förderlich' | 'mittel' | 'kritisch' | NULL
  snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, dimension_id)
);
CREATE INDEX IF NOT EXISTS idx_qas_assignment ON questionnaire_assignment_scores(assignment_id);
```

`dimension_id` intentionally has **no** foreign key constraint — historical snapshots must outlive template edits and deletions, and the dimension UUID is only stored for traceability. `dimension_name` is denormalized so KPI consumers don't need a join back to (possibly mutated) `questionnaire_dimensions`. `assignment_id` keeps its FK with `ON DELETE CASCADE` so deleting a customer's data wipes their snapshots cleanly. Synthetic `id` PK avoids the nullable-PK contradiction; uniqueness on `(assignment_id, dimension_id)` is what idempotency relies on.

### Video proof / rrweb evidence

The recording pipeline already exists: `questionnaire_test_evidence` (one row per `assignment_id, question_id, attempt`) holds `replay_path`, console + network logs, and recording timestamps; `SystemtestReplayDrawer.svelte` renders rrweb playbacks; `/api/admin/evidence/[id]/replay` serves the payload. The recorder boot in the portal wizard is part of the parallel system-test loop spec (`2026-05-08-systemtest-failure-loop`) and is not in scope here.

What this spec adds for the archive flow:

- **Preservation is automatic.** `questionnaire_test_evidence.assignment_id` has `ON DELETE CASCADE`, but archive never deletes the assignment row — it only mutates status. So evidence rows survive the archive transition unchanged. `archiveQAssignment` does **not** copy or move replay payloads; the archived assignment continues to point at the same evidence rows. This is intentional: replay payloads are immutable content addressed by `evidence.id`, so a snapshot would just duplicate storage.
- **Reassign creates an evidence-free new row.** The reassigned (new) assignment starts at `attempt=0` with no evidence rows. As soon as the wizard records its run (once the recorder boot lands), evidence accumulates against the new assignment id. The archived original keeps its old evidence rows untouched.
- **Surface on archive detail page.** The detail page (`/admin/fragebogen/[assignmentId].astro`) wires the existing `SystemtestReplayDrawer.svelte` into each `test_step` row that has at least one `questionnaire_test_evidence` row. Rendered as an inline "Replay ansehen" button next to the result chip; click opens the drawer with the latest-attempt evidence id. Multiple attempts: the button surfaces the highest-attempt evidence; a small `(Versuch n)` tag indicates which attempt is being replayed. The drawer itself already supports navigation across attempts. Only rendered for `is_system_test` templates with a non-empty evidence row for that question — coaching Fragebögen show no button.

A new server helper `listEvidenceByAssignment(assignmentId)` returns rows of `{ question_id, latest_evidence_id, latest_attempt, evidence_count }` aggregated per question. The detail page consumes this once at render time and threads `latest_evidence_id` into each `test_step` row. No extra round-trip per click.

### KPI view

The view consumed by KPI tooling:

```sql
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
  s.dimension_name,
  s.final_score,
  s.threshold_mid,
  s.threshold_high,
  s.level,
  ev.evidence_count,
  ev.latest_evidence_id
FROM questionnaire_assignments a
JOIN questionnaire_templates t ON t.id = a.template_id
JOIN questionnaire_assignment_scores s ON s.assignment_id = a.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int                                       AS evidence_count,
    (ARRAY_AGG(e.id ORDER BY e.attempt DESC, e.created_at DESC))[1]
                                                        AS latest_evidence_id
  FROM questionnaire_test_evidence e
  WHERE e.assignment_id = a.id
) ev ON true
WHERE a.status = 'archived';
```

The `bachelorprojekt` schema already exists per the project tracking layer (`v_timeline`); reusing it for KPI views is consistent. No view-level filtering on `is_system_test` — let consumers decide.

### Backend

New `archiveQAssignment(id)` in `website/src/lib/questionnaire-db.ts`. Single transaction:

1. `SELECT FOR UPDATE` the assignment; reject if status not in `{submitted, reviewed}` (return `{ reason: 'not_archivable', status }`); reject if not found.
2. `UPDATE` status to `archived`, set `archived_at = now()`.
3. Compute scores via the existing `computeScores(dimensions, options, answers)` helper (loaded inside the transaction from the same client).
4. `INSERT` one row per dimension into `questionnaire_assignment_scores` with `ON CONFLICT (assignment_id, dimension_id) DO NOTHING` for idempotency.
5. Return the updated `QAssignment`. `coach_notes` are preserved verbatim on the source row — they are part of the historical datapoint.

New `reassignQAssignment(id)` in the same module:

1. Load the source row (any status — `archived` is the typical case but reassign-from-reviewed can be useful too).
2. Call `createQAssignment({ customerId, templateId, projectId })` — this already exists.
3. Return the new `QAssignment`. Do not touch the source.

The existing `updateQAssignment(id, { status: 'archived' })` path is rerouted to call `archiveQAssignment` internally so that any older client (or the existing `PUT [id]` API) still produces the snapshot. The legacy `archived_at` setter branch is removed from `updateQAssignment` to keep the snapshot path single-source-of-truth.

### API endpoints

- `POST /api/admin/questionnaires/assignments/[id]/archive`
  - 200 → `{ assignment: QAssignment }` on success
  - 404 → not found
  - 409 → `{ error, status }` when status is not in `{submitted, reviewed}`
- `POST /api/admin/questionnaires/assignments/[id]/reassign`
  - 200 → `{ assignment: QAssignment, portalUrl: string }`
  - 404 → not found
  - The endpoint allows reassign from any source status because it never mutates the source row. The UI only exposes the button on `archived`. Coach notes on the source are not copied — the new assignment starts with an empty `coach_notes`.

Both gated by `isAdmin(session)` like the sibling `reopen.ts`.

### Admin UI

`website/src/pages/admin/fragebogen/[assignmentId].astro`:

- "Archivieren" button shown for `status ∈ {submitted, reviewed}` (was: only `reviewed`).
- Archive button confirms via dialog: *"Diese Auswertung als historischen Datenpunkt sichern? Werte werden eingefroren und der Fragebogen verschwindet aus den aktiven Listen."*
- For `status === 'archived'`: the destructive "Erneut durchführen ↻" button is replaced by **"Erneut zuweisen ➕"** which calls the new reassign endpoint and redirects to `portalUrl` (= `/portal/fragebogen/<newId>`).
- For `status ∈ {submitted, reviewed, dismissed}`: "Erneut durchführen" stays — destructive reopen via `/reopen` is still useful for resets and systemtest retest_attempt.
- For each `test_step` question on a system-test template that has at least one evidence row, an inline **"Replay ansehen"** button is rendered next to the result chip. Click opens `SystemtestReplayDrawer` with `latest_evidence_id`. A small `Versuch {n}` tag annotates which attempt the latest evidence belongs to.

`website/src/components/admin/ClientQuestionnairesPanel.svelte` (admin sidebar, per customer):

- Split client-side: `active = status !== 'archived'`, `archived = status === 'archived'`.
- Render only `active` by default. Below, a small text button `Archiv anzeigen ({n})` toggles `archivedVisible = true`. When toggled, render the archived rows muted (opacity-60) with the same row markup, each linking to `/admin/fragebogen/<id>`.

`website/src/components/admin/ProjectQuestionnairesPanel.astro` (project + ticket pages):

- Same split. Active list renders normally. Archived items go into a `<details>` block at the bottom: `<summary>Archivierte Fragebögen ({n}) anzeigen</summary>`. Inside, render the existing card with score bars (now sourced from snapshot, see below) and Q&A details.

For both panels, archived score bars must read from the snapshot, not recompute. Add a server-side helper `listArchivedScores(assignmentId)` that returns the snapshot rows, and route the panel rendering through a small `getDisplayScores(assignment, dimensions, options, answers)` shim that picks the snapshot when `status === 'archived'` and falls back to `computeScores(...)` otherwise.

### Tests

Unit (vitest, alongside existing `questionnaire-db` patterns):

- `archiveQAssignment` writes one score row per dimension; values match `computeScores` output at archive time; rerunning is a no-op (idempotent).
- `archiveQAssignment` rejects `pending`, `in_progress`, `dismissed` with `{ reason: 'not_archivable' }`.
- `archiveQAssignment` rolls back the status update if the score INSERT fails (transactional integrity).
- `reassignQAssignment` creates a new row with `status='pending'`, fresh `assigned_at`, no `submitted_at`/`archived_at`; source row unchanged.
- View `v_questionnaire_kpi` returns one row per `(archived assignment, dimension)`; excludes non-archived assignments. `evidence_count` matches the number of `questionnaire_test_evidence` rows for the assignment; `latest_evidence_id` is null when there is no evidence.
- Archive transition does **not** delete or duplicate `questionnaire_test_evidence` rows for the assignment.
- `listEvidenceByAssignment` returns the highest-attempt evidence row per question with the correct `evidence_count`.

API:

- `archive` endpoint: 200 on submitted/reviewed; 409 on pending/in_progress/dismissed; 404 on missing; 401 for non-admin.
- `reassign` endpoint: 200 on archived (primary path); 200 on any other source status (no validation — UI just doesn't expose the button); 404 on missing; 401 for non-admin. New row's `coach_notes` is empty.

End-to-end (Playwright, `tests/e2e/admin/`):

1. Admin assigns template T to user U.
2. User submits.
3. Admin opens detail, clicks "Archivieren", confirms.
4. Verify the assignment row no longer appears in `ClientQuestionnairesPanel` default render.
5. Toggle "Archiv anzeigen" — row visible, muted.
6. Click into archive detail → "Erneut zuweisen ➕" → redirected to portal wizard with a new id.
7. Verify DB: two rows for `(customer=U, template=T)`; original `archived_at IS NOT NULL`, `questionnaire_assignment_scores` has snapshot rows; new row `status='pending'`, `archived_at IS NULL`.
8. For a system-test seeded run with at least one evidence row inserted, repeat the archive flow and verify the archived detail page renders the "Replay ansehen" button on the corresponding test_step row, and clicking it opens `SystemtestReplayDrawer`.

## Migration

Schema changes are additive and live in `initDb()` in `questionnaire-db.ts`:

- `CREATE TABLE IF NOT EXISTS questionnaire_assignment_scores ...`
- `CREATE INDEX IF NOT EXISTS idx_qas_assignment ...`
- `CREATE OR REPLACE VIEW bachelorprojekt.v_questionnaire_kpi ...`

No backfill of existing archived rows is needed for the MVP — historical archived assignments without snapshot rows would simply not appear in the KPI view (the `JOIN` filters them out). If desired later, a one-shot backfill script in `scripts/one-shot/` can iterate existing `archived` rows and call `archiveQAssignment` (idempotent) to populate snapshots from current dimension/option state.

## Risks

- **Stale snapshot if `computeScores` logic changes:** if the scoring algorithm itself is updated post-archive, historical snapshots reflect the old algorithm. Acceptable: that's the entire point. If a future scoring algorithm change needs to apply retroactively, that's a separate one-shot recompute script.
- **Score column drift:** `level` is a string today, not an enum. Keeping it `TEXT` matches `compute-scores.ts` and avoids coupling.
- **Reassign without project_id:** if the source archive had a `project_id` that's since been deleted, `createQAssignment` will fail FK on `tickets.tickets`. The reassign helper passes `projectId` directly; if the FK fails, it surfaces as a 500 — acceptable edge case (project gone = manual fix).
