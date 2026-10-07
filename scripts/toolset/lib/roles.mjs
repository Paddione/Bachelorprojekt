// scripts/toolset/lib/roles.mjs — Rollenvokabular der Toolset-Kette (T900980).
//
// Einzige Quelle für check.mjs, sync.mjs, lib/resolve.mjs und scripts/toolset-context.sh.
// Vorher stand die Liste viermal hart kodiert; T900858 (bachelorprojekt-* → bp-*) wurde
// deshalb nur in plan-context.sh nachgezogen, und toolset-context.sh lehnte jede bp-Rolle ab.
//
// Die Zuordnung der Legacy-Rollen spiegelt _role_allowlist in scripts/plan-context.sh:
// bp-build = infra + security, bp-run = ops + db, bp-ship = website + test.

export const ROLES = Object.freeze([
  'bp-build',
  'bp-run',
  'bp-ship',
  'orchestrator',
  // [T012912] Rolle aus agents.yaml/AGENTS.md.
  'big-pickle',
  // [T900793] Harness-Rolle `omp` (oh-my-pi, ersetzt pi-coding-agent T900529) —
  // erbt die Wildcard bewusst nicht.
  'omp',
  'all',
]);

// Rollen, die `all` abdeckt. Eigene Liste statt "alles außer omp": eine Wildcard, die sich
// still mit der Rollenliste ausdehnt, drückte einer neu aufgenommenen Rolle den kompletten
// Katalog auf.
export const WILDCARD_ROLES = Object.freeze(['bp-build', 'bp-run', 'bp-ship', 'orchestrator', 'big-pickle']);

export const LEGACY_ROLE_ALIASES = Object.freeze({
  'bachelorprojekt-infra': 'bp-build',
  'bachelorprojekt-security': 'bp-build',
  'bachelorprojekt-ops': 'bp-run',
  'bachelorprojekt-db': 'bp-run',
  'bachelorprojekt-website': 'bp-ship',
  'bachelorprojekt-test': 'bp-ship',
});

// Löst einen Aufrufer-Rollennamen auf. `all` ist nur in der Registry gültig, nicht als Anfrage.
// @returns { role, legacy } oder null bei unbekannter Rolle
export function resolveRole(name) {
  if (name !== 'all' && ROLES.includes(name)) return { role: name, legacy: null };
  if (Object.hasOwn(LEGACY_ROLE_ALIASES, name)) return { role: LEGACY_ROLE_ALIASES[name], legacy: name };
  return null;
}
