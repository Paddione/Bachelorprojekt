#!/bin/bash
# Strukturiertes Eskalations-Signal für feststeckende Agenten.
# Agenten rufen dieses Script auf, wenn sie blockiert sind — statt blind weiterzumachen.

set -euo pipefail

AGENT=""
REASON=""
TRIED=""
NEEDS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)  AGENT="$2";  shift 2 ;;
    --reason) REASON="$2"; shift 2 ;;
    --tried)  TRIED="$2";  shift 2 ;;
    --needs)  NEEDS="$2";  shift 2 ;;
    *) shift ;;
  esac
done

[[ -z "$AGENT" ]]  && { echo "Usage: $0 --agent <name> --reason <text> [--tried <text>] [--needs <text>]" >&2; exit 1; }
[[ -z "$REASON" ]] && { echo "--reason ist Pflicht" >&2; exit 1; }

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo ".")"

# Nachricht an alle lebenden Sessions posten
if [[ -f "${REPO_ROOT}/scripts/agent-msg.sh" ]]; then
  bash "${REPO_ROOT}/scripts/agent-msg.sh" post "ESCALATION [${AGENT}]: ${REASON}" 2>/dev/null || true
fi

# Strukturierter Eskalations-Block — Orchestrator parst diesen Block
cat <<EOF

=== AGENT ESCALATION ===
Agent:  ${AGENT}
Reason: ${REASON}
Tried:  ${TRIED:-"(nicht angegeben)"}
Needs:  ${NEEDS:-"(nicht angegeben)"}
Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)

Wissensdatenbanken zum Nachschlagen:
  • docs/agent-guide/maps/goals-map.md  — Intention → Flow → Gefahr-Tier
  • CLAUDE.md#gotchas-footguns          — domain-spezifische Fallstricke
  • AGENTS.md                           — Routing, Koordinations-Commands
  • .claude/agents/${AGENT}.md          — Vollständiges Agent-Profil

Orchestrator-Aktion:
  Mit fehlendem Kontext in <active-plans>-Tags neu dispatchen
  oder User um Klärung bitten, bevor erneut versucht wird.
========================

EOF
