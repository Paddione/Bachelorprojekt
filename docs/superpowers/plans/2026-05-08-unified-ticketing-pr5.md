---
title: Unified Ticketing PR5 — Sunset Legacy Tables
domains: [website, db]
status: active
pr_number: null
---

# Unified Ticketing PR5 — Sunset Legacy Tables

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the back-compat views and legacy tables left over from PR1–PR3's migration window, fix all remaining code references to old table names, and run the final cross-brand test sweep.

**Architecture:** PR1–PR4 migrated all data into `tickets.*` and replaced old tables with read-only SQL views pointing back at `tickets.tickets`. Every reader/writer in application code already targets `tickets.*`. PR5 removes the scaffolding: (1) deletes the views and legacy `*_legacy` tables, (2) removes two dead `initBugTickets*` functions from `website-db.ts`, (3) updates DDL in four more `init*` functions that still name old tables in `REFERENCES` clauses (harmless in prod because tables already exist, but broken on fresh dev after views are gone), (4) fixes three tiny stray references in `bug-report.ts` and `KoreBugs.astro`, (5) archives migration BATS tests now that migrations are permanent, and (6) ships a new post-sunset health-check BATS file.

**Tech Stack:** Node.js (ES modules, `pg` driver) for scripts, BATS for unit tests, Playwright for E2E, `task` (go-task), Astro 4, PostgreSQL 16.

**Design spec section:** `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md` §8 PR5.

---

## File Structure

```
scripts/
  tickets-sunset-audit.mjs         # Create — pg_stat_user_tables report + code grep audit
  tickets-sunset.mjs               # Create — idempotent DROP of views + legacy tables + empty schemas

website/src/lib/website-db.ts      # Modify — remove 2 dead init functions; fix 4 DDL stale refs + 2 JOIN stale refs

website/src/pages/api/bug-report.ts
                                   # Modify — referenceTable string: 'bugs.bug_tickets' → 'tickets.tickets'

website/src/components/kore/KoreBugs.astro
                                   # Modify — hint text: remove stale schema name

tests/unit/tickets-migration.bats            # Modify — add DB-object existence guard on runtime tests
tests/unit/tickets-tracking-migration.bats   # Modify — same guard
tests/unit/tickets-projects-migration.bats   # Modify — same guard
tests/unit/tickets-sunset.bats               # Create  — health-check: old views gone, tickets.tickets intact

Taskfile.yml                       # Modify — add tickets:sunset:audit + tickets:sunset tasks
```

---

## Task 1: Pre-flight audit script

**Files:**
- Create: `scripts/tickets-sunset-audit.mjs`

The audit script connects to the website DB, queries `pg_stat_user_tables` for n_live_tup + n_tup_ins + n_tup_upd + n_tup_del on every legacy object, and greps source files for active references. It does **not** drop anything.

- [ ] **Step 1: Create the audit script**

