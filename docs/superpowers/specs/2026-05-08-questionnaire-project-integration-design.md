# Questionnaire → Project Integration & Content Update Design

**Date:** 2026-05-08
**Author:** Patrick (with Claude)
**Replaces:** nothing — new feature
**Related:** 2026-04-29-system-test-questionnaires-rewrite-design.md (prior content spec)

## Goal

Three coordinated improvements:

1. **Content** — update the 10 system-test questionnaire templates for staleness and add two missing categories (LiveKit/Streaming, Projektmanagement), bringing the total to 12.
2. **Auto-create project on assignment** — every `questionnaire_assignments` row (coaching or system-test) automatically gets a linked `tickets.tickets` project at creation time.
3. **Review flow** — the assignment review page gains a per-question "Als Aufgabe anlegen" button (creates a ProjectTask in the linked project) and an "Archivieren" button (terminal success state after review).

## Non-Goals

- New question types, new questionnaire UI components, or schema changes beyond the FK column and status union.
- Retroactive project creation for existing assignments (project_id stays NULL for old rows — the FK is nullable).
- Migrating existing system-test assignments; existing data is unaffected.

## Architecture

### Section 1 — Content updates

#### Stale fixes in existing templates

| Template | Issue | Fix |
|---|---|---|
| ST 3 — title | "Fragebogen-Widget" in title implies a questionnaire widget; step 1 actually tests the chat widget | Rename to "Kommunikation — Chat-Widget, Inbox & E-Mail" |
| ST 2 step 6 — "Projekt anlegen" | Written before the tickets-based project system; URL/expectation partially stale | Update expected_result to reference tickets-backed project creation |
| ST 4 step 2 — "Template zuweisen" | Once project auto-creation lands, this step should also verify the project was auto-created | Add project auto-creation check to expected_result |
| ST 9 step 6 — template count | Says "alle System-Test-Templates" — count implicitly 10; will be 12 after new templates | Update expected_result to explicitly say "alle 12 Templates" after seeding |

#### New template: ST 11 — LiveKit & Streaming (~7 steps)

Covers: admin stream management page, start stream, viewer portal, RTMP ingress status, end stream (emergency), recording listing. Currently completely absent from the protocol.

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Admin-Stream-Seite öffnen | Seite lädt; Stream-Status „offline" | `/admin/stream` | admin |
| 2 | Stream starten (Start-Button) | Status wechselt auf „live"; Stream-Token generiert | `/admin/stream` | admin |
| 3 | Viewer-Portal als Testnutzer öffnen | Stream-Player sichtbar; Verbindung aufgebaut (kein Fehler) | `/portal/stream` | user |
| 4 | RTMP-Ingress-Status prüfen | Ingress-Pod läuft; RTMP-URL angezeigt | `/admin/stream` | admin |
| 5 | Stream-Aufnahmen (Recordings) auflisten | Liste lädt; vorhandene MP4-Dateien sichtbar (oder leere Liste ohne Fehler) | `/admin/stream` | admin |
| 6 | Stream beenden (End-Stream) | Status wechselt auf „offline"; Viewer-Portal zeigt „kein Stream" | `/admin/stream` | admin |
| 7 | LiveKit-Pod-Status in Monitoring prüfen | `livekit-server` Pod im Status `Running`; kein CrashLoop | `/admin/monitoring` | admin |

#### New template: ST 12 — Projektmanagement (~8 steps)

Covers: Projekte/Teilprojekte/Aufgaben/Zeiterfassung. Currently just 1 buried step in ST 2.

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Neues Projekt anlegen (mit Client) | Projekt erscheint in Liste; Pflichtfeld-Validierung serverseitig | `/admin/projekte` | admin |
| 2 | Teilprojekt zum Projekt hinzufügen | Teilprojekt erscheint im Projekt-Detail unter dem Reiter „Teilprojekte" | `/admin/projekte/<id>` | admin |
| 3 | Aufgabe direkt am Projekt anlegen | Aufgabe erscheint im Projekt-Detail; Status „Entwurf" | `/admin/projekte/<id>` | admin |
| 4 | Aufgabe als erledigt markieren | Status wechselt sofort; Aufgaben-Counter aktualisiert | `/admin/projekte/<id>` | admin |
| 5 | Zeiteintrag am Projekt erfassen | Eintrag gespeichert; Gesamtzeit aktualisiert | `/admin/projekte/<id>` | admin |
| 6 | Projekt-Status auf „Aktiv" setzen | Status-Badge aktualisiert; Projekt erscheint in aktiver Filter-Ansicht | `/admin/projekte/<id>` | admin |
| 7 | Meeting mit Projekt verknüpfen | Meeting erscheint im Projekt-Detail unter Reiter „Besprechungen" | `/admin/projekte/<id>` | admin |
| 8 | Projekt archivieren | Status „Archiviert"; Projekt aus Standard-Liste entfernt; in Archiv-Ansicht sichtbar | `/admin/projekte/<id>` | admin |

### Section 2 — Auto-create project on assignment

#### DB migration (idempotent, runs via `initDb` in `questionnaire-db.ts`)

```sql
ALTER TABLE questionnaire_assignments
  ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES tickets.tickets(id) ON DELETE SET NULL;
```

#### Logic in `createQAssignment()` — `website/src/lib/questionnaire-db.ts`

Runs in the same transaction as the assignment INSERT:

