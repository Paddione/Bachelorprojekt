# Unified Ticketing & Issue Tracking — Design

**Date:** 2026-05-08
**Status:** Spec — pending implementation plan
**Scope:** Replace the four overlapping work-tracking systems on the Bachelorprojekt platform (public bug reports, thesis requirements, PR-driven feature timeline, and admin project hierarchy) with one unified ticket model.

---

## 1. Problem

Today four systems describe overlapping work:

| System | Table(s) | Purpose | Audience |
|---|---|---|---|
| Bug reports | `bugs.bug_tickets`, `bugs.bug_ticket_comments` | Public-reported issues from `/api/bug-report` | Public reporters + admin |
| Thesis requirements | `bachelorprojekt.requirements`, `pipeline`, `test_results` | Academic FA/SA/NFA/AK requirements | Internal / thesis defense |
| PR-driven features | `bachelorprojekt.features` | One row per merged PR, drives Kore homepage timeline | Public timeline + internal |
| Admin projects | `projects`, `sub_projects`, `project_tasks`, `project_attachments` | Client-facing engagements with Gantt + assignments | Admin + customer portal |

Each has its own status enum, its own admin UI, its own audit/comments capability (or none), and its own relationship to PRs. As a result:

1. **No single inbox.** A bug, a feature request, and a customer task look like three different things.
2. **Reporter notifications are broken on every close path.** `scripts/track-pr.mjs` archives bugs on PR merge with no email; `/api/admin/bugs/resolve.ts` resolves with no email; `/api/admin/inbox/[id]/action.ts` sends the close-mail to `info@<brand>` (with the reporter only in `Reply-To`). Reporters never hear back.
3. **Auto-close jumps `resolved` and goes straight to `archived`.** PR-fixed bugs vanish from the "Erledigt" filter on `/admin/bugs`.
4. **Data is thin.** Bugs lack severity, assignee, watchers, due dates, structured links, attachments, or a real audit trail.
5. **Cross-references are weak.** `bug_tickets.fixed_in_pr` is a single integer; `bachelorprojekt.features.requirement_id` is a single FK. No way to say "this bug is a duplicate of that one", "this feature blocks that task", or "this PR fixed three bugs".

## 2. Goals

- One ticket model that covers bugs, features, projects, and tasks, with a shared lifecycle and unified admin UI.
- Rich metadata per ticket: severity + priority, assignee + reporter + watchers, controlled component + free-form tags, structured ticket-to-ticket links, full audit log, generic attachments, dates + estimate + time-logged on every type.
- Single close-handler that always notifies the reporter when a ticket is closed.
- Auto-link of `reporter_email` to Keycloak users via the existing `customers` table.
- Migration that ships in five small PRs, each independently revertable, with no production downtime.

## 3. Non-Goals

- Replacing or restructuring the messaging-db threads. Notifications in v1 are email-only.
- Replacing the GitHub PR workflow itself. The webhook keeps writing `tracking/pending/<pr>.json`; only what happens after that changes.
- Estimating sprint/iteration scheduling, story-point velocity, or burndown beyond raw `estimate_minutes` / `time_logged_minutes` columns.
- Public ticket creation by customers from the portal (v1 keeps the public bug-report form as the only public entry point).

## 4. Architecture

A new `tickets` schema in the workspace `shared-db` database holds the entire model. Old tables become read-only SQL views during the migration window, then drop in PR5.

```
tickets                  ← core work-item (type ∈ bug | feature | task | project)
ticket_links             ← typed relationships (blocks, fixes, duplicate_of, …)
ticket_activity          ← immutable audit log (every field change)
ticket_comments          ← discussion (replaces bugs.bug_ticket_comments)
ticket_attachments       ← generic file refs (Nextcloud-backed; inline data_url for legacy)
ticket_watchers          ← notification subscriptions
ticket_tags              ← join table for free-form labels
tags                     ← label vocabulary
pr_events                ← PR ledger (renamed bachelorprojekt.features)
```

**Schema split rationale.** `tickets.*` is the work-plan domain — mutable, has lifecycle, owned by humans. `tickets.pr_events` is a git-history ledger — immutable, one row per merged PR, owned by the GitHub webhook. Tickets reference PRs through `ticket_links` (`kind='fixes'`). Keeping these separate means the PR ledger can never be corrupted by ticket-management actions.

