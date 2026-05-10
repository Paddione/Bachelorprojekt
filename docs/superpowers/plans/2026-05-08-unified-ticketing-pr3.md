---
title: Unified Ticketing PR3/5 — projects/sub_projects/tasks migration
domains: [website, db]
status: completed
pr_number: 567
---

# Unified Ticketing PR3/5 — projects/sub_projects/tasks migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the admin project hierarchy (`projects`, `sub_projects`, `project_tasks`, `project_attachments`) into `tickets.tickets` (type='project'/'task') + `tickets.ticket_attachments`, rewire the `/admin/projekte` UI and Gantt visualization to read from `tickets.*`, and replace the legacy tables with back-compat SQL views — without breaking the Gantt UX, the customer detail page, or the cron jobs that touch projects.

**Architecture:** PR1 created the `tickets` schema; PR2 added `tickets.pr_events`. PR3 lifts the third domain (admin projects) into the same model. Each old project becomes a `type='project'` ticket with `parent_id IS NULL`; each sub_project becomes `type='project'` with `parent_id` = parent project ticket id; each project_task becomes `type='task'` with `parent_id` = sub_project ticket id (or project ticket id when there was no sub_project). Old UUIDs are preserved as the new ticket UUIDs so external FKs (`meetings.project_id`, `time_entries.project_id`/`task_id`, `booking_project_links.project_id`) keep referencing the same row — those FKs are atomically re-pointed at `tickets.tickets(id)` inside the migration transaction. Status maps `entwurf|geplant→backlog`, `wartend→blocked`, `aktiv→in_progress`, `erledigt→done+shipped`, `archiviert→archived+shipped`. Legacy tables get renamed to `*_legacy`; views replace them so any unmigrated reader keeps working. The website helper functions in `website/src/lib/website-db.ts` are rewritten in place to query `tickets.tickets` directly while keeping the same TypeScript return shapes (`Project`, `SubProject`, `ProjectTask`, `ProjectAttachment`) — this is what the spec means by "Same Gantt UX": the page logic and DOM are unchanged, only the SQL underneath moves.

**Tech Stack:** PostgreSQL 16 (`pg` driver, ESM `.mjs`), TypeScript (Astro+Svelte website), BATS for unit tests, Playwright for e2e. Mirrors PR1 (`scripts/migrate-bugs-to-tickets.mjs`) and PR2 (`scripts/migrate-tracking-to-tickets.mjs`) verbatim where possible.

---

## Why this is bite-sized

PR3 touches one DDL extension (a `notes` column on `tickets.tickets`), one migration script, one large library file (`website-db.ts`), one BATS file, and one runbook. It does **not** touch:
- The `tickets.tickets` core schema beyond the `notes` column.
- Any UI markup in `projekte.astro` / `projekte/[id].astro` (the helpers preserve `Project`/`SubProject`/`ProjectTask` shapes, so the Astro/Svelte code is untouched).
- `pipeline`, `test_results`, or `tickets.pr_events` (those landed in earlier PRs).
- Sealed secrets or `prod/` overlays.

Hard constraints carried into every task:

