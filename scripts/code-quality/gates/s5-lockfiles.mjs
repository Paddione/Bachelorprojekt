// scripts/code-quality/gates/s5-lockfiles.mjs
// S5: Forbidden lockfiles (preventing package manager lockfile drift).
// Key=S5:<path>:<lockfile>, metric=1.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { trackedFiles } from '../scan.mjs';

/**
 * Run S5 over the repo root.
 * Returns the gate contract object.
 */
export function runS5(repoRoot, gates) {
  const rules = gates?.s5?.rules ?? [];
  const violations = [];

  // Get all git-tracked files relative to the repo root.
  const tracked = new Set(trackedFiles(repoRoot));

  for (const rule of rules) {
    const rulePath = rule.path ?? '.';
    const forbidden = rule.forbidden ?? [];

    for (const lockfile of forbidden) {
      const fileRelPath = rulePath === '.' ? lockfile : `${rulePath}/${lockfile}`;

      // Check filesystem
      const fsExists = existsSync(join(repoRoot, fileRelPath));
      // Check git-tracked files
      const gitTracked = tracked.has(fileRelPath);

      if (fsExists || gitTracked) {
        violations.push({
          key: `S5:${rulePath}:${lockfile}`,
          path: fileRelPath,
          metric: 1,
          detail: `Forbidden lockfile found: ${fileRelPath} (fs=${fsExists}, git=${gitTracked})`,
        });
      }
    }
  }

  // Sort violations by key to keep a stable order
  violations.sort((a, b) => a.key.localeCompare(b.key));

  return {
    gate: 'S5',
    status: violations.length ? 'fail' : 'pass',
    violations,
  };
}
