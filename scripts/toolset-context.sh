#!/usr/bin/env bash
# scripts/toolset-context.sh — kuratierten Werkzeug-Block für eine Agenten-Rolle rendern.
#
# Pendant zu scripts/plan-context.sh: der Aufrufer umschließt die Ausgabe mit <toolset>-Tags
# und hängt sie vor den Agent-Prompt.
#
#   tools=$(bash scripts/toolset-context.sh bachelorprojekt-db)
#   [ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${task_prompt}"
#
# Usage:
#   scripts/toolset-context.sh <rolle> [--json]
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

VALID_ROLES=(
  bachelorprojekt-website
  bachelorprojekt-ops
  bachelorprojekt-infra
  bachelorprojekt-test
  bachelorprojekt-db
  bachelorprojekt-security
  orchestrator
)

usage() {
  printf 'Usage: toolset-context.sh <rolle> [--json]\n' >&2
  printf 'Gueltige Rollen: %s\n' "${VALID_ROLES[*]}" >&2
}

if [[ $# -lt 1 ]]; then
  printf 'FEHLER: keine Rolle angegeben.\n' >&2
  usage
  exit 2
fi

ROLE="$1"
shift

AS_JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) AS_JSON=1; shift ;;
    *) printf 'FEHLER: unbekanntes Argument "%s".\n' "$1" >&2; usage; exit 2 ;;
  esac
done

role_is_valid=0
for valid in "${VALID_ROLES[@]}"; do
  [[ "$ROLE" == "$valid" ]] && { role_is_valid=1; break; }
done

if [[ "$role_is_valid" -ne 1 ]]; then
  # Kein Fallback auf "alle Instanzen" — siehe Kopfkommentar.
  printf 'FEHLER: unbekannte Rolle "%s".\n' "$ROLE" >&2
  usage
  exit 2
fi

if [[ ! -f "$REGISTRY" ]]; then
  printf 'FEHLER: Registry nicht gefunden: %s\n' "$REGISTRY" >&2
  exit 3
fi

# YAML wird mit js-yaml geparst statt in Bash zerlegt. Ein bash-eigener YAML-Parser bricht an
# der ersten mehrzeiligen Zeichenkette und waere hier nichts als ein kuenftiger Bug.
TOOLSET_REGISTRY="$REGISTRY" TOOLSET_ROLE="$ROLE" TOOLSET_JSON="$AS_JSON" \
node --input-type=module -e '
import fs from "node:fs";
import yaml from "js-yaml";

const registryPath = process.env.TOOLSET_REGISTRY;
const role = process.env.TOOLSET_ROLE;
const asJson = process.env.TOOLSET_JSON === "1";

const data = yaml.load(fs.readFileSync(registryPath, "utf8"));
const capabilities = (data && data.capabilities) || {};

const picked = [];
for (const [capName, instances] of Object.entries(capabilities)) {
  for (const [instKey, cfg] of Object.entries(instances || {})) {
    // Eine unterdrueckte Instanz darf einem Agenten nie gezeigt werden.
    if (!cfg || cfg.state === "suppressed") continue;
    // Ohne roles ist die Instanz unkuriert und hat in einem Prompt nichts verloren.
    if (!Array.isArray(cfg.roles)) continue;
    if (!cfg.roles.includes(role) && !cfg.roles.includes("all")) continue;
    picked.push({
      capability: capName,
      instance: instKey,
      state: cfg.state,
      use_when: cfg.use_when || null,
      avoid_when: cfg.avoid_when || null,
      fallback: cfg.fallback || null,
      tier: cfg.tier || null,
      deep_ref: cfg.deep_ref || null,
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
  out.push("");
}
process.stdout.write(out.join("\n"));
'
