#!/usr/bin/env bash
# scripts/toolset-context.sh — kuratierten Werkzeug-Block für eine Agenten-Rolle rendern.
#
# Pendant zu scripts/plan-context.sh: der Aufrufer umschließt die Ausgabe mit <toolset>-Tags
# und hängt sie vor den Agent-Prompt.
#
#   tools=$(bash scripts/toolset-context.sh bp-run) || exit 1
#   [ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${task_prompt}"
#
# Usage:
#   scripts/toolset-context.sh <rolle> [--json]
#
# Rollenvokabular: scripts/toolset/lib/roles.mjs (T900980) — dieselbe Quelle wie check.mjs.
# Legacy-Rollen (bachelorprojekt-*) werden auf ihre bp-Rolle aufgelöst und mit einem
# `veraltet`-Hinweis auf stderr quittiert.
#
# ⚠ FAIL-CLOSED bei unbekannter Rolle — das ist der bewusste Unterschied zu plan-context.sh.
# Jenes fällt bei einer unbekannten Rolle still auf __ALL__ zurück und gibt nur `WARN: unknown
# role` auf stderr aus; der Rollenfilter wirkt dann gar nicht (T002322, dokumentiert in
# CLAUDE.md). Für Pläne ist das lästig, für einen Werkzeug-Block wäre es schädlich: eine
# vertippte Rolle injizierte das vollständige Arsenal in jeden Prompt und erzeugte damit genau
# den Kontext-Bloat, gegen den kuriert wird. Diese Abweichung bitte nicht "vereinheitlichen".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY="${TOOLSET_REGISTRY:-$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml}"

if [[ $# -lt 1 ]]; then
  printf 'FEHLER: keine Rolle angegeben.\n' >&2
  printf 'Usage: toolset-context.sh <rolle> [--json]\n' >&2
  exit 2
fi

ROLE="$1"
shift

AS_JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) AS_JSON=1; shift ;;
    *) printf 'FEHLER: unbekanntes Argument "%s".\n' "$1" >&2
       printf 'Usage: toolset-context.sh <rolle> [--json]\n' >&2
       exit 2 ;;
  esac
done

# YAML wird mit js-yaml geparst statt in Bash zerlegt. Ein bash-eigener YAML-Parser bricht an
# der ersten mehrzeiligen Zeichenkette und waere hier nichts als ein kuenftiger Bug.
# Rollenpruefung VOR dem Registry-Zugriff: eine ungueltige Rolle gibt nie eine Instanz aus.
TOOLSET_REGISTRY="$REGISTRY" TOOLSET_ROLE="$ROLE" TOOLSET_JSON="$AS_JSON" \
  TOOLSET_ROLES_MODULE="$REPO_ROOT/scripts/toolset/lib/roles.mjs" \
  TOOLSET_TOOLS_MODULE="$REPO_ROOT/scripts/toolset/lib/tools.mjs" \
node --input-type=module -e '
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as yamlPkg from "js-yaml";
const yaml = yamlPkg.default ?? yamlPkg;
const { ROLES, WILDCARD_ROLES, resolveRole } = await import(pathToFileURL(process.env.TOOLSET_ROLES_MODULE).href);
const { defaultLockPath, loadLock, toolsForInstance, tierRank } = await import(pathToFileURL(process.env.TOOLSET_TOOLS_MODULE).href);

const requested = process.env.TOOLSET_ROLE;
const asJson = process.env.TOOLSET_JSON === "1";

const resolved = resolveRole(requested);
if (!resolved) {
  // Kein Fallback auf "alle Instanzen" — siehe Kopfkommentar.
  process.stderr.write(`FEHLER: unbekannte Rolle "${requested}".\n`);
  process.stderr.write("Usage: toolset-context.sh <rolle> [--json]\n");
  process.stderr.write(`Gueltige Rollen: ${ROLES.filter(r => r !== "all").join(" ")}\n`);
  process.exit(2);
}
const role = resolved.role;
if (resolved.legacy) {
  process.stderr.write(`WARN: Rolle "${resolved.legacy}" ist veraltet (T900858) — verwende "${role}".\n`);
}

