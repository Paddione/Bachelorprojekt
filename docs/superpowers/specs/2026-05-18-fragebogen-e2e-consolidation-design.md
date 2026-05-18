# Fragebogen E2E Consolidation — Design

**Date:** 2026-05-18  
**Status:** Approved

## Problem

Questionnaire E2E coverage is fragmented and partially dead:

1. `fa-questionnaire.spec.ts` — 6 thin auth-gating tests only; registered in playwright.config.ts
2. `fa-fragebogen-archive.spec.ts` — rich archive/reassign/replay tests; **NOT registered** (silently skipped in CI)
3. `systemtest-04-fragebogen.spec.ts` — system-test walker; registered under `systemtest` project (stays)

Additionally, 7 other spec files exist on disk but are not registered in `playwright.config.ts`, meaning they never run.

## Goal

1. Replace both orphan questionnaire specs with a single canonical `fa-fragebogen.spec.ts`.
2. Register all 7 other orphaned specs in their correct playwright projects.
3. The new spec ends with a "real-user handoff" step: after automated tests pass in prod, auto-assign the systemtest-04 template to the admin user (`paddione`) so a human can walk the same steps manually.

## File Changes

| Action | File |
|--------|------|
| Delete | `tests/e2e/specs/fa-questionnaire.spec.ts` |
| Delete | `tests/e2e/specs/fa-fragebogen-archive.spec.ts` |
| Create | `tests/e2e/specs/fa-fragebogen.spec.ts` |
| Update | `tests/e2e/playwright.config.ts` |

## `fa-fragebogen.spec.ts` — Test Structure

```
describe('FA-Fragebogen: Fragebögen')
│
├── describe('Auth gating')                       // headless, no creds
│   ├── GET  /api/portal/questionnaires           → 401/403
│   ├── GET  /api/portal/questionnaires/:id       → 401/403
│   ├── PUT  /api/portal/questionnaires/:id/answer→ 401/403
│   ├── POST /api/portal/questionnaires/:id/submit→ 401/403
│   ├── GET  /portal/fragebogen/:id               → redirect (not 404)
│   └── GET  /portal?section=fragebögen           → not 404 / not 500
│
├── describe('Fill flow')                         // DB seeds, API fills
│   ├── T1: portal page redirects unauthenticated
│   ├── T2: PUT answer returns 200 (admin auth, test assignment)
│   └── T3: POST submit returns 200; assignment status → 'submitted'
│
├── describe('Admin view')                        // admin login required
│   └── T1: /admin/fragebogen/:id shows submitted data (no 404/500)
│
├── describe('Archive → reassign → replay')       // from fa-fragebogen-archive
│   ├── T1: archive turns 'submitted' into frozen datapoint + KPI row
│   │       reassign creates new 'pending' row
│   └── T2: replay button visible on archived system-test with evidence
│
└── describe('Real-user handoff')                 // prod only, skips in CI
    └── T1: POST /api/admin/questionnaires/assign
            templateId = systemtest-04 template
            keycloakUserId = paddione's KC user ID
            → creates pending assignment → admin can walk it manually
```

### Skipping strategy

- Auth-gating group: always runs (no env vars needed).
- Fill flow + Admin view: skip when `E2E_ADMIN_PASS` unset.
- Archive group: skip when `E2E_ADMIN_PASS` unset.
- Real-user handoff: skip when `E2E_ADMIN_PASS` unset **or** `WEBSITE_URL` does not contain `mentolder.de` or `korczewski.de` (prevents accidental prod assignment from localhost runs).

### DB cleanup

`afterAll` in fill-flow and archive groups deletes all rows created during the test run using `is_test_data = true` on `questionnaire_assignments` plus cascading deletes on `questionnaire_templates` created by the test.

## playwright.config.ts Changes

### website project

```typescript
// Remove:
'**/fa-questionnaire.spec.ts',

// Add:
'**/fa-fragebogen.spec.ts',           // consolidated questionnaire E2E
'**/fa-coaching-drafts.spec.ts',      // coaching drafts auth-gates
'**/fa-coaching-knowledge.spec.ts',   // knowledge collections CRUD
'**/fa-coaching-publish.spec.ts',     // coaching publish flow
```

### brett-mentolder project

```typescript
// Add:
'**/brett-controls.spec.ts',          // WASD movement tests
'**/brett-mannequin.spec.ts',         // mannequin focus tests
```

### smoke project

```typescript
// Add:
'**/fa-30-arena-banner.spec.ts',      // cross-brand arena banner
'**/fa-38-arena-game-client.spec.ts', // game client lobby flow
```

## Real-user Handoff Detail

The handoff test calls the existing `POST /api/admin/questionnaires/assign` endpoint authenticated via a Keycloak login session (same `loginAsAdmin` helper used in archive tests). It looks up the systemtest-04 template by `is_system_test = true AND title LIKE '%Fragebogen%'` and assigns it to the admin Keycloak user whose username matches `E2E_ADMIN_USER` (default: `paddione`).

On success the test logs the new assignment URL so the operator can navigate directly to it.

## What Stays Unchanged

- `systemtest-04-fragebogen.spec.ts` remains in the `systemtest` project — it walks the full system-test template via `walkSystemtestByTemplate` and is unaffected by this change.
- The unit test `website/src/lib/questionnaire-archive.test.ts` (vitest) is untouched.
- The `fa-fragebogen-archive.spec.ts` logic is fully preserved in the new consolidated spec before the old file is deleted.

## Test Inventory

After creating the new spec, run `task test:inventory` and commit the updated `website/src/data/test-inventory.json`.
