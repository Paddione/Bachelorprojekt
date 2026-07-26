---
title: "t002196-website-api-status — Implementation Plan"
ticket_id: T002196
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002196-website-api-status — Implementation Plan

_Ticket: T002196_

## File Structure

```
website/src/pages/api/status.ts                                   # rate-limit review/fix
tests/e2e/specs/fa-26-bug-report-form.spec.ts                      # invert markerAvailable() skip condition
website/src/pages/api/booking.ts                                   # isSlotInAnyWindow 409 path
website/src/lib/website-db.ts                                      # isSlotInAnyWindow (if root cause is here)
website/src/pages/api/meeting/finalize.ts                          # finalize pipeline 200 path
website/src/pages/admin/clients.astro                              # 403-without-auth gate
website/src/middleware.ts                                          # admin auth middleware, if the gate lives there
website/src/pages/admin/knowledge/snippets/[id]/publish.astro       # missing-snippet graceful handling
tests/spec/website-interfaces.bats                                 # regression coverage for the above
```

<!-- vitest: kein neuer Test nötig — Regressionsschutz erfolgt über die
     bereits zitierten Playwright-E2E-Specs (fa-07/fa-16/fa-20/fa-26/
     fa-admin-db-crud-clients/fa-coaching-publish) plus die neuen BATS-
     Fälle in tests/spec/website-interfaces.bats; keine der betroffenen
     lib/api-Dateien bekommt isolierte Unit-Logik, die ein Vitest-Case
     rechtfertigt, den die E2E/BATS-Abdeckung nicht schon abdeckt. -->


## Verify (RED → GREEN)

- [ ] **Live-Reproduktion zuerst (RED).** Vor jedem Fix: reproduziere
      alle 7 Testfälle live gegen `https://web.mentolder.de` mit dem
      Ticket-Repro-Kommando, um die tatsächlichen (nicht nur
      vermuteten) Ist-Status-Codes zu protokollieren:

```bash
cd tests/e2e && SKIP_DB_PURGE=1 WEBSITE_URL=https://web.mentolder.de \
  ./node_modules/.bin/playwright test \
  specs/fa-07-search.spec.ts specs/fa-16-booking.spec.ts \
  specs/fa-20-finalize.spec.ts specs/fa-26-bug-report-form.spec.ts \
  specs/fa-admin-db-crud-clients.spec.ts specs/fa-coaching-publish.spec.ts \
  --project=website
# expected: FAIL — confirms which of the 7 assertions are currently red
# and with which actual status code, before touching any handler.
```

- [ ] **Task 1 (fa-07 T4 + fa-26 status): `/api/status` rate-limit shared-cause check.**
      `website/src/pages/api/status.ts` keeps a module-level
      `rateLimitMap` keyed by IP shared across every request to this
      route in the process, regardless of which spec triggered it.
      Confirm whether the full nightly E2E suite (not just these 6
      specs) pushes any single runner IP over the 10-req/min budget
      before these two assertions run, and whether that flips the
      response from the expected `404`/`[200,404]` to `429`.
      - Expected (fa-07 T4): status in `[404, 200]` per current test
        file.
      - Expected (fa-26 status check): status in `[200, 404]` per
        current test file.
      - Actual: to be captured by the Live-Reproduktion step above; if
        the observed status is `429` for either, this task is confirmed
        as (partial) root cause.
      - Fix (if confirmed): scope the rate-limit key/budget so E2E
        traffic against unrelated endpoints cannot exhaust the
        `/api/status`-specific budget for a legitimate follow-up
        request, or exempt marked E2E traffic
        (`isE2ETestRequest`/`CRON_SECRET` marker) from this limiter the
        same way other form endpoints already do.
      - **BATS test:** `tests/spec/website-interfaces.bats` — add a
        case asserting `/api/status` 404 behavior is independent of
        prior request volume against unrelated endpoints. Must FAIL
        against current `status.ts` if the shared-budget bug is real,
        then PASS after the fix.

