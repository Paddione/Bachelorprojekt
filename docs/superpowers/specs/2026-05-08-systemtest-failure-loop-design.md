# System Test Failure Loop — Design

**Status**: Draft (awaiting review)
**Date**: 2026-05-08
**Owner**: Patrick
**Related**:
- `2026-04-29-system-test-questionnaires-rewrite-design.md` (existing system-test feature)
- `2026-05-08-questionnaire-project-integration-design.md` (project↔questionnaire link)
- `2026-05-08-unified-ticketing-design.md` (ticket schema)
- `2026-04-27-monitoring-redesign.md` (current `/admin/monitoring` page)

## 1. Problem

System test questionnaires (`questionnaire_templates.is_system_test=true`) and bug tickets
(`tickets.tickets`) live in the same database but are deliberately disconnected. The current code
filters system tests out of the project↔ticket linkage in `website/src/lib/questionnaire-db.ts:502`
(`AND COALESCE(t.is_system_test, false) = false`). Result:

1. A failed step writes `nicht_erfüllt` to `questionnaire_test_status.last_result` and a free-text
   note in `details_text`, but creates no ticket. The failure is invisible to anyone working from
   `/admin/tickets`.
2. There is no visual evidence — no screenshot, no replay, no console log — so a tester reporting
   "didn't work" gives the developer nothing to act on.
3. Many steps require seeded data (test user, test booking, test project) that the tester has to
   produce manually. This friction repeatedly stalls test runs.
4. There is no closed loop. Even if a developer fixes the issue, nothing schedules a re-test, and
   nothing tells the admin "this was retested and passes now."
5. The admin/Claude has no kanban-style overview of "what's failing, what's being fixed, what's
   green again."

The user's stated goal: **"visually trace failing tests, derive doings from them, monitor their
completion and reissue the tests until they come back flawless."**

## 2. Goals & non-goals

### In scope
- Per-step seed button on `/admin/fragebogen` that creates required test fixtures + a single-use
  magic-login link for a test user matching the step's `test_role`.
- Full session video capture (rrweb-style) on every system-test run, attached to evidence rows
  and surfaced from the failure ticket.
- Auto-create a `tickets.tickets` row of `type='bug'` when a system-test step is marked
  `nicht_erfüllt`. Carry back-references so the ticket links to its originating assignment + step.
- DB-level trigger that re-queues the failed step for retest when the linked ticket's
  `resolution` flips to `'fixed'`. Reconciler safety net for any out-of-band updates.
- A failure-kanban at `/admin/systemtest/board` with four columns: Open → Fix in PR → Retest
  pending → Green (last 7 days). One card per failed step.
- Auto-purge of seeded fixtures 24 h after the assignment is closed
  (`submitted | reviewed | archived | dismissed`). Fixtures are tagged `is_test_data=true` and
  every page-level read filters them out as defense-in-depth.

### Not in scope
- Replacing the existing system-test rewrite (covered by `2026-04-29-system-test-questionnaires-rewrite-design.md`).
- Changing the project↔questionnaire integration for coaching (covered by
  `2026-05-08-questionnaire-project-integration-design.md`). System tests stay segregated from
  *coaching project* tickets; the new linkage is system-test↔*bug* ticket only.
- Aggregate flake/health analytics (e.g. "step Q12 fails 4× per month"). Future iteration.
- Replacing the existing `/admin/monitoring` page. The new `/admin/systemtest/board` is additive.
- Cross-environment test orchestration. The loop runs entirely on whichever cluster the assignment
  was created on (mentolder or korczewski).

## 3. Architecture choice

Three options were considered; **A. Extend-in-place** was selected.

| Option | Summary | Verdict |
|---|---|---|
| **A. Extend-in-place** | Add columns + 3 new tables. Reuse existing questionnaire + ticket primitives. Kanban is a live SQL view. | **Selected** — minimal blast radius, no schema duplication. |
| B. Bolt-on parallel | New `systemtest_*` tables + UI separate from the questionnaire stack. | Rejected — would reimplement ~60 % of the questionnaire surface for marginal isolation gain. |
| C. Event-sourced | Single `systemtest_events` log; current state derived as a projection. | Rejected — overkill for the volume (handful of runs per week). |