**Hierarchy.** A flat tickets table with a self-referential `parent_id`. UI enforces a 3-level convention (epic / project / task) but the schema permits arbitrary depth. Cycles are prevented by trigger.

**Cross-cutting fields.**
- `brand` on every ticket (mentolder | korczewski) — same multi-brand model as today.
- `external_id` is the universal human key (`BR-YYYYMMDD-xxxx`, `FA-12`, `SA-03`, custom slug). Internal references use `id` (UUID); humans use `external_id`.
- `customer_id` is on tickets directly (nullable). Required for `type='project'` (service-layer validation).
- `thesis_tag` is a separate column for FA/SA/NFA/AK references — a feature can have both a freeform `external_id` and a thesis tag.

## 5. Data Model

```sql
CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website;

-- ── core ────────────────────────────────────────────────────────────
CREATE TABLE tickets.tickets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT        UNIQUE,
  type            TEXT        NOT NULL CHECK (type IN ('bug','feature','task','project')),
  parent_id       UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
  brand           TEXT        NOT NULL,

  title           TEXT        NOT NULL,
  description     TEXT,
  url             TEXT,
  thesis_tag      TEXT,
  component       TEXT,

  status          TEXT        NOT NULL DEFAULT 'triage'
                  CHECK (status IN ('triage','backlog','in_progress','in_review','blocked','done','archived')),
  resolution      TEXT        CHECK (resolution IN
                    ('fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete')),
  priority        TEXT        NOT NULL DEFAULT 'mittel'  CHECK (priority IN ('hoch','mittel','niedrig')),
  severity        TEXT        CHECK (severity IN ('critical','major','minor','trivial')),

  reporter_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
  reporter_email  TEXT,
  assignee_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,
  customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,

  start_date      DATE,
  due_date        DATE,
  estimate_minutes      INTEGER,
  time_logged_minutes   INTEGER NOT NULL DEFAULT 0,

  triaged_at      TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  done_at         TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT resolution_only_when_closed CHECK (
    (resolution IS NULL AND status NOT IN ('done','archived'))
    OR status IN ('done','archived')
  )
);

CREATE INDEX tickets_status_idx        ON tickets.tickets (status) WHERE status NOT IN ('done','archived');
CREATE INDEX tickets_type_brand_idx    ON tickets.tickets (type, brand);
CREATE INDEX tickets_parent_idx        ON tickets.tickets (parent_id);
CREATE INDEX tickets_assignee_idx      ON tickets.tickets (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX tickets_customer_idx      ON tickets.tickets (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX tickets_thesis_tag_idx    ON tickets.tickets (thesis_tag) WHERE thesis_tag IS NOT NULL;
CREATE INDEX tickets_external_id_idx   ON tickets.tickets (external_id);

-- ── relationships ───────────────────────────────────────────────────
CREATE TABLE tickets.ticket_links (
  id          BIGSERIAL PRIMARY KEY,
  from_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  to_id       UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN
                ('blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by')),
  pr_number   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES customers(id),
  UNIQUE (from_id, to_id, kind)
);

-- ── audit trail ─────────────────────────────────────────────────────
CREATE TABLE tickets.ticket_activity (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES customers(id),
  actor_label TEXT,
  field       TEXT NOT NULL,                           -- 'status', 'assignee_id', '_created', '_link_added', …
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_ticket_idx ON tickets.ticket_activity (ticket_id, created_at);

-- ── discussion ──────────────────────────────────────────────────────
CREATE TABLE tickets.ticket_comments (
  id           BIGSERIAL PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES customers(id),
  author_label TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'comment'
               CHECK (kind IN ('comment','status_change','system')),
  body         TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'internal'
               CHECK (visibility IN ('internal','public')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── attachments ─────────────────────────────────────────────────────
CREATE TABLE tickets.ticket_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  nc_path     TEXT,
  data_url    TEXT,
  mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size   BIGINT,
  uploaded_by UUID REFERENCES customers(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL)
);

-- ── watchers / labels ──────────────────────────────────────────────
CREATE TABLE tickets.ticket_watchers (
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE tickets.tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  color       TEXT,
  brand       TEXT
);

CREATE TABLE tickets.ticket_tags (
  ticket_id   UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tickets.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

-- ── PR ledger (renamed from bachelorprojekt.features) ──────────────
CREATE TABLE tickets.pr_events (
  pr_number    INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL,
  scope        TEXT,
  brand        TEXT,
  merged_at    TIMESTAMPTZ NOT NULL,
  merged_by    TEXT,
  status       TEXT NOT NULL DEFAULT 'shipped'
               CHECK (status IN ('planned','in_progress','shipped','reverted')),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX pr_events_merged_at_idx ON tickets.pr_events (merged_at DESC);
```

