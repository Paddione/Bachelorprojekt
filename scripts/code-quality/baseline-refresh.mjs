// scripts/code-quality/baseline-refresh.mjs
// Remove FIXED entries and lower improved metrics in baseline.json.
// A "FIXED" entry is a baseline key absent from the current violation set.
// An "improved" entry is present in both but current.metric < baseline.metric.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';

/**
 * Apply a refresh pass to `baseline` given the flat `current` violation list.
 * Returns { updated: {key→entry}, removed: number, updated_count: number, unchanged: number }.
 * Does NOT write to disk — the CLI wrapper does that.
 */
export function applyRefresh(baseline, current) {
  const currentMap = new Map(current.map((v) => [v.key, v]));
  const updated = {};
  let removed = 0;
  let updated_count = 0;
  let unchanged = 0;

  for (const [key, entry] of Object.entries(baseline)) {
    const cv = currentMap.get(key);
    if (!cv) {
      // FIXED: violation no longer present
      removed++;
      continue;
    }
    if (typeof cv.metric === 'number' && typeof entry.metric === 'number'
        && cv.metric < entry.metric) {
      // Improved: metric lowered — update the entry
      updated[key] = { ...entry, metric: cv.metric, detail: cv.detail };
      updated_count++;
    } else {
      // Unchanged
      updated[key] = entry;
      unchanged++;
    }
  }

  // Sort keys for deterministic output
  const sorted = {};
  for (const k of Object.keys(updated).sort()) sorted[k] = updated[k];

  return { updated: sorted, removed, updated_count, unchanged };
}

// CLI: validate-first, run all gates, apply refresh, write baseline.json.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  const { validateRegistry } = await import('./validate.mjs');
  const v = validateRegistry(cfgDir, repoRoot);
  if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
  catch (e) { console.warn('⚠ baseline.json missing or unparseable — starting from empty baseline:', e.message); baseline = {}; }
  const current = aggregate(repoRoot, loadGates(cfgDir));
  const { updated, removed, updated_count, unchanged } = applyRefresh(baseline, current);
  writeFileSync(join(cfgDir, 'baseline.json'), JSON.stringify(updated, null, 2) + '\n', 'utf8');
  console.log(`✓ baseline:refresh — ${removed} removed, ${updated_count} updated, ${unchanged} unchanged`);
  console.log(`  ${Object.keys(updated).length} violation(s) remaining in baseline.json`);
}