1. **Brand multi-tenancy.** `tickets.tickets.brand` is `NOT NULL`. Projects already have a direct `brand` column → copy 1:1. **Sub-projects and tasks have no `brand` column** — they inherit through `projects.brand` via JOIN at migration time, and via parent traversal afterward (the website `createSubProject`/`createProjectTask` helpers must look up the parent's `brand` and pass it explicitly).
2. **Customer FK on type='project'.** Spec §6 invariant: new project tickets must have `customer_id`. Enforce in `createProject` (service-layer throw), but tolerate `NULL` on already-migrated rows (mirror PR2's "back-migrated rows may not satisfy" pattern).
3. **External FKs into projects must be re-pointed atomically.** `meetings.project_id`, `time_entries.project_id`, `time_entries.task_id`, `booking_project_links.project_id` all FK to the legacy tables today. Inside the migration transaction: drop old FKs → rename legacy tables to `*_legacy` → add fresh FKs to `tickets.tickets(id)`. Because the migration preserves UUIDs, every existing row still satisfies the new constraint.
4. **Migration runs as `postgres` superuser.** The website role can't `ALTER TABLE … RENAME` on tables it doesn't own. The runbook (Task 7) connects with the postgres password, not the website password. Back-compat views are SELECT-able by the website role thanks to the default privileges set by PR #566.
5. **Deploy ordering: pods first, migration second.** ArgoCD rolls website pods on both clusters with the new code (which writes `tickets.tickets` directly). For ~1–5 minutes the projekte page shows an empty list; running migration with `--apply` on mentolder then korczewski immediately after merge keeps the visibility gap small. Old pods that briefly survive on the previous image will get FK violations when they try to write — that's loud-failure-louder-than-silent and acceptable.
6. **Same Gantt UX.** The page reads `Project` arrays, computes a Gantt with inline date arithmetic, and renders bars. As long as `listProjects()` returns `Project[]` with the same `ProjectStatus` strings, the Gantt is unchanged. The status round-trip is lossy (`entwurf` and `geplant` both map to `backlog` going forward, then both come back as `entwurf` on read) — accepted because PR4 introduces the unified status vocabulary anyway.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/tickets-db.ts` | Modify | Add `notes TEXT` column to `tickets.tickets` via idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. |
| `scripts/migrate-projects-to-tickets.mjs` | Create | Idempotent data move + FK re-point + back-compat views. Mirrors PR1/PR2 shape. Runs as `postgres`. |
| `website/src/lib/website-db.ts` | Modify | Rewrite the project helpers (lines ~1135–1740 plus three stragglers at ~2053, ~2375, ~2407) to read/write `tickets.tickets` and `tickets.ticket_attachments`. Same TypeScript return shapes; status mapped at SQL level. Replace `initProjectTables()` with `initTicketsSchema()` calls. |
| `tests/unit/tickets-projects-migration.bats` | Create | Row-count parity, parent_id chain integrity, back-compat view shape, status mapping. |
| `docs/superpowers/plans/2026-05-08-unified-ticketing-pr3.md` | Self | This file. |

**No file is created in** `prod*/`, `k3d/`, `argocd/`, or `website/src/components/` — UI markup, manifests, and overlays are untouched.

---

## Task 1: Add `notes` column to `tickets.tickets`

**Why:** `projects`, `sub_projects`, and `project_tasks` each have a `notes` column separate from `description`. The current `projekte/[id].astro` UI renders them as two separate textareas. Collapsing into `description` would either lose data or create fragile string-marker round-trips. A new nullable `notes` column on `tickets.tickets` is the smallest possible extension that preserves UX.

**Files:**
- Modify: `website/src/lib/tickets-db.ts` — locate `initTicketsSchema()` between the `CREATE TABLE tickets.tickets` block and the first `CREATE INDEX` line (~line 56).

- [ ] **Step 1: Read `website/src/lib/tickets-db.ts:1-90` to confirm the insertion point.**

The pattern: after the main `CREATE TABLE IF NOT EXISTS tickets.tickets (…)` and before the index block. Idempotent column additions use `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

- [ ] **Step 2: Insert the `ALTER TABLE … ADD COLUMN IF NOT EXISTS notes TEXT` line.**

In `website/src/lib/tickets-db.ts`, immediately after the closing `)` of the `CREATE TABLE IF NOT EXISTS tickets.tickets (…)` block (the line with just `\``  ` followed by the next `await pool.query` for the indexes), add:

```ts
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS notes TEXT`);
```

This must run BEFORE any index/trigger DDL so the column exists when later queries reference it.

- [ ] **Step 3: TypeScript still compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Step 4: Commit.**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): add notes column to tickets.tickets (PR3/5)"
```

---

## Task 2: Write the migration script `scripts/migrate-projects-to-tickets.mjs`

**Files:**
- Create: `scripts/migrate-projects-to-tickets.mjs`

**Pattern source:** `scripts/migrate-bugs-to-tickets.mjs` (PR1) for skeleton; `scripts/migrate-tracking-to-tickets.mjs` (PR2) for the rename + view block. New addition: external-FK re-point.

- [ ] **Step 1: Create the file with the full script body.**

```js
// scripts/migrate-projects-to-tickets.mjs
//
// PR3/5: Migrates projects + sub_projects + project_tasks → tickets.tickets,
// project_attachments → tickets.ticket_attachments. Preserves all UUIDs so
// external FKs (meetings.project_id, time_entries.project_id, time_entries.task_id,
// booking_project_links.project_id) can be atomically re-pointed at
// tickets.tickets(id). Renames the legacy tables to *_legacy and replaces them
// with back-compat views.
//
// Idempotent: detects already-migrated rows by id (the new ticket UUID == old
// project/sub_project/task UUID).
//
// MUST run as the postgres superuser — ALTER TABLE … RENAME, ADD CONSTRAINT,
// and DROP CONSTRAINT all require ownership of the tables.
//
// Usage:
//   node scripts/migrate-projects-to-tickets.mjs            # dry-run (default)
//   node scripts/migrate-projects-to-tickets.mjs --apply    # execute changes
//
// Env: TRACKING_DB_URL or WEBSITE_DB_URL (Postgres connection string,
//      authenticated as `postgres`).
import pg from 'pg';

const STATUS_MAP = {
  entwurf:    { status: 'backlog',     resolution: null,      doneAt: false, archivedAt: false },
  geplant:    { status: 'backlog',     resolution: null,      doneAt: false, archivedAt: false },
  wartend:    { status: 'blocked',     resolution: null,      doneAt: false, archivedAt: false },
  aktiv:      { status: 'in_progress', resolution: null,      doneAt: false, archivedAt: false },
  erledigt:   { status: 'done',        resolution: 'shipped', doneAt: true,  archivedAt: false },
  archiviert: { status: 'archived',    resolution: 'shipped', doneAt: false, archivedAt: true  },
};

async function isBaseTable(client, schema, name) {
  const r = await client.query(
    `SELECT 1 FROM pg_tables WHERE schemaname=$1 AND tablename=$2`, [schema, name]);
  return r.rowCount > 0;
}

async function migrate(client, dryRun) {
  const out = {
    projectsMigrated: 0, projectsSkipped: 0,
    subProjectsMigrated: 0, subProjectsSkipped: 0,
    tasksMigrated: 0, tasksSkipped: 0,
    attachmentsMigrated: 0, attachmentsSkipped: 0,
    fksRePointed: 0, viewsCreated: 0, unknownStatus: 0,
  };

  const projectsIsTable    = await isBaseTable(client, 'public', 'projects');
  const subProjectsIsTable = await isBaseTable(client, 'public', 'sub_projects');
  const tasksIsTable       = await isBaseTable(client, 'public', 'project_tasks');
  const attachIsTable      = await isBaseTable(client, 'public', 'project_attachments');

  // ── 1. projects → tickets.tickets (type='project', parent_id NULL) ─────────
  if (projectsIsTable) {
    const projects = (await client.query(`
      SELECT id, brand, name, description, notes, start_date, due_date,
             status, priority, customer_id, admin_id, created_at, updated_at
        FROM projects ORDER BY created_at`)).rows;
    for (const p of projects) {
      const exists = await client.query(
        `SELECT id FROM tickets.tickets WHERE id = $1`, [p.id]);
      if (exists.rowCount > 0) { out.projectsSkipped++; continue; }
      if (dryRun) { out.projectsMigrated++; continue; }
      const m = STATUS_MAP[p.status];
      if (!m) { console.warn(`WARN: unknown project status "${p.status}" for ${p.id} — defaulting to backlog`); out.unknownStatus++; }
      const mapped = m ?? STATUS_MAP.entwurf;
      await client.query(
        `INSERT INTO tickets.tickets
           (id, type, brand, title, description, notes, status, resolution,
            priority, customer_id, assignee_id, start_date, due_date,
            done_at, archived_at, created_at, updated_at)
         VALUES ($1,'project',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.brand, p.name, p.description, p.notes,
         mapped.status, mapped.resolution, p.priority,
         p.customer_id, p.admin_id, p.start_date, p.due_date,
         mapped.doneAt ? p.updated_at : null,
         mapped.archivedAt ? p.updated_at : null,
         p.created_at, p.updated_at]);
      out.projectsMigrated++;
    }
  }

  // ── 2. sub_projects → tickets.tickets (type='project', parent_id = project) ─
  if (subProjectsIsTable) {
    const subs = (await client.query(`
      SELECT sp.id, sp.project_id, p.brand, sp.name, sp.description, sp.notes,
             sp.start_date, sp.due_date, sp.status, sp.priority,
             sp.customer_id, sp.admin_id, sp.created_at, sp.updated_at
        FROM sub_projects sp
        JOIN projects p ON p.id = sp.project_id
       ORDER BY sp.created_at`)).rows;
    for (const sp of subs) {
      const exists = await client.query(
        `SELECT id FROM tickets.tickets WHERE id = $1`, [sp.id]);
      if (exists.rowCount > 0) { out.subProjectsSkipped++; continue; }
      if (dryRun) { out.subProjectsMigrated++; continue; }
      const m = STATUS_MAP[sp.status];
      if (!m) { console.warn(`WARN: unknown sub_project status "${sp.status}" for ${sp.id} — defaulting to backlog`); out.unknownStatus++; }
      const mapped = m ?? STATUS_MAP.entwurf;
      await client.query(
        `INSERT INTO tickets.tickets
           (id, type, parent_id, brand, title, description, notes, status, resolution,
            priority, customer_id, assignee_id, start_date, due_date,
            done_at, archived_at, created_at, updated_at)
         VALUES ($1,'project',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [sp.id, sp.project_id, sp.brand, sp.name, sp.description, sp.notes,
         mapped.status, mapped.resolution, sp.priority,
         sp.customer_id, sp.admin_id, sp.start_date, sp.due_date,
         mapped.doneAt ? sp.updated_at : null,
         mapped.archivedAt ? sp.updated_at : null,
         sp.created_at, sp.updated_at]);
      out.subProjectsMigrated++;
    }
  }

  // ── 3. project_tasks → tickets.tickets (type='task',
  //      parent_id = sub_project_id ?? project_id) ───────────────────────────
  if (tasksIsTable) {
    const tasks = (await client.query(`
      SELECT pt.id, pt.project_id, pt.sub_project_id, p.brand,
             pt.name, pt.description, pt.notes, pt.start_date, pt.due_date,
             pt.status, pt.priority, pt.customer_id, pt.admin_id,
             pt.created_at, pt.updated_at
        FROM project_tasks pt
        JOIN projects p ON p.id = pt.project_id
       ORDER BY pt.created_at`)).rows;
    for (const t of tasks) {
      const exists = await client.query(
        `SELECT id FROM tickets.tickets WHERE id = $1`, [t.id]);
      if (exists.rowCount > 0) { out.tasksSkipped++; continue; }
      if (dryRun) { out.tasksMigrated++; continue; }
      const parentId = t.sub_project_id ?? t.project_id;
      const m = STATUS_MAP[t.status];
      if (!m) { console.warn(`WARN: unknown task status "${t.status}" for ${t.id} — defaulting to backlog`); out.unknownStatus++; }
      const mapped = m ?? STATUS_MAP.entwurf;
      await client.query(
        `INSERT INTO tickets.tickets
           (id, type, parent_id, brand, title, description, notes, status, resolution,
            priority, customer_id, assignee_id, start_date, due_date,
            done_at, archived_at, created_at, updated_at)
         VALUES ($1,'task',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [t.id, parentId, t.brand, t.name, t.description, t.notes,
         mapped.status, mapped.resolution, t.priority,
         t.customer_id, t.admin_id, t.start_date, t.due_date,
         mapped.doneAt ? t.updated_at : null,
         mapped.archivedAt ? t.updated_at : null,
         t.created_at, t.updated_at]);
      out.tasksMigrated++;
    }
  }

  // ── 4. project_attachments → tickets.ticket_attachments ────────────────────
  if (attachIsTable) {
    const atts = (await client.query(`
      SELECT id, project_id, filename, nc_path, mime_type, file_size, uploaded_at
        FROM project_attachments ORDER BY uploaded_at`)).rows;
    for (const a of atts) {
      const exists = await client.query(
        `SELECT id FROM tickets.ticket_attachments WHERE id = $1`, [a.id]);
      if (exists.rowCount > 0) { out.attachmentsSkipped++; continue; }
      if (dryRun) { out.attachmentsMigrated++; continue; }
      const parent = await client.query(
        `SELECT id FROM tickets.tickets WHERE id = $1 AND type = 'project'`,
        [a.project_id]);
      if (parent.rowCount === 0) {
        console.warn(`WARN: attachment ${a.id} references missing project ${a.project_id} — skipping`);
        out.attachmentsSkipped++; continue;
      }
      await client.query(
        `INSERT INTO tickets.ticket_attachments
           (id, ticket_id, filename, nc_path, mime_type, file_size, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.project_id, a.filename, a.nc_path, a.mime_type, a.file_size, a.uploaded_at]);
      out.attachmentsMigrated++;
    }
  }

  if (dryRun) return out;

  // ── 5. Discover external FKs targeting the legacy tables ──────────────────
  // We look up constraints dynamically rather than hard-coding names so
  // any non-standard naming on either cluster still gets caught. Each FK
  // target is one of the legacy four; any table NOT in that set with such
  // an FK gets re-pointed. Order: drop → rename → re-add (in the new shape).
  const fkRows = (await client.query(`
    SELECT con.conname, cls.relname AS tabname,
           col.attname AS colname,
           con.confdeltype AS deltype
      FROM pg_constraint con
      JOIN pg_class      cls ON cls.oid = con.conrelid
      JOIN pg_class      ref ON ref.oid = con.confrelid
      JOIN pg_attribute  col ON col.attrelid = con.conrelid AND col.attnum = ANY(con.conkey)
     WHERE con.contype = 'f'
       AND ref.relname IN ('projects','sub_projects','project_tasks','project_attachments')
       AND cls.relname NOT IN ('projects','sub_projects','project_tasks','project_attachments')
  `)).rows;

  // deltype: 'a'=NO ACTION, 'r'=RESTRICT, 'c'=CASCADE, 'n'=SET NULL, 'd'=SET DEFAULT.
  const DELTYPE = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };

  // ── 6. Drop the old FKs (so the rename in §7 doesn't trip dependency errors).
  for (const fk of fkRows) {
    await client.query(
      `ALTER TABLE ${pgIdent(fk.tabname)} DROP CONSTRAINT ${pgIdent(fk.conname)}`);
  }

  // ── 7. Rename legacy tables → *_legacy ─────────────────────────────────────
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='project_attachments') THEN
        EXECUTE 'ALTER TABLE project_attachments RENAME TO project_attachments_legacy';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='project_tasks') THEN
        EXECUTE 'ALTER TABLE project_tasks RENAME TO project_tasks_legacy';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sub_projects') THEN
        EXECUTE 'ALTER TABLE sub_projects RENAME TO sub_projects_legacy';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='projects') THEN
        EXECUTE 'ALTER TABLE projects RENAME TO projects_legacy';
      END IF;
    END $$
  `);

  // ── 8. Re-add the FKs pointing at tickets.tickets(id), preserving ON DELETE.
  //      Existing rows already satisfy the new FK because UUIDs were preserved.
  for (const fk of fkRows) {
    const onDelete = DELTYPE[fk.deltype] ?? 'NO ACTION';
    await client.query(
      `ALTER TABLE ${pgIdent(fk.tabname)}
         ADD CONSTRAINT ${pgIdent(fk.conname)}
         FOREIGN KEY (${pgIdent(fk.colname)}) REFERENCES tickets.tickets(id)
         ON DELETE ${onDelete}`);
    out.fksRePointed++;
  }

  // ── 9. Back-compat views ───────────────────────────────────────────────────
  // Helper function for status mapping back to old enum (lossy on
  // backlog→entwurf and in_review→aktiv collisions, accepted per plan header).
  await client.query(`
    CREATE OR REPLACE FUNCTION tickets._project_status_back(s TEXT)
      RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $fn$
      SELECT CASE s
        WHEN 'triage'      THEN 'entwurf'
        WHEN 'backlog'     THEN 'entwurf'
        WHEN 'in_progress' THEN 'aktiv'
        WHEN 'in_review'   THEN 'aktiv'
        WHEN 'blocked'     THEN 'wartend'
        WHEN 'done'        THEN 'erledigt'
        WHEN 'archived'    THEN 'archiviert'
        ELSE 'entwurf'
      END
    $fn$
  `);

  await client.query(`
    CREATE OR REPLACE VIEW projects AS
    SELECT t.id, t.brand, t.title AS name, t.description, t.notes,
           t.start_date, t.due_date,
           tickets._project_status_back(t.status) AS status,
           t.priority,
           t.customer_id, t.assignee_id AS admin_id,
           t.created_at, t.updated_at
      FROM tickets.tickets t
     WHERE t.type='project' AND t.parent_id IS NULL
  `);
  out.viewsCreated++;

  await client.query(`
    CREATE OR REPLACE VIEW sub_projects AS
    SELECT t.id, t.parent_id AS project_id,
           t.title AS name, t.description, t.notes,
           t.start_date, t.due_date,
           tickets._project_status_back(t.status) AS status,
           t.priority,
           t.customer_id, t.assignee_id AS admin_id,
           t.created_at, t.updated_at
      FROM tickets.tickets t
     WHERE t.type='project' AND t.parent_id IS NOT NULL
  `);
  out.viewsCreated++;

  await client.query(`
    CREATE OR REPLACE VIEW project_tasks AS
    SELECT t.id,
           COALESCE(parent.parent_id, t.parent_id) AS project_id,
           CASE WHEN parent.parent_id IS NOT NULL THEN t.parent_id ELSE NULL END
             AS sub_project_id,
           t.title AS name, t.description, t.notes,
           t.start_date, t.due_date,
           tickets._project_status_back(t.status) AS status,
           t.priority,
           t.customer_id, t.assignee_id AS admin_id,
           t.created_at, t.updated_at
      FROM tickets.tickets t
      LEFT JOIN tickets.tickets parent ON parent.id = t.parent_id
     WHERE t.type='task'
  `);
  out.viewsCreated++;

  await client.query(`
    CREATE OR REPLACE VIEW project_attachments AS
    SELECT a.id, a.ticket_id AS project_id, a.filename, a.nc_path,
           a.mime_type, COALESCE(a.file_size, 0) AS file_size, a.uploaded_at
      FROM tickets.ticket_attachments a
      JOIN tickets.tickets t ON t.id = a.ticket_id
     WHERE t.type='project'
  `);
  out.viewsCreated++;

  // ── 10. Make sure the website role can SELECT on the new views.
  //       (PR #566 set default privileges, but be explicit for new views.)
  await client.query(`GRANT SELECT ON projects, sub_projects, project_tasks, project_attachments TO website`);

  return out;
}

// Quote a Postgres identifier for safe interpolation (used only for known
// schema/constraint/column names from pg_catalog — never user input).
function pgIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (apply) await client.query('BEGIN');
    const r = await migrate(client, !apply);
    if (apply) await client.query('COMMIT');
    console.log(JSON.stringify({ ...r, mode: apply ? 'apply' : 'dry-run' }));
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
    console.error(err.message);
    process.exit(1);
  }
  await client.end();
}
main();
```

