// scripts/code-quality/scan.mjs
// The single scan-universe (git ls-files ∩ code_roots − ignore_globs) and the
// first-match subsystem owner resolver. Shared by emit-index + every gate.
import { execFileSync } from 'node:child_process';
import { matchGlob } from './glob.mjs';

/** All git-tracked files at repoRoot, sorted, POSIX-separated. */
export function trackedFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))].sort();
}

/** True iff `file` is under one of the code_roots prefixes. */
function underRoots(file, roots) {
  return roots.some((r) => file === r || file.startsWith(r + '/'));
}

/** The scan-universe: tracked ∩ code_roots − ignore_globs, sorted. */
export function scanUniverse(repoRoot, gates) {
  const roots = gates?.scan?.code_roots ?? [];
  const ignore = gates?.scan?.ignore_globs ?? [];
  return trackedFiles(repoRoot).filter(
    (f) => underRoots(f, roots) && !ignore.some((g) => matchGlob(f, g)),
  );
}

/** The first subsystem (in file order) whose paths[] glob matches, or undefined. */
export function ownerOf(file, subsystems) {
  for (const sub of subsystems) {
    if ((sub.paths ?? []).some((g) => matchGlob(file, g))) return sub;
  }
  return undefined;
}