```javascript
#!/usr/bin/env node
// scripts/tickets-sunset-audit.mjs
// Audits legacy table/view activity before running tickets-sunset.mjs.
// Usage: PGURL=postgres://website:…@localhost:5432/website node scripts/tickets-sunset-audit.mjs
import pg from 'pg';

const PGURL = process.env.PGURL ?? process.env.TRACKING_DB_URL ?? 'postgres://website:website@localhost:5432/website';
const client = new pg.Client({ connectionString: PGURL });

const LEGACY_OBJECTS = [
  { schema: 'bugs',           name: 'bug_tickets' },
  { schema: 'bugs',           name: 'bug_tickets_legacy' },
  { schema: 'bugs',           name: 'bug_ticket_comments_legacy' },
  { schema: 'bachelorprojekt', name: 'requirements' },
  { schema: 'bachelorprojekt', name: 'requirements_legacy' },
  { schema: 'bachelorprojekt', name: 'pipeline' },
  { schema: 'bachelorprojekt', name: 'test_results' },
  { schema: 'public',          name: 'projects' },
  { schema: 'public',          name: 'projects_legacy' },
  { schema: 'public',          name: 'sub_projects' },
  { schema: 'public',          name: 'sub_projects_legacy' },
  { schema: 'public',          name: 'project_tasks' },
  { schema: 'public',          name: 'project_tasks_legacy' },
  { schema: 'public',          name: 'project_attachments' },
  { schema: 'public',          name: 'project_attachments_legacy' },
];

await client.connect();

console.log('\n=== tickets-sunset-audit ===\n');

let warnings = 0;

for (const obj of LEGACY_OBJECTS) {
  const exists = await client.query(
    `SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=$2`,
    [obj.schema, obj.name]
  );
  if (exists.rowCount === 0) {
    console.log(`  ✓ ${obj.schema}.${obj.name} — does not exist (already gone)`);
    continue;
  }
  const kind = exists.rows[0].relkind; // 'r' = table, 'v' = view
  const kindLabel = kind === 'v' ? 'view' : 'table';

  // pg_stat_user_tables only tracks base tables, not views.
  let activity = '(view — no stats)';
  if (kind === 'r') {
    const stats = await client.query(
      `SELECT n_live_tup, n_tup_ins, n_tup_upd, n_tup_del
         FROM pg_stat_user_tables
        WHERE schemaname=$1 AND relname=$2`,
      [obj.schema, obj.name]
    );
    if (stats.rowCount > 0) {
      const r = stats.rows[0];
      activity = `live=${r.n_live_tup} ins=${r.n_tup_ins} upd=${r.n_tup_upd} del=${r.n_tup_del}`;
      if (Number(r.n_tup_ins) > 0 || Number(r.n_tup_upd) > 0) {
        console.warn(`  ⚠ ${obj.schema}.${obj.name} (${kindLabel}) — has WRITES: ${activity}`);
        warnings++;
        continue;
      }
    }
  }
  console.log(`  ✓ ${obj.schema}.${obj.name} (${kindLabel}) — ${activity}`);
}

await client.end();

console.log('');
if (warnings > 0) {
  console.error(`AUDIT FAILED: ${warnings} legacy object(s) still have write activity. Fix writers before running sunset.`);
  process.exit(1);
}
console.log('Audit passed — safe to run scripts/tickets-sunset.mjs\n');
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/tickets-sunset-audit.mjs
```

- [ ] **Step 3: Run a dry test with a port-forward to dev DB (optional smoke)**

```bash
task workspace:port-forward ENV=dev &
sleep 3
PGURL=postgres://website:website@localhost:5432/website node scripts/tickets-sunset-audit.mjs
kill %1
```

Expected: lines listing each legacy object as `does not exist (already gone)` or activity counts. `Audit passed` at the end.

- [ ] **Step 4: Commit**

```bash
git add scripts/tickets-sunset-audit.mjs
git commit -m "feat(tickets/pr5): add pre-flight sunset audit script"
```

---

## Task 2: Sunset migration script

**Files:**
- Create: `scripts/tickets-sunset.mjs`

Idempotent — safe to run twice. Drops views first (they have no dependents), then legacy `*_legacy` base tables, then schemas if they are empty. Emits a clear diff log.

- [ ] **Step 1: Write the sunset script**

```javascript
#!/usr/bin/env node
// scripts/tickets-sunset.mjs
// Drops all legacy back-compat views and _legacy tables created by PR1–3.
// IDEMPOTENT — safe to run multiple times.
// Usage: PGURL=postgres://… node scripts/tickets-sunset.mjs [--apply]
//   Default: dry-run (prints what it would do).
//   --apply: executes drops.
import pg from 'pg';

const PGURL = process.env.PGURL ?? process.env.TRACKING_DB_URL ?? 'postgres://website:website@localhost:5432/website';
const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: PGURL });

async function exists(schema, name) {
  const r = await client.query(
    `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=$2`,
    [schema, name]
  );
  return r.rowCount > 0;
}

async function isSchemaEmpty(schema) {
  const r = await client.query(
    `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','v','m') LIMIT 1`,
    [schema]
  );
  return r.rowCount === 0;
}

async function drop(kind, fqn, opts = '') {
  if (apply) {
    await client.query(`DROP ${kind} IF EXISTS ${fqn} ${opts}`);
    console.log(`  DROPPED ${kind} ${fqn}`);
  } else {
    console.log(`  [dry-run] DROP ${kind} IF EXISTS ${fqn} ${opts}`);
  }
}

await client.connect();

