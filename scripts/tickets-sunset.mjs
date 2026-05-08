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
  if (await exists('bugs', 'bug_tickets')) {
    await drop('VIEW', 'bugs.bug_tickets');
  }
  if (await exists('bugs', 'bug_ticket_comments_legacy')) {
    await drop('TABLE', 'bugs.bug_ticket_comments_legacy');
  }
  if (await exists('bugs', 'bug_tickets_legacy')) {
    await drop('TABLE', 'bugs.bug_tickets_legacy');
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
    const r = await client.query('SELECT count(*) AS n FROM bachelorprojekt.test_results');
    if (Number(r.rows[0].n) === 0) {
      await drop('TABLE', 'bachelorprojekt.test_results');
    } else {
      console.log(`  SKIP bachelorprojekt.test_results — ${r.rows[0].n} rows (historical record; drop manually)`);
    }
  }

  // ── 3. public schema — project* views + legacy tables ─────────────────────
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

  console.log('');
  if (!apply) console.log('Dry-run complete. Re-run with --apply to execute.\n');
  else        console.log('Sunset complete.\n');
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
