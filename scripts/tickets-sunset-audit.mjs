#!/usr/bin/env node
// scripts/tickets-sunset-audit.mjs
// Audits legacy table/view activity before running tickets-sunset.mjs.
// Usage: PGURL=postgres://website:…@localhost:5432/website node scripts/tickets-sunset-audit.mjs
import pg from 'pg';

const PGURL = process.env.PGURL ?? 'postgres://website:website@localhost:5432/website';
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

try {
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
      if (stats.rowCount === 0) {
        activity = '(no stats row — counters may have been reset; verify manually)';
        console.warn(`  ? ${obj.schema}.${obj.name} (${kindLabel}) — ${activity}`);
        warnings++;
        continue;
      }
      const r = stats.rows[0];
      activity = `live=${r.n_live_tup} ins=${r.n_tup_ins} upd=${r.n_tup_upd} del=${r.n_tup_del}`;
      if (Number(r.n_tup_ins) > 0 || Number(r.n_tup_upd) > 0 || Number(r.n_tup_del) > 0) {
        console.warn(`  ⚠ ${obj.schema}.${obj.name} (${kindLabel}) — has WRITES: ${activity}`);
        warnings++;
        continue;
      }
    }
    console.log(`  ✓ ${obj.schema}.${obj.name} (${kindLabel}) — ${activity}`);
  }

  console.log('');
  if (warnings > 0) {
    console.error(`AUDIT FAILED: ${warnings} legacy object(s) still have write activity. Fix writers before running sunset.`);
    process.exit(1);
  }
  console.log('Audit passed — safe to run scripts/tickets-sunset.mjs\n');
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