- [ ] **Step 2: Sanity-syntax-check the script.**

Run: `node --check scripts/migrate-projects-to-tickets.mjs`
Expected: no output (success).

- [ ] **Step 3: Dry-run against a port-forwarded mentolder DB.**

In one terminal:
```bash
task workspace:port-forward ENV=mentolder
```
In another:
```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-projects-to-tickets.mjs
```
Expected: a JSON line like:
`{"projectsMigrated":N1,"projectsSkipped":0,"subProjectsMigrated":N2,...,"mode":"dry-run"}`
where N1 ≈ count of `projects`, N2 ≈ count of `sub_projects`, tasks ≈ count of `project_tasks`. `unknownStatus` should be 0; if it's > 0, the warning lines preceding will tell you which statuses to check before applying.

Sanity reference:
```bash
PSQL='psql -X -A -t'
for tbl in projects sub_projects project_tasks project_attachments; do
  echo -n "$tbl: "
  $PSQL "postgres://postgres:${PG_PW}@localhost:5432/website" -c "SELECT count(*) FROM $tbl"
done
```
The dry-run JSON's `*Migrated` numbers should match (since nothing's been applied yet, zero are skipped).

- [ ] **Step 4: Commit (script only, no apply yet).**

```bash
git add scripts/migrate-projects-to-tickets.mjs
git commit -m "feat(tickets): add scripts/migrate-projects-to-tickets.mjs (PR3/5)"
```

---

## Task 3: BATS unit tests for the migration

**Files:**
- Create: `tests/unit/tickets-projects-migration.bats`

**Pattern source:** `tests/unit/tickets-tracking-migration.bats` (PR2). Same `setup()`/`teardown()` shape, same prod-URL guard, same fixture-cleanup approach.

- [ ] **Step 1: Create the BATS file.**