## 6. Lifecycle & Workflow

### State machine

```
                   ┌─────────► blocked ─────────┐
                   │              ▲             │
                   │              │             ▼
   triage ──► backlog ──► in_progress ──► in_review ──► done ──► archived
      │                                                   ▲
      └───────────────────────────────────────────────────┘
                                                          
   any status ──► archived (with resolution=obsolete|wontfix|duplicate)
```

- `triage` is the default for everything new. Admin must explicitly move out of triage — that's "I have looked at this".
- `blocked` is a sidetrack from `in_progress`/`in_review`; returning resumes the timer.
- `done` and `archived` require a `resolution` value (DB CHECK constraint).
- Reopen = manual reset to `backlog` (or `triage` for bugs reopened by a customer).

### Auto-set timestamps (DB trigger on UPDATE)

`triaged_at`, `started_at`, `done_at`, `archived_at` are write-once on first transition. The full transition history lives in `ticket_activity`.

### Audit log (DB trigger)

Every `UPDATE` on `tickets.tickets` writes one row per changed field into `ticket_activity` with `old_value`/`new_value` (JSONB). `actor_id` comes from a session-local `app.user_id` setting set at the start of each request. Inserts log a single `_created` row. Link/comment/attachment changes also write activity rows so the UI can render one unified timeline.

### Single transition handler

All status changes go through one server-side service:

```ts
transitionTicket(id, {
  status: 'done',
  resolution: 'fixed',
  note?: string,
  visibility?: 'internal' | 'public',
  actor: { id, label }
}): Promise<Ticket>
```

This is the **only** code allowed to write to `tickets.status`. It enforces:
- Valid source→target transition for the current status.
- Required `resolution` for done/archived.
- `triaged_at` / `started_at` / `done_at` / `archived_at` updates.
- Comment row insert (when note provided).
- **Reporter close-notification email** when transitioning to `done` (see §7).

All callers — admin UI, inbox action, `track-pr.mjs` ingest — are rewritten to call this single function. This is the structural fix for the missed-notifications bug.

### GitHub PR webhook automation

The existing `.github/workflows/track-pr.yml` keeps writing `tracking/pending/<pr>.json`. The ingest cron is rewritten to drive `transitionTicket()`:

| GitHub event | Action |
|---|---|
| PR opened | Parse title/body for `external_id` patterns; for each match, write `ticket_activity` `pr_opened` row |
| PR opened, ticket status=`backlog` | Move to `in_review`, set `assignee_id` from PR author when mappable to a customer |
| PR merged | Insert `pr_events` row; for each linked ticket, insert `ticket_links` (kind=`fixes`, pr_number=N), call `transitionTicket(id, { status: 'done', resolution: type==='bug' ? 'fixed' : 'shipped' })` |
| PR merged, ticket already `done` | Just add the `ticket_links` row (multi-PR fix) |
| PR closed unmerged | Write `ticket_activity` `pr_closed_unmerged`; if ticket was `in_review`, drop back to `in_progress` |

### Invariants

- `parent_id` cannot create a cycle (trigger walks chain on INSERT/UPDATE).
- `customer_id` is required when `type='project'` (service-layer validation; not DB CHECK because back-migrated rows may not satisfy it).
- `external_id` format is enforced by service layer per type, not by DB.
- Closing a parent does not auto-close children — UI shows a warning.
- `BR-YYYYMMDD-xxxx` IDs are minted exclusively by the public `/api/bug-report` endpoint.

## 7. Notification Model

### Email triggers

| Event | Recipients |
|---|---|
| Ticket created with `reporter_email` | reporter (confirmation) |
| Status transition to `done` or `archived` | reporter (To), `info@<brand>` (BCC), watchers + assignee (TO/CC) |
| Public comment (`visibility='public'`) added | reporter (To) |
| Internal status change | watchers + assignee only |

### Close-notification email (the bug fix)

Subject: `[<external_id>] Ihre Meldung wurde bearbeitet`