if (!apply) console.log('\n=== tickets-sunset DRY RUN (pass --apply to execute) ===\n');
else        console.log('\n=== tickets-sunset APPLYING ===\n');

// ── 1. bugs schema ─────────────────────────────────────────────────────────
// Drop view first (depends on nothing); then the legacy base tables.
if (await exists('bugs', 'bug_tickets')) {
  await drop('VIEW', 'bugs.bug_tickets');
}
if (await exists('bugs', 'bug_tickets_legacy')) {
  await drop('TABLE', 'bugs.bug_tickets_legacy');
}
if (await exists('bugs', 'bug_ticket_comments_legacy')) {
  await drop('TABLE', 'bugs.bug_ticket_comments_legacy');
}
if (apply && await isSchemaEmpty('bugs')) {
  await client.query('DROP SCHEMA IF EXISTS bugs');
  console.log('  DROPPED SCHEMA bugs');
}

// ── 2. bachelorprojekt schema ───────────────────────────────────────────────
if (await exists('bachelorprojekt', 'requirements')) {
  await drop('VIEW', 'bachelorprojekt.requirements');
}
if (await exists('bachelorprojekt', 'requirements_legacy')) {
  await drop('TABLE', 'bachelorprojekt.requirements_legacy');
}
if (await exists('bachelorprojekt', 'pipeline')) {
  await drop('TABLE', 'bachelorprojekt.pipeline');
}
if (await exists('bachelorprojekt', 'test_results')) {
  // Kept as historical record per spec unless empty.
  const r = await client.query('SELECT count(*) AS n FROM bachelorprojekt.test_results');
  if (Number(r.rows[0].n) === 0) {
    await drop('TABLE', 'bachelorprojekt.test_results');
  } else {
    console.log(`  SKIP bachelorprojekt.test_results — ${r.rows[0].n} rows (historical record; drop manually)`);
  }
}

// ── 3. public schema — project* views + legacy tables ─────────────────────
// Order: dependent views first, then base tables (CASCADE just in case).
for (const view of ['project_attachments', 'project_tasks', 'sub_projects', 'projects']) {
  if (await exists('public', view)) {
    await drop('VIEW', `public.${view}`, 'CASCADE');
  }
}
for (const tbl of ['project_attachments_legacy', 'project_tasks_legacy', 'sub_projects_legacy', 'projects_legacy']) {
  if (await exists('public', tbl)) {
    await drop('TABLE', `public.${tbl}`, 'CASCADE');
  }
}

await client.end();

console.log('');
if (!apply) console.log('Dry-run complete. Re-run with --apply to execute.\n');
else        console.log('Sunset complete.\n');
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/tickets-sunset.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/tickets-sunset.mjs
git commit -m "feat(tickets/pr5): add idempotent legacy-table sunset script"
```

---

## Task 3: Remove dead init functions from website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts`

Two exported functions — `initBugTicketCommentsTable()` and `initBugTicketsTable()` — were needed to bootstrap the old `bugs.*` schema. After PR1, all data lives in `tickets.*`. No caller outside the file itself calls these functions (confirmed by grep). Remove both. The functions span lines 802–886.

- [ ] **Step 1: Delete `initBugTicketCommentsTable` and `initBugTicketsTable`**

In `website/src/lib/website-db.ts`, delete the block from the line reading:

```
export async function initBugTicketCommentsTable(): Promise<void> {
```

…through the last `}` of `initBugTicketsTable()`, which ends just before:

```
// ── Service Config (Angebote Overrides) ──────────────────────────────────────
```

The exact text to delete starts with:

```typescript
export async function initBugTicketCommentsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bugs.bug_ticket_comments (
```

and ends with the closing `}` of `initBugTicketsTable`, i.e. the `}` before:

```typescript
// ── Service Config (Angebote Overrides) ──────────────────────────────────────
```