## 4. Data model

### 4.1 Existing tables — additions

```sql
ALTER TABLE questionnaire_test_status
  ADD COLUMN evidence_id            UUID REFERENCES questionnaire_test_evidence(id),
  ADD COLUMN last_failure_ticket_id UUID REFERENCES tickets.tickets(id),
  ADD COLUMN retest_pending_at      TIMESTAMPTZ,
  ADD COLUMN retest_attempt         INT NOT NULL DEFAULT 0;

ALTER TABLE tickets.tickets
  ADD COLUMN source_test_assignment_id UUID REFERENCES questionnaire_assignments(id),
  ADD COLUMN source_test_question_id   UUID REFERENCES questionnaire_questions(id);
```

### 4.2 New tables

```sql
CREATE TABLE questionnaire_test_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questionnaire_questions(id),
  attempt         INT  NOT NULL DEFAULT 0,
  replay_path     TEXT,                -- PVC path: /var/evidence/<assignment>/<question>/<attempt>.rrweb
  partial         BOOLEAN NOT NULL DEFAULT false,
  console_log     JSONB,
  network_log     JSONB,
  recorded_from   TIMESTAMPTZ,
  recorded_to     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_evidence_assignment_question ON questionnaire_test_evidence(assignment_id, question_id, attempt);

CREATE TABLE questionnaire_test_seed_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
  question_id  UUID REFERENCES questionnaire_questions(id) ON DELETE CASCADE, -- NULL = template-level fallback
  seed_module  TEXT NOT NULL
);
-- Nullable question_id can't sit in a composite PK, so enforce uniqueness by COALESCE:
CREATE UNIQUE INDEX uq_seed_registry_scope
  ON questionnaire_test_seed_registry (template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE questionnaire_test_fixtures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questionnaire_questions(id),
  attempt       INT  NOT NULL,
  table_name    TEXT NOT NULL,
  row_id        UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  purged_at     TIMESTAMPTZ,
  purge_error   TEXT
);
CREATE INDEX ix_fixtures_unpurged ON questionnaire_test_fixtures(assignment_id) WHERE purged_at IS NULL;

CREATE TABLE systemtest_failure_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL,
  question_id   UUID NOT NULL,
  attempt       INT NOT NULL,
  last_error    TEXT,
  retry_count   INT NOT NULL DEFAULT 0,
  retry_after   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 `is_test_data` defense-in-depth

Every table where seeds may write rows gains a `BOOLEAN is_test_data NOT NULL DEFAULT false`
column. Initial set: `auth.users`, `bookings.bookings`, `tickets.tickets`,
`questionnaire_assignments`, `coaching_projects`, plus any others discovered during seed-module
implementation. A shared SQL helper `excludeTestData()` in
`website/src/lib/db/filters.ts` is used by every prod-facing read query (timeline, billing,
dashboards, public homepage). PR review enforces the helper is used; a follow-up task wires a
lint rule for new top-level pages.

### 4.4 Failure-board view

```sql
CREATE OR REPLACE VIEW v_systemtest_failure_board AS
SELECT
  qts.assignment_id,
  qts.question_id,
  qts.last_result,
  qts.last_result_at,
  qts.retest_pending_at,
  qts.retest_attempt,
  qts.evidence_id,
  qts.last_failure_ticket_id,
  t.id              AS ticket_id,
  t.external_id     AS ticket_external_id,
  t.status          AS ticket_status,
  t.resolution      AS ticket_resolution,
  fix_links.pr_number,
  pr.merged_at      AS pr_merged_at,
  CASE
    WHEN qts.last_result = 'erfüllt'
         AND qts.last_result_at >= now() - INTERVAL '7 days'
         THEN 'green'
    WHEN qts.retest_pending_at IS NOT NULL
         THEN 'retest_pending'
    WHEN fix_links.pr_number IS NOT NULL AND pr.merged_at IS NULL
         THEN 'fix_in_pr'
    WHEN t.id IS NOT NULL
         THEN 'open'
    ELSE NULL
  END AS column_key