To: `reporter_email` (when set)
BCC: `info@<brand>.de` (for archive purposes)
Reply-To: `info@<brand>.de`

Body includes resolution category, optional admin note, and a link to the public status page (`/portal/tickets/<external_id>`) when v1.5 ships. Templated via the existing `website/src/lib/email.ts` helper.

### Reporter→customer auto-link

Before INSERT and on UPDATE of `reporter_email`, look up `customers.email`. If a customer exists with `keycloak_user_id IS NOT NULL`, set `reporter_id = customer.id`. Runs:
- Synchronously inside `/api/bug-report` and `transitionTicket()`.
- As an idempotent batch in PR1 migration.
- Optionally as a nightly cron to pick up newly-registered users with old anonymous reports.

### What we do NOT do in v1

- No backfill mailing for already-closed tickets that missed their notification. Fix forward only — we don't want to suddenly mail dozens of reporters about months-old tickets.

## 8. API & UI Surfaces

### Public

- `POST /api/bug-report` — unchanged signature; insert into `tickets` (type=bug, status=triage, external_id=BR-YYYYMMDD-xxxx).
- `GET /api/tickets/public/:external_id` — public status lookup. Returns `{ external_id, status, resolution?, created_at, done_at?, public_comments[] }`. No PII, no internal comments.
- `/portal/tickets/:external_id` (v1.5) — pretty page version of the above.

### Customer portal

- `/portal/tickets` — lists tickets where `reporter_id = me OR customer_id = me OR me ∈ watchers`.

### Admin

- `/admin/tickets` — single unified inbox (replaces `/admin/bugs` as primary view). Filters: type, status, component, brand, assignee, label, customer. Saved-view chips: "My open", "Triage queue", "In review", "Customer X", "Thesis FA".
- `/admin/tickets/:id` — detail view: header, description, child tree, linked tickets, activity timeline, attachments, watchers, sidebar with metadata, action bar.
- `/admin/bugs` — kept as a thin filter view (`?type=bug`) for muscle memory.
- `/admin/projekte` — kept similarly (`?type=project`); existing Gantt visualization preserved, just driven from `tickets`.
- `/admin/monitoring` BugsTab → TicketsTab.

### Internal API (`session + isAdmin`)

- `GET /api/admin/tickets` — list with filters, pagination, server-side search.
- `GET /api/admin/tickets/:id` — full detail incl. children, links, activity, comments, attachments.
- `POST /api/admin/tickets` — create.
- `PATCH /api/admin/tickets/:id` — partial update; service layer writes activity rows.
- `POST /api/admin/tickets/:id/comments` — add comment; if `visibility='public'` and `reporter_email` set, sends email.
- `POST /api/admin/tickets/:id/links` — add link.
- `POST /api/admin/tickets/:id/transition` — explicit status transition (calls `transitionTicket()`).
- `POST /api/admin/tickets/:id/attachments` — upload (Nextcloud-backed for new uploads, inline data_url for legacy).

## 9. Migration Sequence

Five PRs, each shippable on its own. Old tables become SQL views over the new schema until PR5.

### PR1 — `tickets` schema + bugs migration + close-mail fix
- Create `tickets` schema with all tables from §5; idempotent init in `website-db.ts` mirroring the existing pattern.
- Add DB triggers: cycle prevention, lifecycle timestamps, audit-log writer.
- Migrate `bugs.bug_tickets` → `tickets.tickets` (`type='bug'`, `external_id=ticket_id`, `status` mapped: `open→triage`, `resolved→done`+`fixed`, `archived→archived`+`fixed`).
- Migrate `bugs.bug_ticket_comments` → `tickets.ticket_comments` (visibility=`internal`).
- Inline screenshots → `tickets.ticket_attachments` (data_url kept).
- Reporter→customer auto-link batch.
- Add `transitionTicket()`. Rewrite `/api/admin/bugs/resolve.ts`, inbox `resolve_bug` action, and `track-pr.mjs` ingest to call it.
- Close-mail goes To: reporter, BCC: `info@<brand>`.
- `/admin/bugs` and `/admin/bugs/[id]` rewired to read/write `tickets WHERE type='bug'`. UI stays visually identical.
- `bugs.bug_tickets` becomes a SQL view so any straggling reader keeps working.
- Tests: BATS migration verification (row counts match), Playwright spec for bug-report → resolve → reporter-receives-mail.

