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

/**
 * Returns the kind keyword for DROP statements based on pg_class.relkind:
 *   'r' (ordinary table) | 'p' (partitioned table)        → 'TABLE'
 *   'v' (view)                                            → 'VIEW'
 *   'm' (materialized view)                               → 'MATERIALIZED VIEW'
 * Returns null if the object doesn't exist.
 *
 * Required because the legacy bachelorprojekt back-compat scaffolding shipped
 * inconsistently across clusters: on live shared-db several "expected views"
 * are actually base TABLEs (requirements, features, bugs.bug_tickets), so a
 * blind `DROP VIEW` errors out.
 */
async function relKind(schema, name) {
  const r = await client.query(
    `SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=$2`,
    [schema, name]
  );
  if (r.rowCount === 0) return null;
  switch (r.rows[0].relkind) {
    case 'r': case 'p': return 'TABLE';
    case 'v':           return 'VIEW';
    case 'm':           return 'MATERIALIZED VIEW';
    default:            return null;
  }
}

async function dropAuto(schema, name, opts = '') {
  const kind = await relKind(schema, name);
  if (!kind) return; // already gone
  await drop(kind, `${schema}.${name}`, opts);
}

async function isSchemaEmpty(schema) {
  const r = await client.query(
    `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','v','m','S') LIMIT 1`,
    [schema]
  );
  return r.rowCount === 0;
}

async function drop(kind, fqn, opts = '') {
  // NOTE: fqn and opts must be hardcoded identifiers — no parameterization.
  if (apply) {
    await client.query(`DROP ${kind} IF EXISTS ${fqn} ${opts}`);
    console.log(`  DROPPED ${kind} ${fqn}`);
  } else {
    console.log(`  [dry-run] DROP ${kind} IF EXISTS ${fqn} ${opts}`);
  }
}

await client.connect();

try {
  if (!apply) console.log('\n=== tickets-sunset DRY RUN (pass --apply to execute) ===\n');
  else        console.log('\n=== tickets-sunset APPLYING ===\n');

  // ── 1. bugs schema ─────────────────────────────────────────────────────────
  // bugs.bug_tickets ships as a VIEW on most clusters but as a TABLE on the
  // unified shared-db; dropAuto() picks the right keyword from pg_class.
  await dropAuto('bugs', 'bug_tickets', 'CASCADE');
  await dropAuto('bugs', 'bug_ticket_comments_legacy', 'CASCADE');
  // Drop the inbox_items FK that points at bugs.bug_tickets_legacy (leftover from migration)
  if (apply) {
    await client.query(`ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_bug_ticket_id_fkey`);
    console.log('  DROPPED CONSTRAINT inbox_items_bug_ticket_id_fkey');
  } else {
    console.log('  [dry-run] ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_bug_ticket_id_fkey');
  }
  await dropAuto('bugs', 'bug_tickets_legacy', 'CASCADE');
  if (apply && await isSchemaEmpty('bugs')) {
    await client.query('DROP SCHEMA IF EXISTS bugs');
    console.log('  DROPPED SCHEMA bugs');
  }

  // ── 2. bachelorprojekt schema ───────────────────────────────────────────────
  // On live shared-db: requirements, features, pipeline, test_results are
  // base TABLEs; v_timeline + v_* are VIEWs. dropAuto() handles both.
  // Drop views first (they may depend on the tables below).
  for (const obj of ['v_timeline', 'v_latest_tests', 'v_open_issues', 'v_pipeline_status', 'v_progress_summary']) {
    await dropAuto('bachelorprojekt', obj, 'CASCADE');
  }
  for (const obj of ['requirements', 'features', 'requirements_legacy', 'features_legacy', 'pipeline']) {
    await dropAuto('bachelorprojekt', obj, 'CASCADE');
  }
  if (await exists('bachelorprojekt', 'test_results')) {
    const r = await client.query('SELECT count(*) AS n FROM bachelorprojekt.test_results');
    if (Number(r.rows[0].n) === 0) {
      await dropAuto('bachelorprojekt', 'test_results', 'CASCADE');
    } else {
      console.log(`  SKIP bachelorprojekt.test_results — ${r.rows[0].n} rows (historical record; drop manually)`);
    }
  }

  // ── 3. public schema — project* views + legacy tables ─────────────────────
  for (const obj of ['project_attachments', 'project_tasks', 'sub_projects', 'projects',
                     'project_attachments_legacy', 'project_tasks_legacy',
                     'sub_projects_legacy', 'projects_legacy']) {
    await dropAuto('public', obj, 'CASCADE');
  }

  console.log('');
  if (!apply) console.log('Dry-run complete. Re-run with --apply to execute.\n');
  else        console.log('Sunset complete.\n');
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