FROM questionnaire_test_status qts
LEFT JOIN tickets.tickets t ON t.id = qts.last_failure_ticket_id
LEFT JOIN LATERAL (
  SELECT pr_number FROM tickets.ticket_links
  WHERE from_id = t.id AND kind IN ('fixes','fixed_by') AND pr_number IS NOT NULL
  ORDER BY pr_number DESC LIMIT 1
) fix_links ON true
LEFT JOIN tickets.pr_events pr ON pr.pr_number = fix_links.pr_number
WHERE qts.last_failure_ticket_id IS NOT NULL;  -- only steps that have ever produced a failure
```

A step that has only ever passed is not part of the failure board; the `WHERE` clause keeps it out.
A step that failed → was fixed → passed appears under `green` for 7 days because its
`last_failure_ticket_id` is still set (we never clear it — it's the historical link to *which*
failure was resolved).

## 5. Components

### 5.1 Seed registry — `website/src/lib/systemtest-seeds/`

Per-feature TS modules. Each exports
```ts
export default async function seed(ctx: SeedContext): Promise<SeedResult> {
  /* mints test users + DB rows, returns { magicLink, fixtures, testUser } */
}
```
where `ctx` provides `{ assignmentId, questionId, attempt, role, db, keycloakAdmin, track }`. The
`ctx.track(table, id)` helper sets `is_test_data=true` on the row AND records it in
`questionnaire_test_fixtures`. Initial set (created alongside this spec):

- `auth-only.ts` — just a Keycloak user with the requested role.
- `booking-flow.ts` — auth + a draft booking.
- `coaching-project.ts` — auth + project ticket + initial questionnaire assignment.
- `livestream-viewer.ts` — auth + a live-stream room invitation.

New modules added as new system-test templates need them.

### 5.2 Magic-link minter — `website/src/lib/auth/magic-link.ts` + `POST /api/admin/systemtest/seed`

Endpoint: `POST /api/admin/systemtest/seed { assignmentId, questionId, reuseFixtures?: bool }`.
Lookup by `(template_id, question_id)` falling back to template-level. Runs the seed module,
mints a token via Keycloak's `actionToken` API (preferred) or homegrown `auth.magic_tokens`
table if Keycloak action-tokens prove unsuitable. TTL 5 min, single-use, single-redirect.

The `/api/auth/magic?token=…` route validates + consumes the token, sets the session cookie,
302s to the question's `test_function_url`. If the token is expired, renders a small page with
a single `[Reissue magic link]` button that re-calls `seed` with `reuseFixtures=true` so we
don't recreate users.

### 5.3 rrweb capture — `website/src/lib/systemtest/recorder.ts` + `POST /api/admin/evidence/upload`

Loaded only on `/admin/fragebogen/[assignmentId]` when `template.is_system_test=true`. Records
on page load. Chunks flush every 30 s and on `mark step result`. Console.error/warn and
fetch/XHR interceptors feed the `console_log` and `network_log` columns. Buffer up to 10 MB
in memory; on upload failure retries with exponential backoff (5 s, 15 s, 45 s). On
`pagehide`/`beforeunload`, flushes via `navigator.sendBeacon`. If chunks remain unsent at
finalize, the evidence row is created with `partial=true`.

For Claude-driven runs over the Chrome MCP extension, the recorder is identical because the
page is identical.

### 5.4 Failure-bridge — `website/src/lib/systemtest/failure-bridge.ts`

Hooked into the existing answer-saving path in `website/src/lib/questionnaire-db.ts`. When that
function writes `last_result='nicht_erfüllt'` for a system-test step:
1. Recorder finalizes → `questionnaire_test_evidence` row.
2. `openFailureTicket(assignmentId, questionId, evidenceId)` composes a ticket:
   - `type='bug'`, `severity` defaults to `'major'` (admin can adjust).
   - `title`: `"Systemtest: {template_title} — Q{position}: {question_text_truncated}"`
   - `description`: question's `test_expected_result`, the tester's `details_text`, an absolute
     URL to the rrweb replay (`/api/admin/evidence/<id>/replay`), formatted console log and a
     link to the original assignment + step.
   - `source_test_assignment_id`, `source_test_question_id` populated.
3. The ticket id is written back onto `questionnaire_test_status.last_failure_ticket_id`.

If any step in (2)–(3) fails, the answer-save still commits (the grade is the priority) and the
failure goes into `systemtest_failure_outbox`. The retry worker runs as part of the
`systemtest-cleanup` CronJob (every 5 min for outbox draining, hourly for fixture purge — the
CronJob takes a `--mode` flag), max 12 retries per row (1 h window). After exhaustion, an admin
banner appears on the kanban.

### 5.5 Retest trigger + reconciler

Postgres trigger:
```sql
CREATE OR REPLACE FUNCTION trg_systemtest_retest() RETURNS trigger AS $$
BEGIN
  IF NEW.resolution = 'fixed'
     AND (OLD.resolution IS DISTINCT FROM 'fixed')
     AND NEW.source_test_assignment_id IS NOT NULL THEN
    UPDATE questionnaire_test_status
       SET retest_pending_at = now(),
           retest_attempt    = retest_attempt + 1
     WHERE assignment_id = NEW.source_test_assignment_id
       AND question_id   = NEW.source_test_question_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_resolution_retest
  AFTER UPDATE OF resolution ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION trg_systemtest_retest();