```bash
#!/usr/bin/env bats
# Tests for scripts/migrate-projects-to-tickets.mjs.
# Skips if no shared-db is reachable. Cleans up its own fixture rows.
# Assumes TRACKING_DB_URL points at a non-prod DB authenticated as `postgres`
# (the migration uses ALTER TABLE … RENAME, which the website role can't do).

load '../helpers/load.bash'

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/migrate-projects-to-tickets.mjs"

# Fixture UUIDs — picked deterministically so teardown can remove them.
PROJ_ID='11111111-1111-1111-1111-111111111111'
SUB_ID='22222222-2222-2222-2222-222222222222'
TASK_ID='33333333-3333-3333-3333-333333333333'
DIRECT_TASK_ID='44444444-4444-4444-4444-444444444444'
ATT_ID='55555555-5555-5555-5555-555555555555'

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "migration: dry-run does not write" {
  local before
  before=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.tickets WHERE type IN ('project','task')" | tr -d ' ')
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" >/dev/null
  local after
  after=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.tickets WHERE type IN ('project','task')" | tr -d ' ')
  [ "$before" = "$after" ]
}

@test "migration: row-count parity (projects + sub_projects + project_tasks == tickets type IN project,task)" {
  # Captures the running total of rows currently in the legacy tables (or
  # _legacy if migration already ran), then re-runs --apply and asserts the
  # tickets-side count matches.
  local legacyP legacyS legacyT
  legacyP=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM projects UNION ALL SELECT 1 FROM projects_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)
  legacyS=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM sub_projects UNION ALL SELECT 1 FROM sub_projects_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)
  legacyT=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM (SELECT 1 FROM project_tasks UNION ALL SELECT 1 FROM project_tasks_legacy) x" 2>/dev/null \
    | tr -d ' ' || echo 0)

  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  local proj sub task
  proj=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NULL" | tr -d ' ')
  sub=$($PSQL "$TRACKING_DB_URL"  -c "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NOT NULL" | tr -d ' ')
  task=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM tickets.tickets WHERE type='task'" | tr -d ' ')

  [ "$proj" -ge "$legacyP" ]
  [ "$sub"  -ge "$legacyS" ]
  [ "$task" -ge "$legacyT" ]
}

@test "migration: --apply moves a fresh project row into tickets.tickets" {
  # The migration script reads from base-table `projects`; if it's already a view,
  # the test inserts a fresh row in legacy + tickets directly.
  local isTable
  isTable=$($PSQL "$TRACKING_DB_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='projects'" | tr -d ' ')
  if [ "$isTable" = "0" ]; then skip "projects already a view; legacy-path test N/A"; fi

  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO projects (id, brand, name, description, status, priority)
     VALUES ('$PROJ_ID', 'mentolder', 'BATS test project', 'desc', 'aktiv', 'mittel')
     ON CONFLICT (id) DO NOTHING"

  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT type, status, brand, title FROM tickets.tickets WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"project"* ]]
  [[ "$output" == *"in_progress"* ]]
  [[ "$output" == *"mentolder"* ]]
  [[ "$output" == *"BATS test project"* ]]
}

@test "migration: --apply twice is idempotent (no duplicates)" {
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*[01][[:space:]]*$ ]]
}

@test "migration: parent_id chain is intact (sub_project parent is a project)" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets c
       LEFT JOIN tickets.tickets p ON p.id = c.parent_id
      WHERE c.type='project' AND c.parent_id IS NOT NULL
        AND (p.id IS NULL OR p.type <> 'project' OR p.parent_id IS NOT NULL)"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*0[[:space:]]*$ ]] || { echo "orphan sub_project tickets: $output"; return 1; }
}

@test "migration: parent_id chain is intact (task parent is project or sub_project)" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM tickets.tickets c
       LEFT JOIN tickets.tickets p ON p.id = c.parent_id
      WHERE c.type='task' AND c.parent_id IS NOT NULL
        AND (p.id IS NULL OR p.type <> 'project')"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*0[[:space:]]*$ ]] || { echo "orphan task tickets: $output"; return 1; }
}

@test "migration: back-compat view 'projects' has the expected column shape" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='projects' ORDER BY column_name"
  [ "$status" -eq 0 ]
  for col in id brand name description notes start_date due_date status priority customer_id admin_id created_at updated_at; do
    [[ "$output" == *"$col"* ]] || { echo "missing column on projects view: $col"; return 1; }
  done
}

@test "migration: status round-trip — 'in_progress' surfaces as 'aktiv' through the projects view" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT status FROM projects WHERE id='$PROJ_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"aktiv"* ]]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.ticket_attachments WHERE id IN ('$ATT_ID')" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE id IN ('$DIRECT_TASK_ID','$TASK_ID','$SUB_ID','$PROJ_ID')" >/dev/null 2>&1 || true
  # Cover both pre-migration (base table) and post-migration (legacy) states.
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM project_attachments_legacy WHERE id='$ATT_ID'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM project_tasks_legacy WHERE id IN ('$DIRECT_TASK_ID','$TASK_ID')" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM sub_projects_legacy WHERE id='$SUB_ID'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM projects_legacy WHERE id='$PROJ_ID'" >/dev/null 2>&1 || true
}
```

- [ ] **Step 2: Run BATS locally against the port-forwarded DB.**

```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  bats tests/unit/tickets-projects-migration.bats
```
Expected: all tests pass (or skip cleanly if `TRACKING_DB_URL` is unset). The "row-count parity" test deliberately uses `>=` so a re-run after the migration is already applied still passes.

- [ ] **Step 3: Commit.**

```bash
git add tests/unit/tickets-projects-migration.bats
git commit -m "test(tickets): add BATS tests for projects→tickets migration (PR3/5)"
```

---

## Task 4: Rewrite the project helpers in `website/src/lib/website-db.ts`

This task is the bulk of the PR. The helpers stay in place and keep their signatures + return shapes — only their SQL changes. Each step replaces a contiguous block of code with the rewritten version. Apply them in order; the file compiles only after all steps land.

**Files:**
- Modify: `website/src/lib/website-db.ts` — sections at lines 1135–1740 (project helpers + portal + export) plus three stragglers at 2053 (`findProjectByName`), 2375 (`listTasksInMonth`), and 2407 (`listProjectsInMonth`).

- [ ] **Step 1: Read the current state of `website/src/lib/website-db.ts:1135-1740` and `:2053-2435` to confirm the line numbers below match.**

- [ ] **Step 2: Add the status-mapping helpers and the `initTicketsSchema` import at the top of the project section.**

In `website/src/lib/website-db.ts`, immediately after the `// ── Project Management ──` banner at line ~1135 (just before `export type ProjectStatus = …`), insert:

```ts
import { initTicketsSchema } from './tickets-db';

// Forward map — old project status → new ticket status + resolution.
// Used by createProject/updateProject/createSubProject/.../togglePortalTaskDone.
const STATUS_FWD: Record<string, { status: string; resolution: string | null }> = {
  entwurf:    { status: 'backlog',     resolution: null      },
  geplant:    { status: 'backlog',     resolution: null      },
  wartend:    { status: 'blocked',     resolution: null      },
  aktiv:      { status: 'in_progress', resolution: null      },
  erledigt:   { status: 'done',        resolution: 'shipped' },
  archiviert: { status: 'archived',    resolution: 'shipped' },
};

function mapStatusFwd(s: string): { status: string; resolution: string | null } {
  return STATUS_FWD[s] ?? { status: 'backlog', resolution: null };
}

// SQL fragment that maps `tickets.status` back to the old `ProjectStatus`.
// Centralised so SELECT constants stay readable. Identical to the
// tickets._project_status_back() Postgres function the back-compat views use.
const STATUS_BACK_SQL = `
  CASE __TBL__.status
    WHEN 'triage'      THEN 'entwurf'
    WHEN 'backlog'     THEN 'entwurf'
    WHEN 'in_progress' THEN 'aktiv'
    WHEN 'in_review'   THEN 'aktiv'
    WHEN 'blocked'     THEN 'wartend'
    WHEN 'done'        THEN 'erledigt'
    WHEN 'archived'    THEN 'archiviert'
    ELSE 'entwurf'
  END
`;
```

`STATUS_BACK_SQL` uses a literal `__TBL__` placeholder swapped per call site (e.g. `STATUS_BACK_SQL.replace(/__TBL__/g, 't')` for the project SELECT, `'parent'` for the parent-of-task case, etc.).

- [ ] **Step 3: Replace `PROJECT_SELECT` and `PROJECT_ORDER` (lines ~1280–1301).**

Find:

```ts
const PROJECT_SELECT = `
  SELECT p.id, p.brand, p.name, p.description, p.notes,
         p.start_date   AS "startDate",  p.due_date   AS "dueDate",
         p.status,      p.priority,
         p.customer_id  AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         p.admin_id     AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM sub_projects  sp WHERE sp.project_id = p.id) AS "subProjectCount",
         (SELECT COUNT(*)::int FROM project_tasks pt WHERE pt.project_id = p.id) AS "taskCount",
         p.created_at   AS "createdAt",  p.updated_at AS "updatedAt"
  FROM projects p
  LEFT JOIN customers c ON p.customer_id = c.id
  LEFT JOIN customers a ON p.admin_id    = a.id
