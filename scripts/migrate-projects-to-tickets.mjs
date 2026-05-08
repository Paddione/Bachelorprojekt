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

  // Make sure the new `notes` column exists. The website pod's
  // initTicketsSchema() also runs this, but the migration may be invoked
  // before any website request has hit the new image — in which case the
  // column would be missing and the INSERTs below would fail.
  await client.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS notes TEXT`);

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

  // Guard: this script handles single-column external FKs only. If any FK
  // ever becomes composite, the per-row ADD CONSTRAINT loop below would emit
  // duplicate constraints. Fail loudly instead.
  const compositeCheck = await client.query(`
    SELECT cls.relname AS tabname, con.conname,
           array_length(con.conkey, 1) AS ncols
      FROM pg_constraint con
      JOIN pg_class      cls ON cls.oid = con.conrelid
      JOIN pg_class      ref ON ref.oid = con.confrelid
     WHERE con.contype = 'f'
       AND ref.relname IN ('projects','sub_projects','project_tasks','project_attachments')
       AND cls.relname NOT IN ('projects','sub_projects','project_tasks','project_attachments')
       AND array_length(con.conkey, 1) > 1
  `);
  if (compositeCheck.rowCount > 0) {
    const offenders = compositeCheck.rows
      .map(r => `${r.tabname}.${r.conname} (${r.ncols} cols)`).join(', ');
    throw new Error(`Composite FK re-point not supported: ${offenders}`);
  }

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
