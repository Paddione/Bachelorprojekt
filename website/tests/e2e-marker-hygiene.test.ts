// website/tests/e2e-marker-hygiene.test.ts
//
// Regression guard for T000862 / T000863 — "E2E specs pollute the production
// tracker".
//
// Root cause class: a Playwright spec POSTs to a write endpoint that creates a
// real DB row (e.g. /api/bug-report) WITHOUT the E2E marker header pair
// (`X-E2E-Test` + `X-Cron-Secret`). Without the marker the server's
// `isE2ETestRequest()` returns false → the row is stored as real data
// (`is_test_data=false`) → the purge bracket never reaps it → it accumulates in
// the live tickets table on every E2E run.
//
// This static test scans every Playwright spec under tests/e2e/ and fails if a
// spec creates a bug report without going through the E2E marker. It runs
// offline in the website `node` vitest project (no server / DB needed), so the
// guard is part of `task test:all` / CI rather than only catching the leak in
// production after the fact.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
// website/tests/ -> repo-root tests/e2e/
const E2E_ROOT = resolve(__dirname, '../../tests/e2e');

/** Recursively collect every *.spec.ts file under a directory. */
function collectSpecFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSpecFiles(full));
    } else if (entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A spec that creates a bug report must carry the E2E marker — either inline
 * (`X-E2E-Test`) or via the shared helper (`createTestBugReport`).
 *
 * Detection matches an actual `.post(...)` call site whose URL argument
 * contains `/api/bug-report` via regex, rather than two independent substring
 * checks — the old approach flagged any file that merely *mentioned*
 * '/api/bug-report' (e.g. in a comment) alongside an unrelated `.post(` call
 * elsewhere in the same file. The URL argument may be a template literal with
 * a variable prefix (`` `${BASE}/api/bug-report` ``), so the match spans from
 * the opening quote to the path rather than requiring it immediately after.
 */
const BUG_REPORT_POST_RE = /\.post\(\s*[`'"][^`'"]*\/api\/bug-report/;
const MARKER_TOKENS = ['X-E2E-Test', 'createTestBugReport', 'bugReportMarkerHeaders', 'markerHeaders', 'markerAvailable'];

describe('E2E marker hygiene (T000862/T000863)', () => {
  const specs = collectSpecFiles(E2E_ROOT);

  it('finds the e2e spec tree', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('every spec that POSTs to /api/bug-report carries the E2E marker', () => {
    const violators: string[] = [];
    for (const file of specs) {
      const src = readFileSync(file, 'utf8');
      const createsBugReport = BUG_REPORT_POST_RE.test(src);
      if (!createsBugReport) continue;
      const hasMarker = MARKER_TOKENS.some((t) => src.includes(t));
      if (!hasMarker) {
        violators.push(file.slice(file.indexOf('tests/e2e')));
      }
    }
    expect(
      violators,
      `These specs create bug-report rows without the E2E marker (X-E2E-Test + X-Cron-Secret) ` +
        `and therefore leak real rows into the production tracker:\n  ${violators.join('\n  ')}`,
    ).toEqual([]);
  });
});