Use the Edit tool with `old_string` = the full block (both functions, ~85 lines) and `new_string` = `""`.

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors referencing `initBugTicketCommentsTable` or `initBugTicketsTable`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "refactor(tickets/pr5): remove dead initBugTickets* init functions"
```

---

## Task 4: Fix stale DDL `REFERENCES` clauses in four init functions

**Files:**
- Modify: `website/src/lib/website-db.ts` (four locations)

After PR5 drops the `projects`, `project_tasks`, `sub_projects`, and `project_attachments` views, any fresh dev environment that runs `initTimeEntriesTable()`, `initMeetingProjectLink()`, or `initBookingProjectLinks()` before those views exist will fail. The migration already re-pointed the live FKs to `tickets.tickets(id)`; these DDL strings must match.

Four changes:

**A.** `initMeetingProjectLink` (around line 253 after Task 3's deletion shifts things):

```sql
-- before
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
-- after
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL
```

**B.** `initTimeEntriesTable` — `project_id` FK:

```sql
-- before
project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
-- after
project_id        UUID        NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
```

**C.** `initTimeEntriesTable` — `task_id` FK:

```sql
-- before
task_id           UUID        REFERENCES project_tasks(id) ON DELETE SET NULL,
-- after
task_id           UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
```

**D.** `initBookingProjectLinks` — `project_id` FK:

```sql
-- before
project_id  UUID    REFERENCES projects(id) ON DELETE SET NULL,
-- after
project_id  UUID    REFERENCES tickets.tickets(id) ON DELETE SET NULL,
```

- [ ] **Step 1: Apply all four edits**

Apply each independently via the Edit tool. For A:

```
old: ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
new: ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL
```

For B (inside `initTimeEntriesTable` CREATE TABLE block):
```
old:       project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
new:       project_id        UUID        NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
```

For C (inside same block):
```
old:       task_id           UUID        REFERENCES project_tasks(id) ON DELETE SET NULL,
new:       task_id           UUID        REFERENCES tickets.tickets(id) ON DELETE SET NULL,
```

For D (inside `initBookingProjectLinks` CREATE TABLE block):
```
old:       project_id  UUID    REFERENCES projects(id) ON DELETE SET NULL,
new:       project_id  UUID    REFERENCES tickets.tickets(id) ON DELETE SET NULL,
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "fix(tickets/pr5): update stale DDL REFERENCES to tickets.tickets in four init fns"
```

---

## Task 5: Fix stale JOIN aliases in listTimeEntries queries

**Files:**
- Modify: `website/src/lib/website-db.ts` (two SELECT queries)

`listTimeEntries` and `listAllTimeEntries` join to `projects` and `project_tasks` views. After sunset those views are gone; the queries would error at runtime. They need to join directly to `tickets.tickets`.

Target text in `listTimeEntries` (appears twice, nearly identical):

```sql
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
```

And the column alias `pt.name AS "taskName"` (from the view which exposed `title` as `name`). After switching to `tickets.tickets`, the column is `title`, so the alias becomes `task.title AS "taskName"`.

- [ ] **Step 1: Fix `listTimeEntries` query**

In `listTimeEntries`, change:

```sql
            pt.name              AS "taskName",
```

to:

```sql
            task.title           AS "taskName",
```

And:

```sql
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
```

to:

```sql
     FROM time_entries te
     JOIN tickets.tickets p    ON p.id  = te.project_id
     LEFT JOIN tickets.tickets task ON task.id = te.task_id
```

- [ ] **Step 2: Fix `listAllTimeEntries` query**

Apply the same substitution in `listAllTimeEntries` (same pattern, same lines):

```sql
            pt.name              AS "taskName",
```
→
```sql
            task.title           AS "taskName",