`;

const PROJECT_ORDER = `
  ORDER BY
    CASE p.status WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
                  WHEN 'entwurf' THEN 3 WHEN 'erledigt' THEN 4 WHEN 'archiviert' THEN 5 ELSE 6 END,
    p.due_date ASC NULLS LAST, p.created_at DESC
`;
```

Replace with:

```ts
const PROJECT_SELECT = `
  SELECT t.id, t.brand, t.title AS name, t.description, t.notes,
         t.start_date   AS "startDate",  t.due_date   AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 't')}) AS status,
         t.priority,
         t.customer_id  AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         t.assignee_id  AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM tickets.tickets sp
            WHERE sp.parent_id = t.id AND sp.type = 'project') AS "subProjectCount",
         (SELECT COUNT(*)::int FROM tickets.tickets pt
            LEFT JOIN tickets.tickets sp ON sp.id = pt.parent_id AND sp.type = 'project'
           WHERE pt.type = 'task'
             AND (pt.parent_id = t.id OR sp.parent_id = t.id)) AS "taskCount",
         t.created_at   AS "createdAt",  t.updated_at AS "updatedAt"
  FROM tickets.tickets t
  LEFT JOIN customers c ON t.customer_id = c.id
  LEFT JOIN customers a ON t.assignee_id = a.id
`;

// Status order: in_progress → backlog/geplant → blocked → triage/entwurf → done → archived.
const PROJECT_ORDER = `
  ORDER BY
    CASE t.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                  WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                  WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    t.due_date ASC NULLS LAST, t.created_at DESC
`;
```

- [ ] **Step 4: Rewrite `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject` (lines ~1303–1362).**

Find the entire block from `export async function listProjects` through `export async function deleteProject(id: string): Promise<void> { ... }` and replace with:

