// scripts/one-shot/2026-07-21-feature-product-backfill.mjs
//
// T002016 — feature-product-linking. Every existing type='feature' ticket has
// parent_id = NULL (the 16 legacy type='project' tickets are all archived, and
// create_ticket/prepare_feature offer no parent_id parameter). This one-shot
// script:
//   1. Ensures a living product taxonomy exists: 7 active type='project'
//      tickets per brand (mentolder, korczewski), looked up by (brand, title)
//      so re-runs reuse the same rows instead of duplicating them.
//   2. Reads the mapping file generated at implementation time
//      (2026-07-21-feature-product-backfill-mapping.json — [{ external_id,
//      brand, product_slug, confidence }]) and sets parent_id on every
//      matching feature that doesn't already have one.
//
// Idempotent: product-ticket lookup is by (brand, title); the feature UPDATE
// only ever targets parent_id IS NULL rows, so a second run changes nothing.
//
// Usage:
//   node scripts/one-shot/2026-07-21-feature-product-backfill.mjs            # dry-run (default)
//   node scripts/one-shot/2026-07-21-feature-product-backfill.mjs --apply    # execute changes
//
// Env: TRACKING_DB_URL or WEBSITE_DB_URL (Postgres connection string).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// BACKFILL_MAPPING_FILE override exists so BATS fixtures can point at a small
// test mapping instead of the real 300+-row dataset.
const MAPPING_FILE = process.env.BACKFILL_MAPPING_FILE
  ?? path.join(__dirname, '2026-07-21-feature-product-backfill-mapping.json');

export const BRANDS = ['mentolder', 'korczewski'];

// Stable slug -> human-readable title. Slug is the join key to the mapping file.
export const PRODUCT_TAXONOMY = [
  { slug: 'website',       title: 'Website' },
  { slug: 'infra',         title: 'Infra/Deployment' },
  { slug: 'ai-factory',    title: 'AI/Software-Factory' },
  { slug: 'ticket-system', title: 'Ticket-System/Cockpit' },
  { slug: 'auth-security', title: 'Auth/Security/DSGVO' },
  { slug: 'dev-tooling',   title: 'Dev-Tooling' },
  { slug: 'sonstiges',     title: 'Sonstiges/Unklassifiziert' },
];

// ── 1. Lookup-or-create the 7 product tickets per brand ────────────────────
async function ensureProductTickets(client, dryRun) {
  // Map: brand -> slug -> ticket UUID
  const uuids = {};
  let created = 0;
  for (const brand of BRANDS) {
    uuids[brand] = {};
    for (const { slug, title } of PRODUCT_TAXONOMY) {
      const existing = await client.query(
        `SELECT id FROM tickets.tickets WHERE type='project' AND brand=$1 AND title=$2`,
        [brand, title]);
      if (existing.rowCount > 0) {
        uuids[brand][slug] = existing.rows[0].id;
        continue;
      }
      if (dryRun) {
        // No UUID yet in dry-run mode; downstream link counting is skipped.
        created++;
        continue;
      }
      const inserted = await client.query(
        `INSERT INTO tickets.tickets (type, brand, title, description, status)
         VALUES ('project', $1, $2, $3, 'in_progress')
         RETURNING id`,
        [brand, title, `Produkt-Container "${title}" (T002016 Taxonomie-Backfill).`]);
      uuids[brand][slug] = inserted.rows[0].id;
      created++;
    }
  }
  return { uuids, created };
}

// ── 2. Read the mapping file + link parentless features ────────────────────
function loadMapping() {
  const raw = readFileSync(MAPPING_FILE, 'utf8');
  const mapping = JSON.parse(raw);
  if (!Array.isArray(mapping)) {
    throw new Error(`mapping file must be a JSON array: ${MAPPING_FILE}`);
  }
  return mapping;
}

async function linkFeatures(client, uuids, mapping, dryRun) {
  let linked = 0;
  let skippedAlreadyLinked = 0;
  let skippedNoUuid = 0;
  for (const entry of mapping) {
    const { external_id: externalId, brand, product_slug: slug } = entry;
    const productId = uuids[brand]?.[slug];
    if (!productId) {
      // dry-run before any inserts, or an unknown brand/slug combination.
      skippedNoUuid++;
      continue;
    }
    if (dryRun) {
      const current = await client.query(
        `SELECT parent_id FROM tickets.tickets WHERE external_id = $1`, [externalId]);
      if (current.rowCount === 0 || current.rows[0].parent_id !== null) {
        skippedAlreadyLinked++;
      } else {
        linked++;
      }
      continue;
    }
    const result = await client.query(
      `UPDATE tickets.tickets SET parent_id = $1
        WHERE external_id = $2 AND parent_id IS NULL`,
      [productId, externalId]);
    if (result.rowCount > 0) linked++;
    else skippedAlreadyLinked++;
  }
  return { linked, skippedAlreadyLinked, skippedNoUuid };
}

async function run(client, dryRun) {
  const { uuids, created } = await ensureProductTickets(client, dryRun);
  const mapping = loadMapping();
  const { linked, skippedAlreadyLinked, skippedNoUuid } = await linkFeatures(client, uuids, mapping, dryRun);
  return {
    mode: dryRun ? 'dry-run' : 'apply',
    projectsCreated: created,
    featuresInMapping: mapping.length,
    featuresLinked: linked,
    featuresSkippedAlreadyLinked: skippedAlreadyLinked,
    featuresSkippedNoUuid: skippedNoUuid,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL ?? process.env.PGURL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (apply) await client.query('BEGIN');
    const r = await run(client, !apply);
    if (apply) await client.query('COMMIT');
    console.log(JSON.stringify(r));
    console.log(`created N projects, linked M features -> created ${r.projectsCreated} projects, linked ${r.featuresLinked} features`);
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
    console.error(err.message);
    process.exit(1);
  }
  await client.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
