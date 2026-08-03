#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/fleet-membership-check.sh — Drift-Gate: deklarierte fleet-Node-Menge
# vs. Ist-Zustand des Clusters
# ═══════════════════════════════════════════════════════════════════
# Vergleicht die in wireguard/wg-mesh-nodes.yaml deklarierte Node-Menge
# (Abschnitt `fleet`: nodes + workers) mit den im fleet-Cluster registrierten
# Nodes. Meldet BEIDE Richtungen:
#   - deklariert-aber-abwesend (ein Node ist still aus dem Cluster gefallen),
#   - im-Cluster-aber-undeklariert (ein Node ist beigetreten, ohne registriert
#     zu werden).
#
# Exit-Codes:
#   0  Deckungsgleichheit ODER Cluster nicht erreichbar (Skip, siehe unten)
#   1  Drift — jede abweichende Richtung wird namentlich aufgelistet
#   2  Konfigurationsfehler (Registry nicht lesbar/parsebar)
#
# Ist kein Cluster erreichbar (kubectl-Fehler), wird mit klarer Meldung
# UEBERSPRUNGEN statt rot gemeldet: das Gate laeuft auch in CI-Umgebungen ohne
# Cluster-Zugang und darf dort nicht grundlos faelschlich schlagen.
#
# Registry-Override für Tests: WG_REGISTRY_FILE=<pfad>.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REGISTRY_FILE="${WG_REGISTRY_FILE:-${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml}"
KUBECTL="${KUBECTL:-kubectl}"
KUBE_CONTEXT="${FLEET_KUBE_CONTEXT:-fleet}"

if [[ ! -f "$REGISTRY_FILE" ]]; then
  echo "ERROR: Registry nicht gefunden: ${REGISTRY_FILE}" >&2
  exit 2
fi

# ── 1. Deklarierte fleet-Nodes aus der Registry lesen ──────────────
# Nur der Abschnitt `fleet` (nodes + workers) zaehlt — mentolder/korczewski
# sind eigene Meshes und beschreiben keine fleet-Cluster-Mitgliedschaft.
# Und nur Eintraege mit `k8s_node: true` sind Kubernetes-Nodes: das fleet-Mesh
# enthaelt auch reine wg-Peers (terminal-sidekick), die nie in `kubectl get
# nodes` auftauchen und das Gate sonst dauerhaft rot haetten (T002630).
if ! DECLARED="$(python3 - "$REGISTRY_FILE" <<'PY'
import sys
try:
    import yaml
except ImportError:
    sys.stderr.write("ERROR: PyYAML nicht installiert (pip install pyyaml)\n")
    sys.exit(2)

with open(sys.argv[1]) as f:
    data = yaml.safe_load(f) or {}

fleet = data.get("fleet") or {}
names = []
for section in ("nodes", "workers"):
    for entry in fleet.get(section) or []:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if name and entry.get("k8s_node"):
            names.append(name)
print("\n".join(sorted(names)))
PY
)"; then
  echo "ERROR: Registry ${REGISTRY_FILE} nicht parsebar." >&2
  exit 2
fi

if [[ -z "$DECLARED" ]]; then
  echo "ERROR: Registry ${REGISTRY_FILE} deklariert keine fleet-Nodes (Abschnitt \`fleet\`)." >&2
  exit 2
fi

# ── 2. Ist-Zustand des Clusters ────────────────────────────────────
# `kubectl get nodes -o name` liefert `node/<name>`, eine pro Zeile.
if ! ACTUAL_RAW="$("${KUBECTL}" --context "${KUBE_CONTEXT}" get nodes -o name 2>/dev/null)"; then
  echo "fleet-membership: Cluster nicht erreichbar (kubectl --context ${KUBE_CONTEXT} get nodes fehlgeschlagen) — uebersprungen."
  exit 0
fi
ACTUAL="$(printf '%s\n' "$ACTUAL_RAW" | sed -n 's#^node/##p' | sort)"

# ── 3. Beide Drift-Richtungen berechnen ────────────────────────────
ABSENT="$(comm -23 <(printf '%s\n' "$DECLARED") <(printf '%s\n' "$ACTUAL"))"
UNDECLARED="$(comm -13 <(printf '%s\n' "$DECLARED") <(printf '%s\n' "$ACTUAL"))"

if [[ -z "$ABSENT" && -z "$UNDECLARED" ]]; then
  echo "fleet-membership: OK — deklarierte Node-Menge stimmt mit dem Cluster ueberein."
  exit 0
fi

echo "fleet-membership: DRIFT zwischen Registry (${REGISTRY_FILE}) und Cluster (context ${KUBE_CONTEXT})" >&2
if [[ -n "$ABSENT" ]]; then
  echo "  deklariert, aber NICHT im Cluster:" >&2
  printf '%s\n' "$ABSENT" | sed 's/^/    /' >&2
fi
if [[ -n "$UNDECLARED" ]]; then
  echo "  im Cluster, aber NICHT deklariert:" >&2
  printf '%s\n' "$UNDECLARED" | sed 's/^/    /' >&2
fi
exit 1
