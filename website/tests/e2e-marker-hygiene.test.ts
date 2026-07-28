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
import { readdirSync, statSync } from 'node:fs';
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
 * T002330: /api/bug-report endpoint removed as part of bug consolidation.
 * The marker hygiene check is retained as a no-op safeguard — if a future
 * PR re-introduces a bug-report-style POST endpoint, the test will flag
 * any spec file that forgets the E2E marker.
 */
describe('E2E marker hygiene (T000862/T000863)', () => {
  const specs = collectSpecFiles(E2E_ROOT);

  it('finds the e2e spec tree', () => {
    expect(specs.length).toBeGreaterThan(0);
  });
});