1. Fetch template title (already available from the template INSERT context or via a SELECT).
2. Fetch customer name if `customer_id` is set.
3. Insert into `tickets.tickets`:
   - `type = 'project'`
   - `brand` = `process.env.PROD_DOMAIN ?? 'localhost'` (same pattern as `resolveDomain()`)
   - `title` = for `is_system_test=true`: `<template_title>`; for coaching: `<template_title> — <customer_name>`
   - `status = 'backlog'`
   - `customer_id` = assignment's customer_id (may be NULL for system-test self-assignments)
4. Store the returned `id` as `project_id` in the assignment INSERT.

The project appears immediately in `/admin/projekte` like any manually created project.

Existing assignments are unaffected — `project_id` is nullable.

### Section 3 — Review flow enhancements

#### New status: `archived`

Add to the `AssignmentStatus` union in `questionnaire-db.ts`:

```typescript
export type AssignmentStatus =
  'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'archived' | 'dismissed';
```

Add to the DB check constraint via migration:

```sql
ALTER TABLE questionnaire_assignments
  DROP CONSTRAINT IF EXISTS questionnaire_assignments_status_check;
ALTER TABLE questionnaire_assignments
  ADD CONSTRAINT questionnaire_assignments_status_check
  CHECK (status IN ('pending','in_progress','submitted','reviewed','archived','dismissed'));
```

State machine:
```
pending → in_progress → submitted → reviewed → archived
                                  ↘ dismissed
```

`archived` = reviewed + tasks extracted + done. `dismissed` = won't review.

#### Review page additions — `website/src/pages/admin/fragebogen/[assignmentId].astro`

**1. Linked project badge** (top of page, renders if `assignment.project_id` is set):
```html
<a href="/admin/projekte/{assignment.project_id}">
  → Verknüpftes Projekt öffnen
</a>
```
No extra DB fetch — `project_id` is loaded with the assignment.

**2. "Als Aufgabe anlegen" button** — per question row, visible when status is `submitted` or `reviewed`:
- Calls `POST /api/admin/questionnaire/[assignmentId]/create-task` with `{ questionId }`.
- API handler: fetches question text + expected_result → calls `createProjectTask()` with:
  - `projectId` = assignment's `project_id`
  - `name` = question's `question_text` (truncated to 120 chars)
  - `description` = question's `test_expected_result`
  - `status` = `'entwurf'`
- Button becomes "✓ Aufgabe angelegt" (disabled) on success.
- Requires `project_id` to be set; button is hidden if NULL.

**3. "Archivieren" button** — visible when status is `reviewed`:
- Calls existing `PATCH /api/admin/questionnaire/[assignmentId]/status` with `{ status: 'archived' }`.
- Updates the status badge in place.

#### New API route

`website/src/pages/api/admin/questionnaire/[assignmentId]/create-task.ts`

- Auth: admin session required.
- Body: `{ questionId: string }`.
- Validates assignment belongs to a project (403 if `project_id` is NULL).
- Creates task via `createProjectTask()` from `website-db.ts`.
- Returns `{ taskId }`.

## File changes

| File | Action | Note |
|---|---|---|
| `website/src/lib/system-test-seed-data.ts` | Modify | Add ST 11 + ST 12; fix stale titles/expected_results |
| `website/src/lib/questionnaire-db.ts` | Modify | Add `project_id` column migration; update `createQAssignment()` to auto-create project; add `'archived'` to status union and DB constraint |
| `website/src/pages/admin/fragebogen/[assignmentId].astro` | Modify | Add project badge, "Als Aufgabe anlegen" buttons, "Archivieren" button |
| `website/src/pages/api/admin/questionnaire/[assignmentId]/create-task.ts` | Create | New API route |
| `k3d/website-schema.yaml` | Modify | Document new `project_id` column and `archived` status |

## Operational rollout

After deploy on each cluster:

```bash
# Re-seed system-test templates (adds ST 11 + ST 12, applies content fixes)
kubectl --context <env> -n workspace exec deployment/shared-db -- \
  psql -U postgres -d website -c \
  "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
kubectl --context <env> -n workspace rollout restart deploy/website
```

The `project_id` column and status constraint changes run automatically on pod startup via `initDb`.

Existing coaching assignments keep `project_id = NULL` — unaffected.

## Testing this system

End-to-end smoke test (covers the new features while using the other system tests):

1. Open `/admin/fragebogen` → assign ST 1 (Auth) template to a test client.
2. Verify `/admin/projekte` shows a new project "System-Test 1: Authentifizierung & SSO (Keycloak)".
3. In `/portal`, submit the questionnaire (or use admin self-assignment for system tests).
4. In `/admin/fragebogen/<assignmentId>`, open the review page.
5. Verify the "→ Verknüpftes Projekt öffnen" badge appears.
6. Click "Als Aufgabe anlegen" on one question → verify task appears in `/admin/projekte/<projectId>`.
7. Set assignment to `reviewed`, then click "Archivieren" → verify status badge updates.
8. Verify archived assignment appears in a "Abgeschlossen"-filtered view.

## Risks

- **System-test self-assignment customer_id**: System-test assignments don't always have a `customer_id` (they're run by the admin against themselves). The auto-created project will have `customer_id = NULL` for these — which is valid per `createProject`'s FK (nullable). The title will omit the "— <customer_name>" suffix.
- **Constraint drop/re-add**: The `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` migration pattern is safe but briefly removes the constraint. Runs in `initDb` at startup before any traffic, so acceptable.
- **Large question text as task name**: `question_text` can be long. Truncate to 120 chars in the API handler before inserting as task name.