```ts
export async function listProjects(filters: {
  brand: string; status?: string; priority?: string; customerId?: string; q?: string;
}): Promise<Project[]> {
  await initTicketsSchema();
  const { brand, status, priority, customerId, q } = filters;
  // Caller passes status in the OLD enum (entwurf/aktiv/...). Translate forward
  // to the tickets enum for the WHERE clause; pass NULL when no filter set.
  const newStatus = status ? mapStatusFwd(status).status : null;
  const result = await pool.query(
    `${PROJECT_SELECT}
     WHERE t.type = 'project' AND t.parent_id IS NULL
       AND t.brand = $1
       AND ($2::text IS NULL OR t.status      = $2)
       AND ($3::text IS NULL OR t.priority    = $3)
       AND ($4::uuid IS NULL OR t.customer_id = $4)
       AND ($5::text IS NULL OR t.title       ILIKE '%'||$5||'%'
                              OR t.description ILIKE '%'||$5||'%')
     ${PROJECT_ORDER}`,
    [brand, newStatus, priority ?? null, customerId ?? null, q ?? null]
  );
  return result.rows;
}

export async function getProject(id: string): Promise<Project | null> {
  await initTicketsSchema();
  const result = await pool.query(
    `${PROJECT_SELECT} WHERE t.id = $1 AND t.type = 'project' AND t.parent_id IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createProject(params: {
  brand: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Spec §6 invariant: type='project' tickets must have customer_id.
  if (!params.customerId) {
    throw new Error('createProject: customerId is required for type=project tickets');
  }
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('project', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [params.brand, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteProject(id: string): Promise<void> {
  // ON DELETE CASCADE on parent_id wipes child sub_projects and tasks via
  // the tickets.tickets self-referential FK, plus ticket_attachments and
  // any time_entries (post-migration FK now points at tickets.tickets).
  await pool.query(
    `DELETE FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [id]
  );
}
```

- [ ] **Step 5: Replace `SUBPROJECT_SELECT`, `SUBPROJECT_ORDER`, `listSubProjects`, `getSubProject`, `createSubProject`, `updateSubProject`, `deleteSubProject` (lines ~1366–1447).**

Find the block from `// Sub-Projects ────…` through `export async function deleteSubProject(id: string): Promise<void> { ... }` and replace with:

```ts
// Sub-Projects ────────────────────────────────────────────────────────────────

const SUBPROJECT_SELECT = `
  SELECT sp.id, sp.parent_id AS "projectId", sp.title AS name, sp.description, sp.notes,
         sp.start_date AS "startDate", sp.due_date AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 'sp')}) AS status,
         sp.priority,
         sp.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         sp.assignee_id AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM tickets.tickets pt
            WHERE pt.type = 'task' AND pt.parent_id = sp.id) AS "taskCount",
         sp.created_at AS "createdAt", sp.updated_at AS "updatedAt"
  FROM tickets.tickets sp
  LEFT JOIN customers c ON sp.customer_id = c.id
  LEFT JOIN customers a ON sp.assignee_id = a.id
`;

const SUBPROJECT_ORDER = `
  ORDER BY
    CASE sp.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                   WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                   WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    sp.due_date ASC NULLS LAST
`;

export async function listSubProjects(projectId: string): Promise<SubProject[]> {
  await initTicketsSchema();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.type='project' AND sp.parent_id=$1
     ${SUBPROJECT_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function getSubProject(id: string): Promise<SubProject | null> {
  await initTicketsSchema();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.id=$1 AND sp.type='project' AND sp.parent_id IS NOT NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSubProject(params: {
  projectId: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Inherit brand from the parent project ticket.
  const parent = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NULL`,
    [params.projectId]);
  if (parent.rowCount === 0) throw new Error(`createSubProject: parent project ${params.projectId} not found`);
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, parent_id, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('project', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [params.projectId, parent.rows[0].brand, params.name,
     params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateSubProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='project' AND parent_id IS NOT NULL`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteSubProject(id: string): Promise<void> {
  await pool.query(
    `DELETE FROM tickets.tickets WHERE id=$1 AND type='project' AND parent_id IS NOT NULL`,
    [id]
  );
}
```

- [ ] **Step 6: Replace `TASK_SELECT`, `TASK_ORDER`, `listDirectTasks`, `listSubProjectTasks`, `createProjectTask`, `updateProjectTask`, `deleteProjectTask` (lines ~1449–1527).**

Find the block from `// Project Tasks ───────…` through `export async function deleteProjectTask(id: string): Promise<void> { ... }` and replace with:

```ts
// Project Tasks ───────────────────────────────────────────────────────────────

const TASK_SELECT = `
  SELECT pt.id,
         COALESCE(parent.parent_id, pt.parent_id) AS "projectId",
         CASE WHEN parent.parent_id IS NOT NULL THEN pt.parent_id ELSE NULL END
           AS "subProjectId",
         pt.title AS name, pt.description, pt.notes,
         pt.start_date AS "startDate", pt.due_date AS "dueDate",
         (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
         pt.priority,
         pt.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         pt.assignee_id AS "adminId",
         a.name         AS "adminName",    a.email AS "adminEmail",
         pt.created_at AS "createdAt", pt.updated_at AS "updatedAt"
  FROM tickets.tickets pt
  LEFT JOIN tickets.tickets parent ON parent.id = pt.parent_id
  LEFT JOIN customers c ON pt.customer_id = c.id
  LEFT JOIN customers a ON pt.assignee_id = a.id
`;

const TASK_ORDER = `
  ORDER BY
    CASE pt.status WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
                   WHEN 'triage' THEN 3 WHEN 'in_review' THEN 4
                   WHEN 'done' THEN 5 WHEN 'archived' THEN 6 ELSE 7 END,
    pt.due_date ASC NULLS LAST
`;

export async function listDirectTasks(projectId: string): Promise<ProjectTask[]> {
  await initTicketsSchema();
  // "Direct" tasks have parent = the root project (parent.parent_id IS NULL).
  const result = await pool.query(
    `${TASK_SELECT}
     WHERE pt.type='task'
       AND pt.parent_id = $1
       AND parent.parent_id IS NULL
     ${TASK_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function listSubProjectTasks(subProjectId: string): Promise<ProjectTask[]> {
  await initTicketsSchema();
  const result = await pool.query(
    `${TASK_SELECT}
     WHERE pt.type='task' AND pt.parent_id=$1
     ${TASK_ORDER}`,
    [subProjectId]
  );
  return result.rows;
}

export async function createProjectTask(params: {
  projectId: string; subProjectId?: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initTicketsSchema();
  // Parent is sub_project_id when set, else project_id. Brand inherits from
  // whichever ticket we're attaching to.
  const parentId = params.subProjectId || params.projectId;
  const parent = await pool.query<{ brand: string }>(
    `SELECT brand FROM tickets.tickets WHERE id=$1 AND type='project'`, [parentId]);
  if (parent.rowCount === 0) throw new Error(`createProjectTask: parent ticket ${parentId} not found`);
  const m = mapStatusFwd(params.status);
  const result = await pool.query(
    `INSERT INTO tickets.tickets
       (type, parent_id, brand, title, description, notes, start_date, due_date,
        status, resolution, priority, customer_id, assignee_id)
     VALUES ('task', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [parentId, parent.rows[0].brand, params.name,
     params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProjectTask(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  const m = mapStatusFwd(params.status);
  await pool.query(
    `UPDATE tickets.tickets
       SET title=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
           status=$7, resolution=$8, priority=$9,
           customer_id=$10, assignee_id=$11, updated_at=now()
     WHERE id=$1 AND type='task'`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     m.status, m.resolution, params.priority,
     params.customerId || null, params.adminId || null]
  );
}

export async function deleteProjectTask(id: string): Promise<void> {
  await pool.query(`DELETE FROM tickets.tickets WHERE id=$1 AND type='task'`, [id]);
}
```

- [ ] **Step 7: Rewrite the attachment helpers (lines ~1541–1582).**

Find the block from `export async function listProjectAttachments` through `export async function deleteProjectAttachmentRecord(id: string): Promise<string | null> { ... }` and replace with:

```ts
export async function listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, ticket_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM tickets.ticket_attachments
     WHERE ticket_id = $1
     ORDER BY uploaded_at DESC`,
    [projectId]
  );
  return r.rows;
}

export async function getProjectAttachment(id: string): Promise<ProjectAttachment | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `SELECT id, ticket_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", COALESCE(file_size, 0)::bigint AS "fileSize",
            uploaded_at AS "uploadedAt"
     FROM tickets.ticket_attachments WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createProjectAttachment(params: {
  projectId: string; filename: string; ncPath: string; mimeType: string; fileSize: number;
}): Promise<string> {
  await initTicketsSchema();
  const r = await pool.query(
    `INSERT INTO tickets.ticket_attachments
       (ticket_id, filename, nc_path, mime_type, file_size)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [params.projectId, params.filename, params.ncPath, params.mimeType, params.fileSize]
  );
  return r.rows[0].id;
}

export async function deleteProjectAttachmentRecord(id: string): Promise<string | null> {
  await initTicketsSchema();
  const r = await pool.query(
    `DELETE FROM tickets.ticket_attachments WHERE id = $1 RETURNING nc_path`,
    [id]
  );
  return r.rows[0]?.nc_path ?? null;
}
```

- [ ] **Step 8: Rewrite the portal helpers (lines ~1602–1665).**

Find `export async function listProjectsForCustomer` through `export async function togglePortalTaskDone(...)` and replace with:

```ts
export async function listProjectsForCustomer(keycloakUserId: string): Promise<PortalProject[]> {
  await initTicketsSchema();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return [];
  const customerId = cust.rows[0].id;

  // Projects: customer's own, not archived. Surface OLD status for the
  // existing portal UI labels.
  const projects = await pool.query<{ id: string; name: string; description: string | null; status: string; due_date: Date | null }>(
    `SELECT id, title AS name, description,
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 't')}) AS status,
            due_date
       FROM tickets.tickets t
      WHERE type='project' AND parent_id IS NULL
        AND customer_id = $1 AND status <> 'archived'
      ORDER BY created_at DESC`,
    [customerId],
  );

  const result: PortalProject[] = [];
  for (const p of projects.rows) {
    // Tasks under this project: direct children OR children of any sub_project.
    const tasks = await pool.query<{ id: string; name: string; status: string; customer_id: string | null }>(
      `SELECT pt.id, pt.title AS name,
              (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
              pt.customer_id
         FROM tickets.tickets pt
         LEFT JOIN tickets.tickets sp ON sp.id = pt.parent_id AND sp.type = 'project'
        WHERE pt.type='task' AND (pt.parent_id = $1 OR sp.parent_id = $1)
        ORDER BY pt.created_at ASC`,
      [p.id],
    );
    result.push({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      dueDate: p.due_date,
      tasks: tasks.rows.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        isUserTask: t.customer_id === customerId,
      })),
    });
  }
  return result;
}

export async function togglePortalTaskDone(taskId: string, keycloakUserId: string): Promise<{ ok: boolean }> {
  await initTicketsSchema();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return { ok: false };
  const customerId = cust.rows[0].id;

  const task = await pool.query<{ status: string }>(
    `SELECT status FROM tickets.tickets WHERE id = $1 AND type='task' AND customer_id = $2`,
    [taskId, customerId],
  );
  if (!task.rows[0]) return { ok: false };

  // Toggle between done and in_progress (the new-enum equivalents of erledigt/aktiv).
  const flippingClosed = task.rows[0].status === 'done';
  const newStatus     = flippingClosed ? 'in_progress' : 'done';
  const newResolution = flippingClosed ? null          : 'shipped';
  await pool.query(
    `UPDATE tickets.tickets
        SET status = $1, resolution = $2,
            done_at = CASE WHEN $1 = 'done' THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $3 AND type='task'`,
    [newStatus, newResolution, taskId],
  );
  return { ok: true };
}
```

- [ ] **Step 9: Remove `initProjectTables` and inline its `customers` ALTER calls into a small new init.**

Find the entire `initProjectTables` function (lines ~1206–1278). Replace it with:

```ts
// Customers table extensions used by the project module. Idempotent.
let customerExtsReady = false;
async function initCustomerProjectExts(): Promise<void> {
  if (customerExtsReady) return;
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_number TEXT UNIQUE`);
  customerExtsReady = true;
}
```

Then in every helper that previously did `await initProjectTables();`, replace with `await initTicketsSchema(); await initCustomerProjectExts();` if the helper reads `customers.is_admin`/`admin_number` (i.e. `listProjects`, `listSubProjects`, `listDirectTasks`, `listSubProjectTasks`, `getProject`, `getSubProject`, `findProjectByName`, `listTasksInMonth`, `listProjectsInMonth`, `listAllCustomers`, `listAdminUsers`, `getCustomerByEmail`, `listProjectsForCustomer`, `togglePortalTaskDone`). For helpers that don't (`createProject`/`updateProject`/`deleteProject` and counterparts), only `await initTicketsSchema()` is needed.

Note: this means `init` calls are now spread across the file. Search for every literal `await initProjectTables()` and replace per the above rule. There should be exactly the call sites currently pointing to `initProjectTables` — once you've replaced them all, the function definition is dead code (and removable).

- [ ] **Step 10: Rewrite `findProjectByName` (lines ~2053–2068).**

Replace:

```ts
export async function findProjectByName(
  brand: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  await initProjectTables();
  const result = await pool.query(
    `SELECT id, name FROM projects
     WHERE brand = $1 AND name ILIKE $2
     ORDER BY CASE status
       WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
       ELSE 3 END
     LIMIT 1`,
    [brand, `%${name}%`]
  );
  return result.rows[0] ?? null;
}
```

with:

```ts
export async function findProjectByName(
  brand: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  await initTicketsSchema();
  const result = await pool.query(
    `SELECT id, title AS name FROM tickets.tickets
     WHERE type='project' AND parent_id IS NULL
       AND brand = $1 AND title ILIKE $2
     ORDER BY CASE status
       WHEN 'in_progress' THEN 0 WHEN 'backlog' THEN 1 WHEN 'blocked' THEN 2
       ELSE 3 END
     LIMIT 1`,
    [brand, `%${name}%`]
  );
  return result.rows[0] ?? null;
}
```

- [ ] **Step 11: Rewrite `listTasksInMonth` (lines ~2375–2394).**

Replace:

```ts
export async function listTasksInMonth(year: number, month: number): Promise<CalendarTask[]> {
  await initProjectTables();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT pt.id,
            pt.name,
            pt.project_id AS "projectId",
            p.name        AS "projectName",
            pt.due_date   AS "dueDate",
            pt.status,
            pt.priority
     FROM project_tasks pt
     JOIN projects p ON p.id = pt.project_id
     WHERE pt.due_date BETWEEN $1::date AND $2::date
     ORDER BY pt.due_date ASC, pt.priority DESC`,
    [firstDay, lastDay]
  );
  return result.rows;
}
```

with:

```ts
export async function listTasksInMonth(year: number, month: number): Promise<CalendarTask[]> {
  await initTicketsSchema();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT pt.id,
            pt.title AS name,
            COALESCE(parent.parent_id, pt.parent_id) AS "projectId",
            COALESCE(root.title, parent.title)       AS "projectName",
            pt.due_date AS "dueDate",
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 'pt')}) AS status,
            pt.priority
     FROM tickets.tickets pt
     LEFT JOIN tickets.tickets parent ON parent.id = pt.parent_id
     LEFT JOIN tickets.tickets root   ON root.id   = parent.parent_id
     WHERE pt.type='task'
       AND pt.due_date BETWEEN $1::date AND $2::date
     ORDER BY pt.due_date ASC, pt.priority DESC`,
    [firstDay, lastDay]
  );
  return result.rows;
}
```

