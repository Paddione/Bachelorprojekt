// scripts/code-quality/scan.mjs
// The single scan-universe (git ls-files ∩ code_roots − ignore_globs) and the
// first-match subsystem owner resolver. Shared by emit-index + every gate.
import { execFileSync } from 'node:child_process';
import { matchGlob } from './glob.mjs';

/**
 * Every file in the working tree that git would consider part of the repo —
 * tracked PLUS untracked-but-not-ignored. Sorted, POSIX-separated.
 *
 * [T002375-p4] Bis hierher zaehlte nur `git ls-files`, also der getrackte Stand. Eine
 * frisch angelegte Datei war beim ersten `freshness:regenerate` noch untracked und fiel
 * heraus; erst nach `git add` erschien sie und aenderte den Index ein zweites Mal. Das
 * kostete reproduzierbar zwei Durchlaeufe des rund 9 Sekunden langen Gates plus einen
 * Commit-Amend — beobachtet bei scripts/filter-generated.sh (T002255, file_count
 * 548 -> 549) und scripts/ticket-reclaim.sh (T002267), beide Male identisches Muster.
 *
 * SEMANTIK-AENDERUNG, bewusst: der Index beschreibt ab jetzt den ARBEITSBAUM ohne
 * ignorierte Dateien, nicht mehr den getrackten Stand.
 *
 * Zwei Dinge, die dabei nicht passieren koennen:
 *  - Selbstreferenz von `docs/code-quality/repo-index.json`: `docs` steht nicht in
 *    `scan.code_roots` (nur website, tests, scripts, brett, k3d, … ), die Datei liegt
 *    also ohnehin ausserhalb des Universums.
 *  - Ignorierte Dateien: `--exclude-standard` respektiert .gitignore, .git/info/exclude
 *    und die globale Excludes-Datei.
 *
 * Was sehr wohl passieren kann und der Preis dieser Aenderung ist: eine ungetrackte,
 * nicht ignorierte Datei unter einem code_root ohne zustaendiges Subsystem laesst die
 * C4-Pruefung in emit-index.mjs mit `C4 orphan` fehlschlagen. Das ist gewollt — die
 * Datei braucht einen Eigentuemer — aber es trifft jetzt frueher, naemlich schon vor
 * dem `git add`.
 */
export function trackedFiles(repoRoot) {
  const run = (args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean);
  const tracked = run(['ls-files']);
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked, ...untracked])].sort();
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
