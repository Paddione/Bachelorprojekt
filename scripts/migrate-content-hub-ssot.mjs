#!/usr/bin/env node
/**
 * Content-Hub SSOT Migration Runner — Task 3.2
 *
 * For each brand, loads service_config + leistungen_config from Postgres,
 * runs the "catalog wins" transform (linkCardsToCatalog), and optionally
 * writes back via saveServiceConfig.
 *
 * Usage:
 *   node --import tsx/esm scripts/migrate-content-hub-ssot.mjs [--brand=<id>] [--apply]
 *
 * Defaults: dry-run (no writes). Pass --apply to persist changes.
 * Always writes a divergence report to /tmp/content-hub-migration-<brand>.json.
 *
 * Connection: honours SESSIONS_DATABASE_URL (same as the website server).
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);

// Parse CLI flags
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const brandFlag = args.find((a) => a.startsWith('--brand='))?.split('=')[1];

const BRANDS = ['mentolder', 'korczewski'];
const targets = brandFlag ? BRANDS.filter((b) => b === brandFlag) : BRANDS;

if (targets.length === 0) {
  console.error(`Unknown brand: ${brandFlag}. Valid brands: ${BRANDS.join(', ')}`);
  process.exit(1);
}

if (!apply) {
  console.log('[DRY-RUN] Pass --apply to persist changes.\n');
}

// ── Dynamic import of compiled lib (tsx resolves .ts) ────────────────────────
// We use tsx via --import tsx/esm so TypeScript sources import directly.
const { getServiceConfig, saveServiceConfig, getLeistungenConfig, pool } =
  await import('../website/src/lib/website-db.ts');
const { linkCardsToCatalog } =
  await import('../website/src/lib/content-hub-migrate.ts');

// ── Per-brand migration ────────────────────────────────────────────────────

for (const brand of targets) {
  console.log(`\n══ Brand: ${brand} ══`);

  // Load current data
  const [cards, cats] = await Promise.all([
    getServiceConfig(brand),
    getLeistungenConfig(brand),
  ]);

  if (!cards) {
    console.log(`  service_config: empty (no rows) — skipping`);
    continue;
  }
  if (!cats || cats.length === 0) {
    console.log(`  leistungen_config: empty — skipping (nothing to link against)`);
    continue;
  }

  console.log(`  service_config:    ${cards.length} cards`);
  console.log(`  leistungen_config: ${cats.length} categories`);

  // Run transform
  const { migrated, divergences } = linkCardsToCatalog(cards, cats);

  const alreadyLinked = cards.filter((c) => c.leistungCategoryId).length;
  const newlyLinked   = migrated.filter((c) => c.leistungCategoryId).length - alreadyLinked;
  const unlinked      = migrated.filter((c) => !c.leistungCategoryId).length;

  console.log(`  Already linked:  ${alreadyLinked}`);
  console.log(`  Newly linked:    ${newlyLinked}`);
  console.log(`  Still unlinked:  ${unlinked}`);
  console.log(`  Divergences:     ${divergences.length}`);

  if (divergences.length > 0) {
    console.log('\n  Price divergences (catalog wins → old price discarded):');
    for (const d of divergences) {
      console.log(`    [${d.slug}] old="${d.old}"  →  catalog="${d.catalog}"`);
    }
  }

  // Write divergence report
  const reportPath = `/tmp/content-hub-migration-${brand}.json`;
  const report = {
    brand,
    timestamp: new Date().toISOString(),
    apply,
    stats: { alreadyLinked, newlyLinked, unlinked, divergences: divergences.length },
    divergences,
    unlinkedSlugs: migrated.filter((c) => !c.leistungCategoryId).map((c) => c.slug),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Divergence report written to: ${reportPath}`);

  if (apply) {
    // Trigger on-demand backup before writing
    console.log('\n  Triggering pre-migration backup…');
    try {
      const jobName = `content-hub-premigration-${brand}-${Date.now()}`;
      // Determine namespace from brand
      const ns = brand === 'korczewski' ? 'workspace-korczewski' : 'workspace';
      const ctx = brand === 'korczewski' ? 'korczewski' : 'mentolder';
      execSync(
        `kubectl -n ${ns} --context ${ctx} create job ${jobName} --from=cronjob/db-backup`,
        { stdio: 'inherit' }
      );
      console.log(`  Backup job ${jobName} created — waiting 30 s for it to start…`);
      await new Promise((r) => setTimeout(r, 30_000));
    } catch (e) {
      console.warn(`  WARNING: backup job failed to create (${e.message}). Proceeding anyway.`);
    }

    console.log('  Writing migrated service_config…');
    await saveServiceConfig(brand, migrated);
    console.log('  ✓ Done.');
  } else {
    console.log('  [DRY-RUN] No writes performed.');
  }
}

await pool.end();
console.log('\nMigration runner finished.');
