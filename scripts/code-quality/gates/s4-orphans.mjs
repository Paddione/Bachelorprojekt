// scripts/code-quality/gates/s4-orphans.mjs
// S4: manifests/scripts with no reference in the configured sources (incl.
// transitive script sources). key=S4:<path>, metric=1.
import { readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from '../scan.mjs';
import { matchGlob } from '../glob.mjs';

/** Candidate basenames absent from `corpus` → returned as orphan paths. */
export function findOrphans(candidates, corpus) {
  const orphans = [];
  for (const c of candidates) {
    const base = basename(c);
    if (!corpus.includes(base)) orphans.push(c);
  }
  return orphans;
}

/** Run S4 over the tracked tree. Returns the gate contract object. */
export function runS4(repoRoot, gates) {
  const s4 = gates?.s4 ?? {};
  const candGlobs = [...(s4.manifest_globs ?? []), ...(s4.script_globs ?? []), ...(s4.command_globs ?? [])];
  const allow = s4.allowlist_globs ?? [];
  const srcGlobs = s4.reference_sources ?? [];
  const tracked = trackedFiles(repoRoot);

  const candidates = tracked.filter(
    (f) => candGlobs.some((g) => matchGlob(f, g)) && !allow.some((g) => matchGlob(f, g)),
  );
  const sourceFiles = tracked.filter((f) => srcGlobs.some((g) => matchGlob(f, g)));

  const loadedSources = sourceFiles.map((f) => {
    try {
      return { path: f, content: readFileSync(join(repoRoot, f), 'utf8') };
    } catch (err) {
      process.stderr.write(`S4: unreadable corpus source ${f}: ${err?.message}\n`);
      return { path: f, content: '' };
    }
  });

  const violations = [];
  for (const c of candidates) {
    const parts = [];
    for (const s of loadedSources) {
      if (s.path === c) continue;
      parts.push(s.content);
    }
    const corpus = parts.join('\n');
    if (!corpus.includes(basename(c))) {
      violations.push({
        key: `S4:${c}`,
        path: c,
        metric: 1,
        detail: `no reference to '${basename(c)}' in any configured source`,
      });
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S4', status: violations.length ? 'fail' : 'pass', violations };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const { loadGates } = await import('../load.mjs');
  const repoRoot = join(dirname(__filename), '..', '..', '..');
  const cfgDir = process.env.QUALITY_CFG_DIR
    ? join(repoRoot, process.env.QUALITY_CFG_DIR)
    : join(repoRoot, 'docs', 'code-quality');
  for (const v of runS4(repoRoot, loadGates(cfgDir)).violations) console.log(v.path);
}