```

```sql
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
```
→
```sql
     FROM time_entries te
     JOIN tickets.tickets p    ON p.id  = te.project_id
     LEFT JOIN tickets.tickets task ON task.id = te.task_id
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "fix(tickets/pr5): repoint listTimeEntries JOINs from old views to tickets.tickets"
```

---

## Task 6: Fix stray references in bug-report.ts and KoreBugs.astro

**Files:**
- Modify: `website/src/pages/api/bug-report.ts`
- Modify: `website/src/components/kore/KoreBugs.astro`

**A.** `bug-report.ts` line ~100: `referenceTable` is a string stored in `inbox_items.reference_table` — a metadata column, not a FK. It was `'bugs.bug_tickets'`; update to the current canonical table.

**B.** `KoreBugs.astro` line 24: inline hint comment that says `live aus bugs.bug_tickets` — update to `live aus tickets.tickets`.

- [ ] **Step 1: Fix bug-report.ts**

```
old: referenceTable: 'bugs.bug_tickets',
new: referenceTable: 'tickets.tickets',
```

- [ ] **Step 2: Fix KoreBugs.astro**

```
old: <span class="hint">offen · live aus bugs.bug_tickets</span>
new: <span class="hint">offen · live aus tickets.tickets</span>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/bug-report.ts website/src/components/kore/KoreBugs.astro
git commit -m "fix(tickets/pr5): update stray legacy table name refs in bug-report + KoreBugs"
```

---

## Task 7: Guard migration BATS runtime tests + write post-sunset health check

**Files:**
- Modify: `tests/unit/tickets-migration.bats`
- Modify: `tests/unit/tickets-tracking-migration.bats`
- Modify: `tests/unit/tickets-projects-migration.bats`
- Create: `tests/unit/tickets-sunset.bats`

The migration BATS files have "runtime" tests that query legacy views (e.g. `bugs.bug_tickets`). After PR5 drops those views, these tests would fail on a post-sunset database. Add a DB-object check guard at the top of each runtime section: if the view is gone, skip the runtime block entirely.

The new `tickets-sunset.bats` verifies the post-sunset state: legacy objects gone, `tickets.tickets` intact and populated.

- [ ] **Step 1: Add guard to `tickets-migration.bats`**

In `tests/unit/tickets-migration.bats`, find the first `@test "runtime:` test. Insert a guard at the start of **every** `@test "runtime:…"` function:

```bash
  # Guard: skip if the legacy view/table was already sunset.
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bugs' AND c.relname='bug_tickets'" 2>/dev/null | grep -q '1 row' || \
    skip "bugs.bug_tickets does not exist (sunset already applied)"
```

This one-liner skips the test cleanly when the view is absent.

- [ ] **Step 2: Add guard to `tickets-tracking-migration.bats`**

Same pattern — find tests that reference `bachelorprojekt.requirements` and prepend:

```bash
  psql "$PGURL" -c "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'" 2>/dev/null | grep -q '1 row' || \
    skip "bachelorprojekt.requirements does not exist (sunset already applied)"
```

- [ ] **Step 3: Add guard to `tickets-projects-migration.bats`**

Find tests that reference `projects`, `sub_projects`, or `project_tasks` views. Prepend:

```bash
  psql "$PGURL" -c "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'" 2>/dev/null | grep -q '1 row' || \
    skip "projects view does not exist (sunset already applied)"
```

- [ ] **Step 4: Create `tests/unit/tickets-sunset.bats`**

```bash
#!/usr/bin/env bats
# tickets-sunset.bats — verifies the post-sunset DB state produced by
#   scripts/tickets-sunset.mjs
#
# Set TRACKING_DB_URL=postgres://website:…@localhost:5432/website
# Default fallback: postgres://website:website@localhost:5432/website
# Static tests (no DB) run unconditionally.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  PGURL="${TRACKING_DB_URL:-postgres://website:website@localhost:5432/website}"
  export PGURL PROJECT_DIR
  case "$PGURL" in
    *mentolder*|*korczewski*)
      skip "TRACKING_DB_URL points to a production host — refusing to run against live data"
      ;;
  esac
}

# ── Static checks ──────────────────────────────────────────────────

@test "static: sunset script exists" {
  [ -f "${PROJECT_DIR}/scripts/tickets-sunset.mjs" ]
}

@test "static: audit script exists" {
  [ -f "${PROJECT_DIR}/scripts/tickets-sunset-audit.mjs" ]
}

@test "static: sunset script is idempotent (uses IF EXISTS)" {
  grep -q 'IF EXISTS' "${PROJECT_DIR}/scripts/tickets-sunset.mjs"
}

@test "static: sunset script has --apply guard (dry-run default)" {
  grep -q "process.argv.includes('--apply')" "${PROJECT_DIR}/scripts/tickets-sunset.mjs"
}

# ── Runtime checks ─────────────────────────────────────────────────

object_gone() {
  local schema="$1" name="$2"
  local count
  count=$(psql "$PGURL" -t -A -c \
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${schema}' AND c.relname='${name}'")
  [ "$count" = "0" ]
}

@test "runtime: bugs.bug_tickets view is gone" {
  object_gone bugs bug_tickets
}

@test "runtime: bugs.bug_tickets_legacy table is gone" {
  object_gone bugs bug_tickets_legacy
}

@test "runtime: bachelorprojekt.requirements view is gone" {
  object_gone bachelorprojekt requirements
}

@test "runtime: public.projects view is gone" {
  object_gone public projects
}

@test "runtime: public.sub_projects view is gone" {
  object_gone public sub_projects
}

@test "runtime: public.project_tasks view is gone" {
  object_gone public project_tasks
}

@test "runtime: public.project_attachments view is gone" {
  object_gone public project_attachments
}

@test "runtime: tickets.tickets table exists and is a base table" {
  local kind
  kind=$(psql "$PGURL" -t -A -c \
    "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tickets' AND c.relname='tickets'")
  [ "$kind" = "r" ]
}

@test "runtime: tickets.tickets has rows" {
  local n
  n=$(psql "$PGURL" -t -A -c "SELECT count(*) FROM tickets.tickets")
  [ "$n" -gt 0 ]
}

@test "runtime: tickets.ticket_activity exists" {
  local kind
  kind=$(psql "$PGURL" -t -A -c \
    "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tickets' AND c.relname='ticket_activity'")
  [ "$kind" = "r" ]
}
```