```

Reconciler (every 5 min, part of `systemtest-cleanup` cron): finds rows where
`tickets.tickets.resolution='fixed'` and `source_test_*` set but the matching
`questionnaire_test_status.retest_pending_at IS NULL`, and patches them up.

`resolution='wontfix'` and `'duplicate'` do NOT trigger retest. The kanban shows the card under
`Green` with a "won't retest" badge.

### 5.6 Failure kanban — `website/src/pages/admin/systemtest/board.astro` + `GET /api/admin/systemtest/board`

Reads from `v_systemtest_failure_board`. Four columns: Open, Fix in PR, Retest pending, Green
(7 days). Each card: question text, template, tester, age, ticket external id, replay-watch
button. Click → drawer with rrweb player, console log tail, network log, ticket detail link.

The page polls `GET /api/admin/systemtest/board` every 30 s for fresh data (no WebSocket
infrastructure for v1; the failure volume is low enough that polling is fine). The endpoint
returns the view rows grouped by `column_key` plus the count of unticketed failures from
`systemtest_failure_outbox` (used for the admin banner).

### 5.7 Cleanup cron — `systemtest-cleanup` CronJob (hourly)

For each `questionnaire_assignments` row in status `submitted | reviewed | archived | dismissed`
older than 24 h, iterate `questionnaire_test_fixtures` rows where `purged_at IS NULL` and
`DELETE FROM <table_name> WHERE id = <row_id> AND is_test_data = true`. Mark `purged_at = now()`
on success, or set `purge_error` on failure (kept for next retry). Keycloak test users deleted
via admin API in the same job. Idempotent.

## 6. Tester-facing copy

System-test templates ship with default `instructions` text instructing testers (human or AI)
to be liberal with reporting:

> **Wenn dir etwas auffällt — auch nur tangential — schreib es auf.**
> Verwirrung ist Signal. Lieber eine geschwätzige `teilweise`-Notiz mit Fragezeichen als ein
> sauberes `erfüllt`, das einen echten Defekt versteckt.
>
> **AI-Tester**: dasselbe gilt für dich. Wenn etwas anders aussieht als erwartet, das Testskript
> es aber nicht abdeckt, dokumentiere es im Notizfeld. Wenn dich eine Fehlermeldung verwirrt,
> beschreibe was verwirrend war. Halte dich nicht zurück.

A sticky panel at the top of `/admin/fragebogen/<aid>` repeats this for system-test templates.

## 7. Data flow

```
1. Tester opens /admin/fragebogen/<aid>
   └─ rrweb recorder starts; chunks flush every 30 s
   └─ template.is_system_test=true → "Tester guidance" sticky panel renders

