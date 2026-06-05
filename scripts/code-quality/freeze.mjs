// scripts/code-quality/freeze.mjs
// Freeze the current violation set into baseline.json (one-time + on a Slice-B
// refresh later). frozen_at = git HEAD short SHA (deterministic per commit).
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';

/** Build the baseline map from the current violation list. */
export function freeze(repoRoot, gates, frozenAt) {
  const map = {};
  for (const v of aggregate(repoRoot, gates)) {
    map[v.key] = {
      gate: v.key.split(':')[0],
      path: v.path,
      metric: v.metric,
      detail: v.detail,
      frozen_at: frozenAt,
    };
  }
  // sort keys so the JSON is deterministic
  const sorted = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  return sorted;
}

// CLI: validate-first, freeze against HEAD, write docs/code-quality/baseline.json.
// validateRegistry MUST run before freezing — a malformed gates.yaml would let
// `?? []` produce empty scopes and bake an empty/false-clean baseline.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const repoRoot = join(dirname(__filename), '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  const { validateRegistry } = await import('./validate.mjs');
  const v = validateRegistry(cfgDir, repoRoot);
  if (!v.ok) { for (const e of v.errors) console.error('✗', e); process.exit(1); }
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' }).trim();
  const map = freeze(repoRoot, loadGates(cfgDir), sha);
  writeFileSync(join(cfgDir, 'baseline.json'), JSON.stringify(map, null, 2) + '\n', 'utf8');
  console.log(`✓ froze ${Object.keys(map).length} violation(s) into baseline.json @ ${sha}`);
}
