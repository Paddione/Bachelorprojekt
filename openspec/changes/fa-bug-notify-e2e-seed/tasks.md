---
title: "fa-bug-notify-e2e-seed — Implementation Plan"
ticket_id: T001754
domains: [test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fa-bug-notify-e2e-seed — Implementation Plan

_Ticket: T001754_

## File Structure

- `tests/e2e/specs/fa-bugs-notifications.spec.ts` — modified: replace the
  public `/api/bug-report` seed with a direct DB insert, add an
  `afterEach` cleanup hook.
- `tests/spec/e2e-testing.bats` — new (already created during planning,
  currently RED against the unmodified spec file).
- `openspec/changes/fa-bug-notify-e2e-seed/specs/e2e-testing.md` — new
  delta spec (already created during planning).

## Task 1 — Confirm the failing test (RED)

`tests/spec/e2e-testing.bats` already exists and is red against the
current `fa-bugs-notifications.spec.ts`:

```bash
bats tests/spec/e2e-testing.bats
# expected: FAIL — "FA-bug-notify has an afterEach that deletes the seeded ticket row"
#   (no afterEach / no DELETE FROM tickets.tickets present yet)
```

Re-run this command first and confirm the same failure before touching
production code — do not proceed to Task 2 until you've observed the RED
state yourself.

## Task 2 — Replace the public-API seed with a direct DB insert

Edit `tests/e2e/specs/fa-bugs-notifications.spec.ts`:

1. Add the imports and DB URL constant used by the existing sibling
   pattern in `tests/e2e/specs/fa-fragebogen.spec.ts`:
   ```ts
   import { Pool } from 'pg';

   const DB_URL = process.env.SESSIONS_DATABASE_URL
              ?? 'postgresql://website:devwebsitedb@localhost:5432/website';
   const BRAND  = process.env.E2E_BRAND ?? 'mentolder';
   ```
2. Extend the existing skip gate (currently only `CRON_SECRET` +
   `ADMIN_PASS`) with a third check:
   ```ts
   if (!process.env.SESSIONS_DATABASE_URL) {
     test.skip(true, 'SESSIONS_DATABASE_URL fehlt — DB-Seed nicht möglich');
     return;
   }
   ```
   Keep the existing `CRON_SECRET` and `ADMIN_PASS` skips as-is — this is
   additive, not a replacement of the existing gate.
3. Replace the "Step 1: Submit public bug report via API" block (the
   `request.post(`${BASE}/api/bug-report`, ...)` call and its
   `createBody`/`ticketId` extraction) with a direct insert against
   `tickets.tickets`, mirroring the exact column set used by
   `insertBugTicket()` in `website/src/lib/website-db.ts:342-351`
   (`type, brand, title, description, url, reporter_email, status,
   is_test_data`):
   ```ts
   const pool = new Pool({ connectionString: DB_URL });
   let ticketId: string;
   try {
     const description = 'E2E notification test — Playwright FA-bug-notify';
     const { rows } = await pool.query<{ external_id: string }>(
       `INSERT INTO tickets.tickets
          (type, brand, title, description, url, reporter_email, status, is_test_data)
        VALUES ('bug', $1, $2, $3, '/e2e-test', $4, 'triage', true)
        RETURNING external_id`,
       [BRAND, description.slice(0, 200), description, reporter]
     );
     ticketId = rows[0].external_id;
   } finally {
     await pool.end();
   }
   ```
   Keep the existing `const reporter = \`e2e-${Date.now()}@example.com\`;`
   line above this block unchanged — the insert reuses it.
4. Remove the now-unused `expect(createBody.success)` /
   `expect(createBody.ticketId)` assertions (the direct insert makes them
   moot); keep `expect(ticketId).toMatch(/^(BR-|T\d)/)` right after the
   insert so the ID-shape contract stays covered.

## Task 3 — Add immediate cleanup via `afterEach`

Add, inside `test.describe('FA-bug-notify', ...)`, a module-scoped
variable to track the seeded ID across the test body and its
`afterEach`, then delete it unconditionally:

```ts
let seededExternalId: string | undefined;

test.afterEach(async () => {
  if (!seededExternalId) return;
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(`DELETE FROM tickets.tickets WHERE external_id = $1`, [seededExternalId]);
  } finally {
    await pool.end();
  }
  seededExternalId = undefined;
});
```

Set `seededExternalId = ticketId;` immediately after the insert in Task 2
(before the admin-login/resolve steps), so cleanup still runs even if a
later step throws.

## Task 4 — Verify GREEN and run full verification

```bash
bats tests/spec/e2e-testing.bats
# both assertions now pass

task test:changed
task freshness:regenerate
task freshness:check
```

## Merge-risk note

`main` currently has 3 unpushed local commits (T001748, "increase
hydration timeouts") that also touch `fa-bugs-notifications.spec.ts`
(refactoring it onto the `e2e-marker.ts` helper). Rebase onto latest
`main` before implementing and re-check whether the direct-insert
replacement in Task 2 still applies cleanly to whatever shape the file
has landed in — the column list and skip-gate logic are the parts that
matter, not the exact surrounding code.
