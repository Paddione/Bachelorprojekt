// scripts/code-quality/check.mjs
// Aggregate all gates, ratchet against baseline.json. Exit !=0 only on the
// CI-blocking set = (new) ∪ (worsened).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGates } from './load.mjs';
import { runS1 } from './gates/s1-filesize.mjs';
import { runS2 } from './gates/s2-cycles.mjs';
import { runS3 } from './gates/s3-hostnames.mjs';
import { runS4 } from './gates/s4-orphans.mjs';
import { runS5 } from './gates/s5-lockfiles.mjs';

/** Run every gate; returns the flat violation list. */
export function aggregate(repoRoot, gates) {
  return [
    runS1(repoRoot, gates),
    runS2(repoRoot, gates),
    runS3(repoRoot, gates),
    runS4(repoRoot, gates),
    runS5(repoRoot, gates),
  ].flatMap((g) => g.violations);
}

/** CI-blocking set: new keys, plus known keys whose metric rose. */
export function blockingSet(current, baseline) {
  const out = [];
  for (const v of current) {
    const base = baseline[v.key];
    if (!base) { out.push(v); continue; }
    if (typeof v.metric === 'number' && typeof base.metric === 'number'
        && v.metric > base.metric) out.push(v);
  }
  return out;
}

// CLI: validate-first, load baseline, run gates, print + exit on the blocking
// set. validateRegistry MUST run before aggregation — a malformed gates.yaml
// (e.g. missing s3.scope_dirs) would otherwise let `?? []` produce an empty
// scope and silently report zero violations, freezing a false-clean baseline.
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
  catch { baseline = {}; }
  const current = aggregate(repoRoot, loadGates(cfgDir));
  const blocking = blockingSet(current, baseline);
  console.log(`quality:check — ${current.length} current violation(s), ${Object.keys(baseline).length} baselined, ${blocking.length} blocking`);
  if (blocking.length) {
    for (const v of blocking) {
      const base = baseline[v.key];
      const why = base ? `worsened ${base.metric}→${v.metric}` : 'NEW';
      console.error(`✗ ${why}: ${v.key} — ${v.detail}`);
    }
    process.exit(1);
  }
  console.log('✓ no new or worsened violations');
}
