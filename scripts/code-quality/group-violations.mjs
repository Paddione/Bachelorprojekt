// scripts/code-quality/group-violations.mjs
// Read baseline.json + subsystems.yaml; map each violation key to a subsystem
// via first-match glob; group by (gate × subsystem); emit JSON array on stdout.
//
// Output shape: [{ gate, subsystem, count, title, violation_keys }]
//
// Subsystem matching uses the existing glob.mjs matchGlob (no new dep).
// Unknown paths → subsystem "unknown" (never throws).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchGlob } from './glob.mjs';

/** Derive the subsystem id for a violation path via first-match glob. */
function subsystemOf(path, subsystems) {
  for (const sub of subsystems) {
    if ((sub.paths ?? []).some((g) => matchGlob(path, g))) return sub.id;
  }
  return 'unknown';
}

/** Human-readable action suffix per gate. */
function actionSuffix(gate, count) {
  if (gate === 'S1') return `${count} Datei${count === 1 ? '' : 'en'} k\xfcrzen`;
  if (gate === 'S2') return `${count} Zyklus${count === 1 ? '' : 'en'} aufl\xf6sen`;
  if (gate === 'S3') return `${count} Hostname${count === 1 ? '' : 's'} extrahieren`;
  if (gate === 'S4') return `${count} Waise${count === 1 ? '' : 'n'} verkn\xfcpfen`;
  return `${count} Verletzung${count === 1 ? '' : 'en'} beheben`;
}

/**
 * Group flat baseline map by (gate × subsystem).
 * @param {Object} baseline  Map of key → { gate, path, metric, detail, frozen_at }
 * @param {Array}  subsystems Array of subsystem objects from subsystems.yaml
 * @returns {Array} sorted array of { gate, subsystem, count, title, violation_keys }
 */
export function groupViolations(baseline, subsystems) {
  if (!baseline || Object.keys(baseline).length === 0) return [];

  // bucket[gate:subsystem] → { gate, subsystem, violation_keys[] }
  const buckets = new Map();

  for (const [key, entry] of Object.entries(baseline)) {
    const gate = entry.gate ?? key.split(':')[0];
    const sub = subsystemOf(entry.path ?? '', subsystems);
    const bucketKey = `${gate}:${sub}`;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { gate, subsystem: sub, violation_keys: [] });
    }
    buckets.get(bucketKey).violation_keys.push(key);
  }

  return Array.from(buckets.values())
    .map((b) => ({
      gate: b.gate,
      subsystem: b.subsystem,
      count: b.violation_keys.length,
      title: `CQ-GATE:${b.gate}:${b.subsystem} — ${actionSuffix(b.gate, b.violation_keys.length)}`,
      violation_keys: b.violation_keys.sort(),
    }))
    .sort((a, b) => `${a.gate}:${a.subsystem}`.localeCompare(`${b.gate}:${b.subsystem}`));
}

// CLI: read real baseline + subsystems, emit JSON array to stdout.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  const { loadSubsystems } = await import('./load.mjs');
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
  catch { /* empty baseline is fine */ }
  const subsystems = loadSubsystems(cfgDir);
  const groups = groupViolations(baseline, subsystems);
  process.stdout.write(JSON.stringify(groups, null, 2) + '\n');
}