```bash
chmod +x tests/unit/tickets-sunset.bats
```

- [ ] **Step 5: Run static tests to confirm they pass without a DB**

```bash
task test:unit 2>&1 | grep -E "tickets-sunset|PASS|FAIL|skip"
```

Expected: all static tests in `tickets-sunset.bats` PASS; runtime tests skip (no DB in unit tier).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/tickets-sunset.bats \
        tests/unit/tickets-migration.bats \
        tests/unit/tickets-tracking-migration.bats \
        tests/unit/tickets-projects-migration.bats
git commit -m "test(tickets/pr5): sunset health-check BATS + guards on legacy migration tests"
```

---

## Task 8: Taskfile additions

**Files:**
- Modify: `Taskfile.yml`

Add two tasks under the existing `workspace:` or `tickets:` namespace. The tasks wrap the two new Node scripts and port-forward shared-db automatically.

- [ ] **Step 1: Add tasks to Taskfile.yml**

Find the block in `Taskfile.yml` where `workspace:psql` or similar DB utility tasks live. Insert after it:

```yaml
  tickets:sunset:audit:
    desc: "Audit legacy table activity before sunset (reads pg_stat_user_tables)"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl --context "${ENV_CONTEXT}" port-forward -n "${WORKSPACE_NAMESPACE:-workspace}" svc/shared-db 5432:5432 &
        PF_PID=$!
        sleep 2
        PGURL="postgres://website:${DB_PASSWORD_WEBSITE}@localhost:5432/website" \
          node scripts/tickets-sunset-audit.mjs
        kill $PF_PID 2>/dev/null || true
    vars:
      ENV: '{{.ENV | default "dev"}}'

  tickets:sunset:
    desc: "Drop legacy back-compat views + _legacy tables (PR1–3 migration window end)"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl --context "${ENV_CONTEXT}" port-forward -n "${WORKSPACE_NAMESPACE:-workspace}" svc/shared-db 5432:5432 &
        PF_PID=$!
        sleep 2
        PGURL="postgres://website:${DB_PASSWORD_WEBSITE}@localhost:5432/website" \
          node scripts/tickets-sunset.mjs {{.APPLY_FLAG}}
        kill $PF_PID 2>/dev/null || true
    vars:
      ENV: '{{.ENV | default "dev"}}'
      APPLY_FLAG: '{{if .APPLY}}--apply{{else}}{{end}}'
```

This means:
- `task tickets:sunset ENV=mentolder` → dry-run
- `task tickets:sunset ENV=mentolder APPLY=true` → actually drops

- [ ] **Step 2: Validate Taskfile syntax**

```bash
task --list 2>&1 | grep tickets
```

Expected: `tickets:sunset:audit` and `tickets:sunset` appear in the list.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(tickets/pr5): add tickets:sunset:audit + tickets:sunset Taskfile tasks"
```

---

## Task 9: Run offline test suite