- [ ] **Step 12: Rewrite `listProjectsInMonth` (lines ~2407–2432).**

Replace:

```ts
export async function listProjectsInMonth(year: number, month: number, brand?: string): Promise<CalendarProject[]> {
  await initProjectTables();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query<CalendarProject>(
    `SELECT p.id,
            p.name,
            p.status,
            p.priority,
            p.customer_id  AS "customerId",
            c.name         AS "customerName",
            p.start_date   AS "startDate",
            p.due_date     AS "dueDate"
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.status NOT IN ('archiviert', 'erledigt')
       AND ($1::text IS NULL OR p.brand = $1)
       AND (
         (p.start_date BETWEEN $2::date AND $3::date)
         OR (p.due_date BETWEEN $2::date AND $3::date)
       )
     ORDER BY COALESCE(p.start_date, p.due_date) ASC`,
    [brand ?? null, firstDay, lastDay]
  );
  return result.rows;
}
```

with:

```ts
export async function listProjectsInMonth(year: number, month: number, brand?: string): Promise<CalendarProject[]> {
  await initTicketsSchema();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query<CalendarProject>(
    `SELECT p.id,
            p.title AS name,
            (${STATUS_BACK_SQL.replace(/__TBL__/g, 'p')}) AS status,
            p.priority,
            p.customer_id AS "customerId",
            c.name        AS "customerName",
            p.start_date  AS "startDate",
            p.due_date    AS "dueDate"
     FROM tickets.tickets p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.type='project' AND p.parent_id IS NULL
       AND p.status NOT IN ('archived', 'done')
       AND ($1::text IS NULL OR p.brand = $1)
       AND (
         (p.start_date BETWEEN $2::date AND $3::date)
         OR (p.due_date BETWEEN $2::date AND $3::date)
       )
     ORDER BY COALESCE(p.start_date, p.due_date) ASC`,
    [brand ?? null, firstDay, lastDay]
  );
  return result.rows;
}
```

- [ ] **Step 13: Run TypeScript compile.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