2. Tester reaches Qn → clicks [Seed test data]
   └─ POST /api/admin/systemtest/seed { assignmentId, questionId }
   └─ Server resolves seed_module via questionnaire_test_seed_registry
   └─ Module runs in a single PG tx, Keycloak last (irreversible step)
   └─ Each row tagged is_test_data=true and logged in questionnaire_test_fixtures
   └─ Magic-link token minted (TTL 5 min, single-use)
   └─ Response: { magicLink, fixturesSummary, testUserEmail }

3. Frontend opens new tab → magicLink → /api/auth/magic?token=…
   └─ Token validated + consumed; session cookie set
   └─ 302 → question.test_function_url

4. Tester exercises the feature
   └─ rrweb keeps recording in the original /admin/fragebogen tab
   └─ Console + network interceptors collect errors + last 20 reqs

5. Tester returns to original tab, marks Qn = nicht_erfüllt + notes
   └─ POST /api/admin/questionnaires/answer (existing endpoint)
   └─ Inside save: last_result='nicht_erfüllt' detected →
        a. Recorder.flush() → questionnaire_test_evidence row created
        b. openFailureTicket() composes tickets.tickets row
        c. questionnaire_test_status updated with evidence_id +
           last_failure_ticket_id
   └─ On any error in (b)–(c): row added to systemtest_failure_outbox

6. /admin/systemtest/board shows the new card in column 'Open'

7. Developer reads ticket, links a PR via existing ticket_links flow
   └─ Card moves to 'Fix in PR'

8. PR merges → tracking-import sets pr_events.merged_at
   └─ Card stays in 'Fix in PR' until ticket.resolution flips

9. Admin/Claude verifies the PR addresses the failure → marks
   ticket.resolution='fixed'
   └─ DB trigger fires:
        questionnaire_test_status.retest_pending_at = now()
        retest_attempt += 1
   └─ Card moves to 'Retest pending'

10. Tester reopens /admin/fragebogen/<aid>
    └─ UI prompts: "Qn needs retest — original failure resolved by #1234"
    └─ [Seed test data] now mints fresh fixtures + fresh magic link with attempt=2
    └─ rrweb recording for attempt=2 (new evidence row)

11. Tester marks Qn = erfüllt
    └─ questionnaire_test_status appended with last_result='erfüllt',
       last_success_at=now(), retest_pending_at=NULL
    └─ Card moves to 'Green' for 7 days then drops off the board

If retest fails again at step 11:
    → new failure ticket auto-created (does NOT link to the old one;
      having two tickets makes the false-fix visible).
    → kanban shows both cards; the original is in 'Green' until 7-day tail expires.