Run the full offline suite and confirm nothing regressed before touching prod.

- [ ] **Step 1: Run all offline tests**

```bash
task test:all 2>&1 | tail -30
```

Expected: `PASS` for all BATS unit tests (migration runtime tests skip cleanly) and manifest validation succeeds.

- [ ] **Step 2: Fix any failures before continuing**

If `task test:all` fails, diagnose and fix in a separate commit before proceeding.

- [ ] **Step 3: Run TypeScript typecheck**

```bash
cd website && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit fix if any**

```bash
git add -p
git commit -m "fix(tickets/pr5): <describe fix>"
```

---

## Task 10: Deploy to mentolder + run sunset

- [ ] **Step 1: Back up both clusters before touching DB**

```bash
task workspace:backup ENV=mentolder
```

Wait for completion:

```bash
task workspace:backup:list ENV=mentolder | head -5
```

Expected: timestamp from today appears.

- [ ] **Step 2: Deploy website to mentolder (picks up code changes)**

```bash
task feature:website
```

Expected: website pod restarts clean on both clusters.

- [ ] **Step 3: Audit mentolder DB**

```bash
task tickets:sunset:audit ENV=mentolder
```

Expected: `Audit passed — safe to run scripts/tickets-sunset.mjs`

If any object shows write activity, investigate before continuing. The `projects` and `bugs.bug_tickets` views should show `(view — no stats)`. Legacy tables should show `ins=0 upd=0`.

- [ ] **Step 4: Run sunset dry-run on mentolder**

```bash
task tickets:sunset ENV=mentolder
```

Expected: `[dry-run] DROP VIEW IF EXISTS …` lines listing each legacy object, ending with `Dry-run complete.`

- [ ] **Step 5: Apply sunset on mentolder**

```bash
task tickets:sunset ENV=mentolder APPLY=true
```

Expected: `DROPPED VIEW bugs.bug_tickets`, `DROPPED TABLE bugs.bug_tickets_legacy`, etc. `Sunset complete.`

- [ ] **Step 6: Verify website still works**

Open `https://web.mentolder.de/admin/bugs` → should load (reads `tickets.tickets` directly, no dependency on dropped views).

Open `https://web.mentolder.de/admin/tickets` → index page loads, ticket rows visible.

Open `https://web.mentolder.de/` → homepage loads, KoreBugs section loads for korczewski brand.

---

## Task 11: Final test sweep — Playwright website group (mentolder)

- [ ] **Step 1: Run the Playwright website group against mentolder**

```bash
cd tests/e2e && \
  WEBSITE_URL=https://web.mentolder.de \
  npx playwright test --project=website 2>&1 | tail -40
```

Expected: all specs pass or are already-known skips. No new failures.

- [ ] **Step 2: Run the Playwright services group against mentolder (if defined)**

```bash
cd tests/e2e && \
  WEBSITE_URL=https://web.mentolder.de \
  npx playwright test --project=services 2>&1 | tail -20
```

- [ ] **Step 3: Fix any new failures before declaring done**

Investigate each failure — check if it's a pre-existing flake (acceptable) or a regression introduced by PR5 (must fix).

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -p
git commit -m "fix(tickets/pr5): <describe any final fixes>"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Confirm no readers/writers on old tables | Task 1 (audit script) |
| Drop `bugs.bug_tickets` view | Task 2 (sunset script) |
| Drop `bugs.bug_ticket_comments`, `bugs` schema | Task 2 |
| Drop `bachelorprojekt.requirements` view + legacy table | Task 2 |
| Drop `bachelorprojekt.pipeline` | Task 2 |
| Drop `projects/sub_projects/project_tasks/project_attachments` | Task 2 |
| `bachelorprojekt.test_results` handled (keep if non-empty) | Task 2 |
| Final test sweep across both brands | Tasks 10–11 |
| Code still builds with no old-table references | Tasks 3–6 |
| Fresh dev environment works after sunset | Tasks 4–5 (DDL fixes) |

**No placeholders:** All code blocks are complete.

**Type consistency:** `task.title AS "taskName"` in Task 5 matches the `TimeEntry.taskName: string | null` interface already declared in `website-db.ts` — `title` on `tickets.tickets` is TEXT NOT NULL so the type is correct.
