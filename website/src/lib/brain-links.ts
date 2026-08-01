/**
 * brain-links.ts — K6 Brain-Verweise (T002465): Wiki-Seiten zu Quellpfaden.
 *
 * Reines Ableitungsmodul: kein Netz, keine Datenbank, kein Rück-Import auf
 * API-Schichten (S2). Die Slug-Regel ist eine Zeichen-für-Zeichen-Kopie von
 * `slugify()` in `scripts/brain-ingest-worklist.sh`, die
 * Ingest-Präfixe stammen aus `scripts/brain/ingest-sources.yaml`.
 *
 * Belege des Laufs vom 2026-08-02 (Task 1):
 *   - `openspec/specs/sdlc-cockpit.md`  -> `openspec-specs-sdlc-cockpit` (ssot-specs)
 *   - `CLAUDE.md`                       -> `claude` (core-docs)
 *   - `docs/superpowers/.../gotchas-footguns.md` -> `docs-superpowers-references-gotchas-footguns`
 *
 * Grenze (gemessen, nicht behauptet): `website/`, `k3d/`, `scripts/`, `tests/`
 * werden im `find`-Aufruf des Worklist-Skripts weggeprunt — für Dateien dort
 * existiert keine Wiki-Seite, unabhängig vom Manifest. Der Matcher
 * (`scripts/brain-group-match.sh`) übersetzt `*` zu `[^/]*`, also ein einzelnes
 * Pfadsegment — `docs/agent-guide/*.md` trifft deshalb nicht
 * `docs/agent-guide/maps/agents-map.md`.
 */

const PRUNED_TREES = ['website/', 'k3d/', 'scripts/', 'tests/', '.worktrees/', 'brett/', 'tui/', 'packages/'];

const MANIFEST_GROUPS: string[] = [
  'openspec/specs/*.md',
  'docs/runbooks/*.md',
  'docs/adr/*.md',
  'docs/superpowers/references/gotchas-footguns.md',
  'docs/agent-guide/*.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/lib/goals.md',
  'docs/diagrams/*.md',
  'docs/db-schema-diagram.md',
];

function globToRegExp(pattern: string): RegExp {
  let re = pattern.replace(/\*\*\//g, '(.*\\/)?');
  re = re.replace(/\*\*/g, '.*');
  re = re.replace(/\*/g, '[^\\/]*');
  re = re.replace(/\?/g, '.');
  return new RegExp(`^${re}$`);
}

const GROUP_REGEXPS = MANIFEST_GROUPS.map(globToRegExp);

/**
 * Die Slug-Regel aus `scripts/brain-ingest-worklist.sh` — Zeichen für Zeichen:
 * Endung ab (`${rel%.*}`), führender Punkt ab (`${rel#\.}`), `[/_ ]` zu `-`,
 * lowercase. Gilt für jede Pfadform.
 */
export function slugForSource(path: string): string {
  let s = path.replace(/\.[^./]+$/, '');
  s = s.replace(/^\./, '');
  return s.replace(/[/_ ]/g, '-').toLowerCase();
}

/**
 * `true` nur für Pfade, die das Ingest-Manifest tatsächlich aufnimmt.
 * Die Gruppen stammen aus `scripts/brain/ingest-sources.yaml`; die vier
 * weggeprunten Bäume sind explizit ausgeschlossen, damit die Grenze im Code
 * steht und nicht im Kopf.
 */
export function isIngestedSource(path: string): boolean {
  const pruned = PRUNED_TREES.some((tree) => path.startsWith(tree));
  if (pruned) return false;
  return GROUP_REGEXPS.some((re) => re.test(path));
}

/**
 * Die beiden URL-Kandidaten aus Annahme 1, in fester Reihenfolge. Welcher
 * antwortet, klärt der laufende Dienst (Task 8); bis dahin probiert der
 * Endpunkt beide und nimmt den ersten, der 200 liefert.
 */
export function candidateHrefs(slug: string): string[] {
  return [`/${slug}`, `/wiki/${slug}`];
}

/**
 * Anzeigetext des Links: der Dateiname ohne Endung, damit der Bezug zur
 * Quelle sichtbar bleibt.
 */
export function labelForSource(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^./]+$/, '');
}