If you get errors about unused imports, remove them. If you get errors about missing exports from `tickets-db.ts`, double-check Task 1 landed (the `notes` column doesn't change exports, but `initTicketsSchema` must still be exported — it already is).

- [ ] **Step 14: Commit.**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(tickets): rewire project helpers to read/write tickets.tickets (PR3/5)"
```

---

## Task 5: Smoke test the rewired site against a port-forwarded mentolder DB

**Files:** none (operational).

This catches obvious SQL errors before the PR is opened. The migration script hasn't run, so `tickets.tickets` is empty for type='project'/'task' — the projekte page should render empty without errors.

- [ ] **Step 1: Start a port-forward in one terminal.**

```bash
task workspace:port-forward ENV=mentolder
```

- [ ] **Step 2: Start the website dev server with the right env in another.**

```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
WEBSITE_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
BRAND_ID=mentolder \
  task website:dev
```
Expected: Astro starts on http://localhost:4321 with no startup errors.

- [ ] **Step 3: Hit `/admin/projekte` (admin-authed). It should render an empty list.**

Confirm in the browser console + network tab that:
- `/api/admin/projekte/...` calls return 200.
- No "relation does not exist" or "syntax error" pg errors in the dev server log.
- The Gantt section toggles open without throwing.

If you see SQL errors, the most likely cause is a typo in the rewritten SQL. Read the offending log line, find the mismatch in the helper, fix, save, refresh.

- [ ] **Step 4: Stop the dev server and port-forward.**

No commit here — we're only verifying.

---

## Task 6: Open the PR and merge

**Files:** none (git/gh).

- [ ] **Step 1: Push the branch and open the PR.**

```bash
git push -u origin feature/tickets-pr3
gh pr create --title "feat(tickets): migrate projects+sub_projects+tasks into tickets schema (PR3/5)" \
  --body "$(cat <<'EOF'
## Summary
Third of 5 unified-ticketing PRs. PR1 (#562) created the tickets schema and migrated bug_tickets; PR2 (#565) migrated requirements/features and added pr_events. PR3 lifts the admin project hierarchy.

**Spec:** `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md`
**Plan:** `docs/superpowers/plans/2026-05-08-unified-ticketing-pr3.md`

### What changes
- `tickets.tickets` gets a nullable `notes` column (idempotent `ADD COLUMN IF NOT EXISTS` in `initTicketsSchema`).
- `scripts/migrate-projects-to-tickets.mjs` (new, idempotent, `--apply`-gated, runs as `postgres`):
  1. Copies `projects` → `tickets.tickets` (type='project', parent_id NULL).
  2. Copies `sub_projects` → `tickets.tickets` (type='project', parent_id = parent project, brand inherited via JOIN).
  3. Copies `project_tasks` → `tickets.tickets` (type='task', parent_id = sub_project_id ?? project_id).
  4. Copies `project_attachments` → `tickets.ticket_attachments`.
  5. Atomically re-points external FKs (`meetings.project_id`, `time_entries.project_id`, `time_entries.task_id`, `booking_project_links.project_id`) at `tickets.tickets(id)`. UUIDs are preserved end-to-end so existing rows continue to satisfy the new constraints.
  6. Renames `projects` / `sub_projects` / `project_tasks` / `project_attachments` to `*_legacy` and replaces them with back-compat views over the new schema.
  7. Defines `tickets._project_status_back()` so the views and the website helpers share the exact same status-mapping function.
- `website/src/lib/website-db.ts` — every project helper rewritten to read/write `tickets.tickets` directly. `Project` / `SubProject` / `ProjectTask` / `ProjectAttachment` return shapes are unchanged so `/admin/projekte` and the Gantt visualization render identically. Status mapping happens in SQL via a centralised `STATUS_BACK_SQL` snippet.
- `createProject` now throws if `customer_id` is missing (spec §6 invariant). Migrated rows that already have NULL `customer_id` are tolerated.

### What stays unchanged
- `/admin/projekte`, `/admin/projekte/[id]`, the Gantt toggle, the Astro/Svelte markup — none of those files are touched.
- `/admin/kunden/<id>` keeps showing a customer's projects through `listProjects({ customerId })`.
- `/api/portal/projekte` and `/api/portal/projekttasks/toggle` keep working with the same response shape.
- CSV export `/api/admin/projekte/export.ts` keeps working — it goes through `listProjects` / `listSubProjects` / `listSubProjectTasks` which are all rewired in place.
- `pipeline`, `test_results`, `tickets.pr_events`, `bachelorprojekt.v_timeline` — untouched (PR1/PR2 territory).

### Required human follow-up (Deploy Runbook)
After this PR merges and ArgoCD rolls the website pod on both clusters:
1. `task workspace:backup` — manual safety backup.
2. **Per env**, with `task workspace:port-forward ENV=<env>` running in another terminal:
   ```
   PG_PW=$(kubectl --context <env> -n workspace get secret workspace-secrets \
     -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
   TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
     node scripts/migrate-projects-to-tickets.mjs --apply
   ```
   Expected output: `{"projectsMigrated":N1,"subProjectsMigrated":N2,"tasksMigrated":N3,"attachmentsMigrated":N4,"fksRePointed":N5,"viewsCreated":4,...,"mode":"apply"}`. `unknownStatus` should be 0.
3. Smoke `https://web.<brand>.de/admin/projekte` — projects list + Gantt should match pre-migration counts/shapes on both brands.
4. Smoke `https://web.<brand>.de/admin/kunden/<some-id>` — customer's projects list still appears.

Visibility gap: while the website pod is rolling and the migration script hasn't been run yet, `/admin/projekte` shows an empty list. Running migration immediately after merge keeps this to ~5 minutes.

### Migration risk-reduction
- Dry-run is the default; `--apply` is opt-in.
- All work happens inside one BEGIN/COMMIT — any failure rolls back FK changes and rename together.
- `task workspace:backup` runs before `--apply` on prod.
- Old tables aren't dropped — they're renamed to `*_legacy` (PR5 will drop). Rollback: drop the four views, rename `*_legacy` back, drop the new FKs, re-add the old FKs to the renamed-back tables, redeploy the previous website image.

## Test plan
- [ ] `task test:all` (BATS unit + manifest validation) green
- [ ] `tests/unit/tickets-projects-migration.bats` passes against a port-forward
- [ ] `task website:dev` against a port-forwarded mentolder DB renders `/admin/projekte` with no console errors (Task 5)
- [ ] Post-migration: `https://web.mentolder.de/admin/projekte` and `https://web.korczewski.de/admin/projekte` both render the same projects + Gantt as before
- [ ] Customer detail page `https://web.<brand>.de/admin/kunden/<id>` still lists the customer's projects
- [ ] `tests/e2e/specs/fa-04-files.spec.ts` (the spec that touches `/api/admin/projekte/attachments` etc.) keeps passing post-migration
EOF
)"
```

- [ ] **Step 2: Watch CI and merge.**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Per repo memory `feedback_pr_workflow.md`, merge immediately on green.

---

## Task 7: Run the migration on both clusters

**Files:** none (operational).

This is the actual data move. Order: backup → mentolder → smoke → korczewski → smoke. The runbook expects ArgoCD to have already rolled the website pods (it does so within ~5 minutes of merge — confirm with `kubectl --context <env> rollout status deploy/website -n <ns>` if you want to be sure).

- [ ] **Step 1: Take a fresh backup.**

```bash
task workspace:backup
task workspace:backup:list | head -5
```
Expected: a new timestamp from the past few minutes.

- [ ] **Step 2: Confirm the website pods on both clusters are running the new image.**

```bash
kubectl --context mentolder    -n workspace             rollout status deploy/website
kubectl --context korczewski   -n workspace-korczewski  rollout status deploy/website
```
Both should report `successfully rolled out`.

- [ ] **Step 3: Migrate mentolder.**

In one terminal:
```bash
task workspace:port-forward ENV=mentolder
```

In another:
```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# 1. Dry-run first.
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-projects-to-tickets.mjs

# 2. If the JSON output looks reasonable (non-zero migrated counts, zero unknownStatus), apply.
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-projects-to-tickets.mjs --apply
```
Expected (dry-run): `{"projectsMigrated":N1,"subProjectsMigrated":N2,"tasksMigrated":N3,"attachmentsMigrated":N4,"fksRePointed":0,"viewsCreated":0,...,"mode":"dry-run"}` (FKs/views only land on apply).
Expected (--apply): same counts with `"fksRePointed":4,"viewsCreated":4,"mode":"apply"`.

Verify:
```bash
PSQL='psql -X -A -t -v ON_ERROR_STOP=1'
$PSQL "postgres://postgres:${PG_PW}@localhost:5432/website" -c \
  "SELECT type, count(*) FROM tickets.tickets WHERE type IN ('project','task') GROUP BY type"
$PSQL "postgres://postgres:${PG_PW}@localhost:5432/website" -c \
  "SELECT count(*) FROM tickets.ticket_attachments
     WHERE ticket_id IN (SELECT id FROM tickets.tickets WHERE type='project')"
```
The first count should match `projects + sub_projects` (split as type='project' rows), `tasks` should match `project_tasks` row count.

- [ ] **Step 4: Smoke mentolder.**

Open `https://web.mentolder.de/admin/projekte` in a browser. Confirm:
- The project list shows the same projects as before.
- Gantt toggle reveals the same bars.
- Click into one project — sub-projects, tasks, attachments are all present.

If the page is empty: the migration may not have applied. Re-check the JSON output. If a 500 lands: check the website pod logs (`kubectl --context mentolder -n workspace logs -l app=website --tail=50`) for the SQL error.

- [ ] **Step 5: Migrate korczewski.**

Stop the mentolder port-forward (Ctrl+C). Repeat Step 3 with `ENV=korczewski`:

```bash
task workspace:port-forward ENV=korczewski
```

In the second terminal:
```bash
PG_PW=$(kubectl --context korczewski -n workspace-korczewski get secret workspace-secrets \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-projects-to-tickets.mjs
TRACKING_DB_URL="postgres://postgres:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-projects-to-tickets.mjs --apply
```
Note: `workspace-korczewski` namespace per repo memory `project_cluster_merge.md`.

- [ ] **Step 6: Smoke korczewski.**

Open `https://web.korczewski.de/admin/projekte`. Same checks as Step 4.

- [ ] **Step 7: Verify a customer detail page on each brand.**

```bash
# Pick the most recent customer with projects, then load their detail page.
$PSQL "postgres://postgres:${PG_PW}@localhost:5432/website" -c \
  "SELECT c.id FROM customers c
     JOIN tickets.tickets t ON t.customer_id = c.id AND t.type='project'
    GROUP BY c.id ORDER BY count(*) DESC LIMIT 1"
```
Open `https://web.korczewski.de/admin/kunden/<id>` — the customer's projects should appear.
Repeat with mentolder.

---

## Task 8: Self-review checklist (run before declaring PR3 done)

**Files:** none (manual review).

- [ ] **Spec coverage.** Every bullet in `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md:377-384` has a task or step that implements it. Cross-check:
  - projects → tickets type='project': Task 2 step 1 §1.
  - sub_projects → tickets type='project' with parent_id: Task 2 step 1 §2.
  - project_tasks → tickets type='task' with parent_id = sub_project_id ?? project_id: Task 2 step 1 §3.
  - project_attachments → tickets.ticket_attachments: Task 2 step 1 §4.
  - /admin/projekte and Gantt rewired: Task 4 (helpers in `website-db.ts`) — page markup unchanged.
  - Old tables become views: Task 2 step 1 §6–7.
- [ ] No reference to base table `projects`, `sub_projects`, `project_tasks`, `project_attachments` remains in `website/src/lib/website-db.ts`. `grep -nE 'FROM (projects|sub_projects|project_tasks|project_attachments)\b|REFERENCES (projects|sub_projects|project_tasks|project_attachments)\b' website/src/lib/website-db.ts` should yield no hits (the only mentions should be in comments or the legacy *_legacy names from migrations).
- [ ] All `await initProjectTables()` call sites have been replaced. `grep -n 'initProjectTables' website/src/lib/website-db.ts` should show only the (now removed) original definition was deleted, or the function definition has zero callers.
- [ ] `tickets.tickets` row counts on each cluster:
  ```
  $PSQL "...website" -c "SELECT type, count(*) FROM tickets.tickets GROUP BY type"
  ```
  Counts for `type='project'` (root + sub-project) match `projects_legacy + sub_projects_legacy`, and `type='task'` matches `project_tasks_legacy`.
- [ ] Each post-migration FK on `meetings`, `time_entries`, `booking_project_links` references `tickets.tickets`:
  ```
  $PSQL "...website" -c \
    "SELECT con.conname, cls.relname AS tab, ref.relname AS ref
       FROM pg_constraint con
       JOIN pg_class cls ON cls.oid = con.conrelid
       JOIN pg_class ref ON ref.oid = con.confrelid
      WHERE con.contype='f'
        AND cls.relname IN ('meetings','time_entries','booking_project_links')"
  ```
  All `ref` values should be `tickets`.
- [ ] `tests/e2e/specs/fa-04-files.spec.ts` passes against `https://web.mentolder.de` post-migration.
- [ ] No PR opened during the deploy gap is missing from the timeline (`https://web.<brand>.de/api/timeline?limit=5` returns the most recent merge, including this one).
- [ ] `pipeline` and `test_results` tables are untouched.

---

## Open questions, deferred to PR4+

- **Status round-trip information loss.** PR3 collapses `entwurf`/`geplant` to `backlog`, and `aktiv`/`in_review` both surface as `aktiv`. PR4's unified UI uses the new enum directly, so this is a transitional issue only. Users editing legacy "geplant" projects today will see them as "entwurf" after one save round-trip — flagged so PR4's design review knows.
- **Notes column on tickets.** Adding `notes` extends the spec slightly. PR4 should decide whether to keep it as a separate field or fold it into `description` with a richer editor.
- **`booking_project_links.project_id` cleanup.** This table currently FK's to `tickets.tickets(id)` but the application logic still treats it as a project FK. If a non-project ticket id ever lands there, semantics get weird. Consider a CHECK constraint or an application-level guard in PR4.
- **Reverting PR3.** `BEGIN; DROP VIEW projects, sub_projects, project_tasks, project_attachments; ALTER TABLE projects_legacy RENAME TO projects; ALTER TABLE sub_projects_legacy RENAME TO sub_projects; ALTER TABLE project_tasks_legacy RENAME TO project_tasks; ALTER TABLE project_attachments_legacy RENAME TO project_attachments; DROP FUNCTION tickets._project_status_back(TEXT); <drop the new FKs from meetings/time_entries/booking_project_links and re-add the original ones to projects/project_tasks>; COMMIT;` — then redeploy the previous website image. The `tickets.tickets` rows of type='project'/'task' can be left in place or `DELETE FROM tickets.tickets WHERE type IN ('project','task')` for a full unwind.