```

## 8. Error handling

| Failure | Behavior |
|---|---|
| Seed step fails (Keycloak unreachable, DB error) | Fail-closed. Single PG tx, Keycloak last. On error: rollback + tester sees explicit toast `"Seed failed at Keycloak step. No magic link issued."`. Any orphan `is_test_data=true` rows from a partial commit get swept by the cleanup cron. |
| Magic link expired before redeem | `/api/auth/magic` renders a page with `[Reissue magic link]`. Reissue calls seed with `reuseFixtures=true`. |
| rrweb upload fails mid-run | Fail-open. 10 MB in-memory buffer + exponential-backoff retry (5 s, 15 s, 45 s). `pagehide` flush via `sendBeacon`. If still missing at finalize, `partial=true` on evidence row. PVC > 85 % full triggers Prometheus alert. |
| Failure-bridge can't create ticket | Fail-open with retry. Answer-save commits (grade is priority); error → `systemtest_failure_outbox`. Worker retries every 5 min, max 12 retries. After exhaustion, kanban admin banner. |
| DB trigger missed (direct UPDATE bypass) | Reconciler in cleanup cron checks for `resolution='fixed' AND source_test_*` rows where `retest_pending_at IS NULL` and patches them up. Trigger = fast path; reconciler = safety net. |
| Cleanup cron hits FK violation | Fail-soft per row. Each delete is its own statement; FK error logged in `purge_error`, retried next run. Resolution: every seed module must `ctx.track()` every dependent row. Add `ON DELETE CASCADE` to FKs from `is_test_data` rows where safe. |
| Tester closes browser mid-recording | `sendBeacon` on `pagehide`/`beforeunload`. If even that fails, partial replay marked next assignment open. The half-recorded session is still useful. |
| Two testers open same assignment | Existing assignment-locking unchanged. Recorder uses `(assignment, question, attempt)` keys; worst case two evidence rows for same attempt; kanban shows the most recent + indicator. |
| `is_test_data` flag leaks downstream | `excludeTestData()` SQL helper used by every prod-facing read. PR review enforced; lint rule follow-up. |

## 9. Testing

| Layer | Location | What it covers |
|---|---|---|
| Unit — seed modules | `tests/unit/systemtest-seeds/` | Each module runs against a disposable PG schema. Asserts `is_test_data=true` on every row, every row in `questionnaire_test_fixtures`, Keycloak admin called with right role (HTTP-mocked). |
| Unit — bridge + trigger | `tests/unit/systemtest-bridge/` | `nicht_erfüllt` → ticket exists with correct back-refs. `resolution='fixed'` → `retest_pending_at` set, `attempt` incremented. `wontfix` → no retest. Direct UPDATE → reconciler picks up. |
| Integration — full loop | `tests/integration/systemtest-loop.bats` | End-to-end against k3d: seed template → API call sequence → ticket → resolution=fixed → retest pending → seed attempt=2 → erfüllt → kanban green. |
| E2E Playwright | New test ID `FA-30` | Real browser: load `/admin/fragebogen/<aid>` → seed → assert new tab → fail mark → ticket card on `/admin/systemtest/board` → rrweb playback verified. |
| Cleanup cron | `tests/unit/systemtest-cleanup/` | Mixed-state fixtures → run cleanup → only > 24 h archived gone; idempotent re-run. |

Manual checklist for first deploy (one-off, lives in this spec, not CI):
- Verify magic-link redeem works in incognito + non-incognito.
- Verify rrweb playback renders 5-min recording without lag.
- Verify cleanup cron purges a known fixture.
- Verify a real failed run produces a ticket visible in `/admin/tickets` AND kanban.

## 10. Migration & rollout

**Order of operations (single PR per phase, all squash-merged):**

1. Schema migration: new tables, column additions, view, trigger.
2. `is_test_data` column added to in-scope tables; backfill `false`; `excludeTestData()` helper
   wired into existing top-level reads.
3. Recorder + evidence upload endpoint (no UI surface yet — verify it records cleanly first).
4. Seed registry + endpoint + 4 initial seed modules. `[Seed]` button hidden behind a feature
   flag.
5. Failure-bridge + outbox worker. Tested by manually marking a step `nicht_erfüllt` with the
   feature flag on.
6. Retest trigger + reconciler.
7. Failure kanban page.
8. Cleanup CronJob deployed.
9. Feature flag flipped on for both prod environments.

**Rollback**: each phase is independently revertable. The flag covers UI surfaces. Schema
additions are non-breaking (all new columns nullable, all new tables empty). The trigger is
removable in one statement.

## 11. Open questions for review

- Magic-link via Keycloak `actionToken` vs homegrown `auth.magic_tokens` table — to be decided
  during phase 4 implementation. Keycloak's action-token API constraints (TTL minimums, reuse
  semantics) need a concrete check.
- Whether the "Green" tail length on the kanban should be 7 days or configurable per template.
  Defaulting to 7 days for v1.
- Whether retest reissue should also reset `details_text` for the question or preserve the
  failure notes. Defaulting to **preserve** (failure history is more useful than a clean slate).