const registryPath = process.env.TOOLSET_REGISTRY;
if (!fs.existsSync(registryPath)) {
  process.stderr.write(`FEHLER: Registry nicht gefunden: ${registryPath}\n`);
  process.exit(3);
}

const data = yaml.load(fs.readFileSync(registryPath, "utf8"));
const capabilities = (data && data.capabilities) || {};
// T900983 D6: Lock neben der Registry, ausser TOOLSET_LOCK ist gesetzt.
const lock = loadLock(defaultLockPath(registryPath));

const picked = [];
for (const [capName, instances] of Object.entries(capabilities)) {
  for (const [instKey, cfg] of Object.entries(instances || {})) {
    // Eine unterdrueckte Instanz darf einem Agenten nie gezeigt werden.
    if (!cfg || cfg.state === "suppressed") continue;
    // Ohne roles ist die Instanz unkuriert und hat in einem Prompt nichts verloren.
    if (!Array.isArray(cfg.roles)) continue;
    const covered = cfg.roles.includes(role) || (cfg.roles.includes("all") && WILDCARD_ROLES.includes(role));
    if (!covered) continue;
    picked.push({
      capability: capName,
      instance: instKey,
      state: cfg.state,
      use_when: cfg.use_when || null,
      avoid_when: cfg.avoid_when || null,
      fallback: cfg.fallback || null,
      tier: cfg.tier || null,
      deep_ref: cfg.deep_ref || null,
      // T900983: Tools mit aufgeloestem Tier aus dem Lock; leer ohne Lock-Eintrag.
      tools: toolsForInstance(instKey, cfg, lock),
    });
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify(picked, null, 2) + "\n");
  process.exit(0);
}

// Leere Ergebnismenge ist kein Fehler: der Aufrufer faengt sie mit `[ -n "$context" ]` ab,
// genau wie bei plan-context.sh.
if (picked.length === 0) process.exit(0);

const out = [];
out.push(`## Kuratierte Werkzeuge — Rolle: ${role}`);
out.push("");
for (const p of picked) {
  const tier = p.tier ? ` (${p.tier})` : "";
  out.push(`### ${p.capability} → \`${p.instance}\`${tier}`);
  // Nicht gesetzte Felder erzeugen KEINE leere Zeile — ein Prompt-Block ist Kontextbudget,
  // und leere Rubriken kosten Tokens ohne Aussage.
  if (p.use_when)   out.push(`- **Wann:** ${p.use_when}`);
  if (p.avoid_when) out.push(`- **Nicht:** ${p.avoid_when}`);
  if (p.fallback)   out.push(`- **Fallback:** \`${p.fallback}\``);
  if (p.deep_ref)   out.push(`- **Tiefe:** \`${p.deep_ref}\``);
  // T900983 D5: einzeln nur Tools ab caution, die ueber dem Instanz-Tier liegen — der Tier im
  // Header deckt den Rest ab. Der Rest wird je Tier gezaehlt; ein Server mit 46 Tools darf den
  // Block nicht aufblaehen.
  if (p.tools.length > 0) {
    const base = tierRank(p.tier || "safe");
    const named = p.tools.filter(t => tierRank(t.tier) >= tierRank("caution") && tierRank(t.tier) > base);
    const counts = {};
    for (const t of p.tools) if (!named.includes(t)) counts[t.tier] = (counts[t.tier] || 0) + 1;
    const parts = named.map(t => `\`${t.name}\` (${t.tier})`);
    for (const [tier, n] of Object.entries(counts).sort((a, b) => tierRank(b[0]) - tierRank(a[0]))) parts.push(`+${n} ${tier}`);
    out.push(`- **Tools:** ${parts.join(", ")}`);
  }
  out.push("");
}
process.stdout.write(out.join("\n"));
'
