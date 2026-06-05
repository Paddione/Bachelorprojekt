// scripts/code-quality/gates/s2-cycles.mjs
// S2: import cycles per TS graph via `madge --circular --json`.
// key=S2:<graph>:<canon>, metric=cycle member count.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** Canonical key for a cycle: its member set sorted lexicographically, joined
 *  by '|'. A sorted array is already its own lexicographically smallest
 *  rotation, so this is order- and rotation-invariant with no explicit rotation
 *  step. A cycle whose membership changes (gains/loses a member) yields a new
 *  sorted join → a NEW key (intentional: it surfaces as a new violation, not a
 *  worsened metric). Members MUST be graph-relative (madge is run with cwd at
 *  the scanned dir) so the key is identical on the freeze machine and the CI
 *  runner (Finding-2 fix). */
export function canonCycle(members) {
  const sorted = members.slice().sort();
  return sorted.join('|');
}

/** Map madge cycle arrays for one graph to gate violations. */
export function cyclesToViolations(graphId, graphPath, cycles) {
  return cycles.map((members) => {
    const canon = canonCycle(members);
    return {
      key: `S2:${graphId}:${canon}`,
      path: graphPath,
      metric: members.length,
      detail: `cycle in ${graphId}: ${members.join(' → ')}`,
    };
  });
}

/** Run madge for one graph; returns an array of cycle member-arrays (or []).
 *  madge is run with cwd at the scanned dir and target '.', so the member
 *  paths it reports are GRAPH-RELATIVE (e.g. 'lib/a.ts'), never absolute or
 *  repo-rooted. That keeps the S2 key machine-independent between the freeze
 *  machine and the CI runner (Finding-2 fix).
 *
 *  FAIL CLOSED: a genuine madge failure (binary ENOENT, missing graph dir or
 *  tsconfig, empty/unparseable stdout) must THROW — never `return []`. A broken
 *  graph silently reporting "0 cycles" would freeze a false zero into the
 *  baseline, the exact silent-pass this gate exists to prevent. The only
 *  tolerated non-zero exit is madge finding cycles, which still emits its JSON
 *  array on stdout; that path is parsed and returned normally. */
function madgeCycles(repoRoot, tsconfig) {
  const dir = join(repoRoot, dirname(tsconfig));
  // Pre-flight: a missing graph dir is a config/checkout error, not "clean".
  if (!existsSync(dir)) {
    throw new Error(`S2: graph dir missing for ${tsconfig} (looked in ${dir})`);
  }
  try {
    // stderr is piped (not ignored) so a genuine failure's diagnostic is
    // available on err.stderr for the thrown Error below.
    const out = execFileSync(
      join(repoRoot, 'node_modules', '.bin', 'madge'),
      ['--circular', '--json', '--extensions', 'ts,tsx', '.'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // (a) success path: exit 0 → stdout is the (possibly empty) cycle array.
    const parsed = JSON.parse(out || '[]');
    if (!Array.isArray(parsed)) {
      throw new Error(`S2: madge produced non-array JSON for ${tsconfig}`);
    }
    return parsed;
  } catch (err) {
    // (b) NORMAL: madge exits non-zero WHEN it finds cycles — its JSON cycle
    // array is still on stdout. Parse it and return the cycles.
    if (err && typeof err.stdout === 'string' && err.stdout.trim()) {
      try {
        const parsed = JSON.parse(err.stdout);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not the cycle path — fall through to the hard throw */ }
    }
    // (c) ANY other case (ENOENT, missing/unparseable stdout, JSON.parse on the
    // success path threw, non-array JSON) → fail closed with a real diagnostic.
    const stderr = (err && typeof err.stderr === 'string') ? err.stderr.trim() : '';
    const diag = stderr || err?.message || String(err);
    throw new Error(`S2: madge failed for ${tsconfig}: ${diag}`);
  }
}

/** Run S2 across all configured graphs. Propagates a hard throw from
 *  madgeCycles when a graph is broken/missing (fail closed) — a malformed or
 *  unreachable graph must surface as a non-zero exit, never a silent zero. */
export function runS2(repoRoot, gates) {
  const graphs = gates?.s2?.graphs ?? [];
  const violations = [];
  for (const g of graphs) {
    const cycles = madgeCycles(repoRoot, g.tsconfig);
    violations.push(...cyclesToViolations(g.id, dirname(g.tsconfig), cycles));
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { gate: 'S2', status: violations.length ? 'fail' : 'pass', violations };
}
