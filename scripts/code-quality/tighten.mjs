// scripts/code-quality/tighten.mjs
// CLI: tighten baseline.json by lowering entries where current metric < baseline metric.
// Delegates entirely to applyRefresh() from baseline-refresh.mjs.
// Exits 0 if nothing changed, exits 0 after updating + printing a summary.
// Usage: node scripts/code-quality/tighten.mjs [--commit]
//   --commit: if baseline changed, run "git add docs/code-quality/baseline.json && git commit"
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadGates } from './load.mjs';
import { aggregate } from './check.mjs';
import { applyRefresh } from './baseline-refresh.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), '..', '..');
const cfgDir = process.env.QUALITY_CFG_DIR
  ? join(repoRoot, process.env.QUALITY_CFG_DIR)
  : join(repoRoot, 'docs', 'code-quality');

const doCommit = process.argv.includes('--commit');

const { validateRegistry } = await import('./validate.mjs');
const v = validateRegistry(cfgDir, repoRoot);
if (!v.ok) { for (const e of v.errors) console.error('\u2717', e); process.exit(1); }

let baseline = {};
try { baseline = JSON.parse(readFileSync(join(cfgDir, 'baseline.json'), 'utf8')); }
catch { console.warn('\u26a0 baseline.json missing \u2014 nothing to tighten'); process.exit(0); }

const current = aggregate(repoRoot, loadGates(cfgDir));
const { updated, removed, updated_count, unchanged } = applyRefresh(baseline, current);

const baselinePath = join(cfgDir, 'baseline.json');
const before = JSON.stringify(baseline, null, 2);
const after  = JSON.stringify(updated,  null, 2);

if (before === after) {
  console.log('\u2713 quality:tighten \u2014 baseline already tight, nothing to do');
  process.exit(0);
}

writeFileSync(baselinePath, after + '\n', 'utf8');
console.log(`\u2713 quality:tighten \u2014 ${removed} removed, ${updated_count} tightened, ${unchanged} unchanged`);
console.log(`  ${Object.keys(updated).length} violation(s) remaining in baseline.json`);

if (doCommit) {
  const relPath = join('docs', 'code-quality', 'baseline.json');
  execFileSync('git', ['add', relPath], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', 'chore(quality): tighten baseline.json after improvement'],
    { cwd: repoRoot, stdio: 'inherit' });
  console.log('\u2713 committed tightened baseline.json');
}