- [ ] **Task 2 (fa-26 bug-report valid-data 200): fix inverted E2E skip condition.**
      `tests/e2e/specs/fa-26-bug-report-form.spec.ts` line ~39 currently
      reads `test.skip(markerAvailable(), 'CRON_SECRET vorhanden — Test
      wird in Produktion übersprungen')` — this skips the test when
      `CRON_SECRET` **is** set, the opposite of the stated intent (skip
      when the marker is **unavailable**, so unmarked test data is
      never written to the prod inbox). Invert to
      `test.skip(!markerAvailable(), ...)`.
      - Expected: `POST /api/bug-report` with valid multipart data
        returns `200` with `{ success: true, ticketId: /^T\d+$/ }` when
        `CRON_SECRET` is set (test now actually executes instead of
        being silently skipped).
      - Actual (current): the test is skipped whenever `CRON_SECRET` is
        present (the normal prod-CI case), so the `200`/`ticketId`
        assertion is never exercised — masking any real regression in
        `bug-report.ts` until this is fixed.
      - This is a **test-file bug**, not an API-handler bug — tracked
        as its own task so review can distinguish a test fix from a
        production-code fix.
      - **Verification:** re-run the spec against a
        `CRON_SECRET`-bearing environment and confirm the test now
        executes (not skipped) and passes; if it still fails after the
        invert, that reveals a genuine `bug-report.ts` regression to
        fix as a follow-up within this same task.

- [ ] **Task 3 (fa-16 T6): booking 409 for non-whitelisted slot.**
      `website/src/pages/api/booking.ts` returns `409` only when
      `isSlotInAnyWindow(BRAND, slotStart, slotEnd)` (see
      `website/src/lib/website-db.ts`) returns `false`. Diagnose why a
      slot dated `2020-01-01` (far in the past, guaranteed outside every
      admin-configured window) is not rejected — check whether
      `isSlotInAnyWindow` throws (caught by the outer `try/catch`,
      producing `500` instead of `409`) or incorrectly returns `true`
      for out-of-range dates.
      - Expected: `409` with `error` containing "verfügbar".
      - Actual: to be captured by the Live-Reproduktion step (likely
        `200` if the window check is bypassed, or `500` if it throws).
      - **BATS test:** `tests/spec/website-interfaces.bats` — case
        covering `isSlotInAnyWindow` with a date guaranteed to fall
        outside any seeded window.

- [ ] **Task 4 (fa-20 T2): meeting finalize 200 on mentolder.**
      `website/src/pages/api/meeting/finalize.ts` has multiple early
      failure branches returning `503`/`500` (customer upsert, meeting
      creation) before the final `200`. Diagnose which step fails for
      the ticket's exact payload (`customerName: '[TEST] E2E Kunde'`,
      `customerEmail: 'test-e2e@example.invalid'`, `meetingType:
      '[TEST] Erstgesprach'`, `meetingDate: '03.04.2026'`, no
      `roomToken`) against the mentolder cluster's provisioned meetings
      schema.
      - Expected: `200` with `{ success: true, results: [...] }`.
      - Actual: to be captured by the Live-Reproduktion step — read the
        `error`/`detail` field from the actual JSON response (the
        handler includes `err.message` in its `500` body) to pinpoint
        the failing step without needing pod log access.
      - **BATS test:** cover the specific failing step once identified
        (e.g. `upsertCustomer`/`createMeeting` contract) in
        `tests/spec/website-interfaces.bats`.

- [ ] **Task 5 (fa-admin-db-crud-clients): `/admin/clients` 403 without auth.**
      Diagnose why the unauthenticated request to `/admin/clients` does
      not return `401`/`403`. Check the admin-auth gate (middleware or
      page-level guard) for `/admin/clients` specifically — compare
      against a working admin route to see whether this page is missing
      the guard, mis-registered in the middleware's protected-path
      list, or returning a `200` redirect-to-login page instead of a
      `4xx` status.
      - Expected: `401` or `403`.
      - Actual: to be captured by the Live-Reproduktion step.
      - **BATS test:** if the guard is middleware-config-driven, add or
        extend a case in `tests/spec/website-interfaces.bats` asserting
        `/admin/clients` is in the protected-path list.

- [ ] **Task 6 (fa-coaching-publish T5): missing-snippet publish page graceful handling.**
      `website/src/pages/admin/knowledge/snippets/[id]/publish.astro`
      must not throw an unhandled `500` when `<id>` doesn't exist in
      the knowledge snippets table. Add/fix the not-found branch (e.g.
      look up the snippet first, return a `404`/redirect/rendered error
      state instead of letting a downstream DB-null dereference bubble
      up as `500`).
      - Expected: status `< 500`.
      - Actual: to be captured by the Live-Reproduktion step (ticket
        signal suggests an unhandled exception → `500`).
      - **BATS test:** cover the not-found branch in
        `tests/spec/website-interfaces.bats` if the lookup logic is
        extractable/testable outside the `.astro` render path;
        otherwise document the Playwright assertion as the sole
        regression guard for this case.

- [ ] **Final Verification.** Run the three mandatory CI gates, plus the
      exact ticket repro command against the live/dev environment to
      confirm all 7 assertions are now green:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