### PR2 — features + requirements migration, PR ledger rename
- Migrate `bachelorprojekt.requirements` → `tickets.tickets` (`type='feature'`, `external_id=requirement.id`, `thesis_tag=requirement.id`, status from latest `pipeline.stage` if present, else `backlog`).
- Rename `bachelorprojekt.features` → `tickets.pr_events`; drop `requirement_id` column (replaced by `ticket_links`).
- For each old `features.requirement_id`, write a `ticket_links` row (`kind='fixes'`).
- Rebuild `bachelorprojekt.v_timeline` as a view over `tickets.pr_events` left-joined to `ticket_links` + `tickets`. Kore homepage timeline keeps rendering with the same shape (verified by `tests/e2e/specs/fa-29-tracking.spec.ts`).
- `pipeline` and `test_results` stay as historical thesis artifacts.

### PR3 — projects/sub_projects/tasks migration
- Migrate `projects` → `tickets.tickets` (`type='project'`, status mapped: `entwurf→backlog`, `wartend→blocked`, `geplant→backlog`, `aktiv→in_progress`, `erledigt→done`+`shipped`, `archiviert→archived`).
- Migrate `sub_projects` → `tickets.tickets` (`type='project'`, `parent_id=parent project`).
- Migrate `project_tasks` → `tickets.tickets` (`type='task'`, `parent_id=sub_project_id ?? project_id`).
- Migrate `project_attachments` → `tickets.ticket_attachments`.
- `/admin/projekte` and Gantt rewired to read from `tickets WHERE type='project'`.
- Old tables become views.

### PR4 — unified `/admin/tickets` UI
- New `/admin/tickets` index + `/admin/tickets/:id` detail pages.
- New admin API endpoints (§8).
- `/admin/bugs` and `/admin/projekte` kept as filtered views.
- Unified inbox: bug-specific resolve action becomes generic transition action.
- Activity-timeline component (audit log + comments + links + PR events) — single rendering path used everywhere.
- Documentation update in docs-site.

### PR5 — sunset old tables
- Confirm no readers/writers reference old tables for ≥1 week of production traffic (greppable + `pg_stat_user_tables`).
- Drop `bugs.bug_tickets` view, `bugs.bug_ticket_comments`, the `bugs` schema if empty.
- Drop `projects/sub_projects/project_tasks/project_attachments` views/tables.
- Drop `bachelorprojekt.requirements/pipeline/test_results` only if confirmed unread by thesis defense; otherwise keep as historical record.
- Final test sweep across both brands.

### Risk reduction

- Each PR is independently revertable. PR1 revert = drop `tickets` schema + re-point `/admin/bugs` reads back at `bugs.bug_tickets`; one-commit rollback.
- `task workspace:backup` before each prod deploy; the website DB is in the standard backup set.
- Old tables aren't physically dropped (only views replace them) until PR5, so rollback to "before unified system" stays possible for weeks.

## 10. Testing Strategy

- **PR1**: BATS migration verification, Playwright `bug-report → admin resolve → reporter receives mail` end-to-end. Existing bug-report E2E specs (`tests/e2e/specs/fa-admin-crm.spec.ts`) updated to assert email delivery via Mailpit.
- **PR2**: `tests/e2e/specs/fa-29-tracking.spec.ts` must keep passing unchanged; add an assertion that `v_timeline` returns the same row count as before migration.
- **PR3**: existing project-tab E2E specs must keep passing; add migration-row-count check.
- **PR4**: new E2E spec for `/admin/tickets` filters, transitions, link creation, comment posting (public + internal).
- **PR5**: full Playwright website + services groups across both brands.

## 11. Open Questions for Plan Phase

- **DB trigger language**: PL/pgSQL for the audit-log writer vs Node-side logging. Trigger keeps the audit log honest even when bypassed by raw SQL; downside is harder testability. Lean toward trigger.
- **Activity-log granularity**: log every JSONB field, or batch all fields of one UPDATE into a single row with a JSONB diff? Lean toward batch — fewer rows, easier to render.
- **Watcher email throttling**: should rapid-fire updates (5+ in 5 minutes) coalesce into a digest email? Probably yes for v1.5, not v1.
- **Permission to mint thesis tags**: should `thesis_tag` be a free-form column or constrained to a known list? Lean toward free-form with a service-layer validator that warns on unknown patterns.

These are deliberately deferred to the implementation plan — they don't affect schema or migration shape.
