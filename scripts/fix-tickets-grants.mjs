// scripts/fix-tickets-grants.mjs
//
// Idempotent fix for the latent grant gap that surfaced after PR2 of the
// unified-ticketing migration: the `website` PG role lacks SELECT/INSERT/
// UPDATE/DELETE on most tables in the `tickets`, `bachelorprojekt`, and
// `superpowers` schemas because the migration scripts (and parts of
// bachelorprojekt's init.sql) were run as the `postgres` superuser, which
// makes those tables postgres-owned. The website pod connects as `website`
// and could not touch them — and pg_dump (running as website during
// scheduled backups) failed with `permission denied for table tickets`,
// and the tracking-import cron failed on `superpowers.plans` with
// `permission denied for schema superpowers`.
//
// Run this once after a fresh cluster bootstrap, or any time you suspect
// the `website` role is missing access to a table in either schema. It
// only GRANTs (never REVOKEs), reassigns ownership of existing objects to
// `website`, and `ALTER DEFAULT PRIVILEGES` ensures any future tables
// created in these schemas by `postgres` automatically grant the same set.
//
// Usage:
//   node scripts/fix-tickets-grants.mjs            # dry-run (default)
//   node scripts/fix-tickets-grants.mjs --apply    # execute
//
// Env: TRACKING_DB_URL or WEBSITE_DB_URL — must connect as the postgres
//      superuser (the `website` role can't grant on tables it doesn't own).
import pg from 'pg';

const SCHEMAS = ['tickets', 'bachelorprojekt', 'superpowers'];

// Per schema, which privilege set we want on existing + future objects.
const SCHEMA_GRANTS = {
  tickets: {
    tablePrivs: 'SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER',
    seqPrivs:   'USAGE, SELECT, UPDATE',
  },
  bachelorprojekt: {
    tablePrivs: 'SELECT, INSERT, UPDATE, DELETE',
    seqPrivs:   'USAGE, SELECT, UPDATE',
  },
  // superpowers is owned by `website` so the tracking-import cron can
  // CREATE TABLE and CREATE INDEX as part of self-healing the schema.
  superpowers: {
    tablePrivs: 'SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER',
    seqPrivs:   'USAGE, SELECT, UPDATE',
  },
};

async function audit(client) {
  // Returns { schema -> [{ name, owner, kind, has_select_for_website }] }
  const rows = (await client.query(`
    SELECT n.nspname AS schema,
           c.relname AS name,
           c.relkind AS kind,
           r.rolname AS owner,
           has_table_privilege('website', c.oid, 'SELECT') AS website_select
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles     r ON r.oid = c.relowner
     WHERE n.nspname = ANY($1)
       AND c.relkind IN ('r','v','m','S')
     ORDER BY n.nspname, c.relname
  `, [SCHEMAS])).rows;
  const out = {};
  for (const r of rows) {
    (out[r.schema] ??= []).push(r);
  }
  return out;
}

async function reownSuperpowers(client) {
  // The superpowers schema is owned by postgres in some clusters (mentolder)
  // and by website in others (korczewski). Normalise to website-owned so the
  // tracking-import cron can CREATE TABLE / CREATE INDEX without escalating
  // to postgres on every run.
  const ownerRow = (await client.query(
    `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'superpowers'`,
  )).rows[0];
  if (!ownerRow || ownerRow.owner === 'website') return;
  await client.query('ALTER SCHEMA superpowers OWNER TO website');
  // ALTER SCHEMA OWNER doesn't cascade — re-own existing tables + sequences too.
  const objs = (await client.query(`
    SELECT c.relname AS name, c.relkind AS kind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'superpowers'
       AND c.relkind IN ('r','S')
       AND pg_get_userbyid(c.relowner) <> 'website'
  `)).rows;
  for (const o of objs) {
    const kw = o.kind === 'S' ? 'SEQUENCE' : 'TABLE';
    await client.query(`ALTER ${kw} superpowers.${o.name} OWNER TO website`);
  }
}

async function applyGrants(client) {
  await reownSuperpowers(client);

  for (const schema of SCHEMAS) {
    const { tablePrivs, seqPrivs } = SCHEMA_GRANTS[schema];

    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO website`);

    await client.query(
      `GRANT ${tablePrivs} ON ALL TABLES    IN SCHEMA ${schema} TO website`);
    await client.query(
      `GRANT ${seqPrivs}   ON ALL SEQUENCES IN SCHEMA ${schema} TO website`);

    // Default privileges so postgres-created future objects in this schema
    // automatically grant the same set to `website`. This is what stops the
    // gap from coming back after the next time someone runs a migration as
    // postgres.
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schema}
         GRANT ${tablePrivs} ON TABLES TO website`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ${schema}
         GRANT ${seqPrivs} ON SEQUENCES TO website`);
  }
}

function summarize(label, audit) {
  console.log(`\n[${label}]`);
  for (const schema of SCHEMAS) {
    const objs = audit[schema] ?? [];
    const missingSelect = objs.filter(o =>
      ['r', 'v', 'm'].includes(o.kind) && !o.website_select);
    console.log(`  ${schema}: ${objs.length} objects, ${missingSelect.length} without website SELECT`);
    for (const o of missingSelect.slice(0, 8)) {
      console.log(`    - ${o.name} (kind=${o.kind}, owner=${o.owner})`);
    }
    if (missingSelect.length > 8) {
      console.log(`    … and ${missingSelect.length - 8} more`);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const before = await audit(client);
    summarize('BEFORE', before);

    if (!apply) {
      console.log('\n(dry-run — pass --apply to execute the GRANTs)');
      return;
    }

    await client.query('BEGIN');
    await applyGrants(client);
    await client.query('COMMIT');

    const after = await audit(client);
    summarize('AFTER', after);
    console.log('\nDone.');
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
