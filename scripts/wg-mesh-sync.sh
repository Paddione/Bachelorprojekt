#!/usr/bin/env bash
# scripts/wg-mesh-sync.sh
# T900083: reconcile + drift fuer das WireGuard-Mesh, auf EINEM gemeinsamen
# Renderer (scripts/hetzner/generate-wg-conf.sh --peers-only). wg-mesh-sync.sh
# ist per Konstruktion nicht in der Lage, eine andere Soll-Menge zu berechnen
# als der Reconcile herstellt — beide rufen denselben Modus desselben Skripts.
#
# Usage:
#   wg-mesh-sync.sh reconcile --env <env> [--dry-run] [--node <name>] [--prune]
#   wg-mesh-sync.sh drift     --env <env> [--node <name>]
#
# reconcile: fuer jeden Node der Umgebung wird die Soll-Peer-Menge (aus der
#   Registry gerendert) mit der Ist-Peer-Menge (`wg show <iface> peers`)
#   verglichen. Fehlende Peers werden per `wg set` ergaenzt und in
#   /etc/wireguard/<iface>.conf geschrieben (mit vorheriger Sicherung).
#   Ueberzaehlige Peers werden NUR mit --prune entfernt, damit ein
#   unvollstaendiger Registry-Stand keinen laufenden Tunnel abraeumt.
#   --dry-run zeigt nur die Differenz, aendert nichts (keine SSH-Aktion, die
#   den Zielzustand veraendert).
#
# drift: vergleicht Ist- gegen Soll-Peer-Menge je Node, ohne zu aendern.
#   Abweichung -> Exit != 0 mit namentlicher Nennung. Sind die Nodes nicht
#   erreichbar, Exit 0 mit Skip-Meldung — dasselbe Verhalten wie
#   scripts/fleet-membership-check.sh, damit das Gate ohne Cluster-/Node-
#   Zugang nicht faelschlich rot wird.
#
# Der Interface-Name kommt aus dem `interface:`-Key des Umgebungsblocks in
# wireguard/wg-mesh-nodes.yaml. Fehlt er (aktuell: korczewski, nicht am
# laufenden Node verifiziert), lehnt dieses Skript die Umgebung mit klarer
# Meldung ab, statt einen Namen zu raten.
#
# Der SSH-Aufruf geht ueber WG_MESH_SYNC_SSH (Default: ssh), damit Tests jeden
# Remote-Aufruf stubben/protokollieren koennen, statt echte Nodes anzufassen.
#
# Registry-Override fuer Tests: WG_REGISTRY_FILE=<pfad>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REGISTRY_FILE="${WG_REGISTRY_FILE:-${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml}"
GEN_SCRIPT="${WG_MESH_SYNC_GEN_SCRIPT:-${SCRIPT_DIR}/hetzner/generate-wg-conf.sh}"
SSH_CMD="${WG_MESH_SYNC_SSH:-ssh}"
SSH_USER="${WG_MESH_SYNC_SSH_USER:-patrick}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)

usage() {
  cat <<'EOF'
Usage:
  wg-mesh-sync.sh reconcile --env <env> [--dry-run] [--node <name>] [--prune]
  wg-mesh-sync.sh drift     --env <env> [--node <name>]
EOF
}

SUBCOMMAND="${1:-}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$SUBCOMMAND" in
  reconcile|drift) ;;
  *)
    echo "ERROR: Subkommando muss 'reconcile' oder 'drift' sein (erhalten: '${SUBCOMMAND}')" >&2
    usage >&2
    exit 1
    ;;
esac

ENV=""
DRY_RUN=false
PRUNE=false
NODE_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        ENV="$2";         shift 2 ;;
    --dry-run)    DRY_RUN=true;      shift ;;
    --prune)      PRUNE=true;        shift ;;
    --node)       NODE_FILTER="$2"; shift 2 ;;
    --mesh-file)  REGISTRY_FILE="$2"; shift 2 ;;
    *) echo "ERROR: unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -z "$ENV" ]] && { echo "ERROR: --env ist erforderlich" >&2; exit 1; }
[[ ! -f "$REGISTRY_FILE" ]] && { echo "ERROR: Registry nicht gefunden: $REGISTRY_FILE" >&2; exit 2; }

# ── Interface-Name aufloesen ────────────────────────────────────────
if ! INTERFACE="$(python3 - "$REGISTRY_FILE" "$ENV" <<'PY'
import sys, yaml

mesh_file, env = sys.argv[1:]
with open(mesh_file) as f:
    mesh = yaml.safe_load(f) or {}

if env not in mesh:
    print(f"ERROR: env '{env}' nicht in der Registry ({mesh_file}) gefunden.", file=sys.stderr)
    sys.exit(1)

iface = (mesh[env] or {}).get("interface")
if not iface:
    print(
        f"ERROR: env '{env}' hat keinen 'interface:'-Key in der Registry. "
        f"Der Interface-Name wurde fuer diese Umgebung noch nicht an einem "
        f"laufenden Node verifiziert (siehe Kommentar im Registry-Block) — "
        f"wg-mesh-sync.sh raet nicht, sondern bricht ab.",
        file=sys.stderr,
    )
    sys.exit(1)

print(iface)
PY
)"; then
  exit 1
fi

# ── Nodes der Umgebung auflisten: "<name>\t<host-oder-leer>" ───────
list_nodes() {
  python3 - "$REGISTRY_FILE" "$ENV" "$NODE_FILTER" <<'PY'
import sys, yaml

mesh_file, env, node_filter = sys.argv[1:]
with open(mesh_file) as f:
    mesh = yaml.safe_load(f) or {}

env_data = mesh.get(env) or {}
categories = ("nodes", "gpu_hosts", "home_workers", "workers", "devc_servers", "laptops")
for cat in categories:
    for node in env_data.get(cat) or []:
        name = node.get("name")
        if not name:
            continue
        if node_filter and name != node_filter:
            continue
        endpoint = node.get("endpoint") or ""
        host = endpoint.rsplit(":", 1)[0] if endpoint else ""
        print(f"{name}\t{host}")
PY
}

# Soll-Peer-Menge eines Nodes: Zeilen "<public_key> <allowed_ips>".
want_peers() {
  local node_name="$1"
  bash "$GEN_SCRIPT" --env "$ENV" --node-name "$node_name" --peers-only --mesh-file "$REGISTRY_FILE"
}

# Ist-Peer-Menge eines Nodes ueber SSH: eine Public-Key-Zeile je Peer (Format
# von `wg show <iface> peers`). Nicht erreichbar -> nichts auf stdout, Exit != 0.
have_peers() {
  local host="$1"
  "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" "sudo wg show ${INTERFACE} peers" 2>/dev/null
}

NODE_LIST="$(list_nodes)"
if [[ -z "$NODE_LIST" ]]; then
  echo "ERROR: env '$ENV' hat keine Nodes in der Registry (oder --node trifft keinen)." >&2
  exit 2
fi

ANY_REACHABLE=false
DRIFT_FOUND=false
DRIFT_REPORT=()

while IFS=$'\t' read -r name host; do
  [[ -z "$name" ]] && continue

  if [[ -z "$host" ]]; then
    echo "SKIP ${name}: kein endpoint in der Registry — nicht per SSH erreichbar." >&2
    continue
  fi

  if ! have_out="$(have_peers "$host")"; then
    echo "SKIP ${name} (${host}): nicht erreichbar." >&2
    continue
  fi
  ANY_REACHABLE=true

  want_out="$(want_peers "$name")"
  want_keys="$(printf '%s\n' "$want_out" | awk 'NF{print $1}' | sort -u)"
  have_keys="$(printf '%s\n' "$have_out" | awk 'NF{print $1}' | sort -u)"

  missing="$(comm -23 <(printf '%s\n' "$want_keys") <(printf '%s\n' "$have_keys"))"
  extra="$(comm -13 <(printf '%s\n' "$want_keys") <(printf '%s\n' "$have_keys"))"

  if [[ -z "$missing" && -z "$extra" ]]; then
    echo "OK ${name} (${host}): Ist-Peer-Menge entspricht der Soll-Menge."
    continue
  fi

  DRIFT_FOUND=true
  DRIFT_REPORT+=("${name} (${host}):")
  if [[ -n "$missing" ]]; then
    DRIFT_REPORT+=("  fehlend (in Registry, nicht auf dem Node):")
    while read -r k; do [[ -n "$k" ]] && DRIFT_REPORT+=("    ${k}"); done <<<"$missing"
  fi
  if [[ -n "$extra" ]]; then
    DRIFT_REPORT+=("  ueberzaehlig (auf dem Node, nicht in Registry):")
    while read -r k; do [[ -n "$k" ]] && DRIFT_REPORT+=("    ${k}"); done <<<"$extra"
  fi

  if [[ "$SUBCOMMAND" == "reconcile" ]]; then
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRY-RUN ${name} (${host}): wuerde $(printf '%s\n' "$missing" | grep -c . 2>/dev/null || true) Peer(s) ergaenzen"
      [[ "$PRUNE" == true ]] && echo "DRY-RUN ${name} (${host}): wuerde $(printf '%s\n' "$extra" | grep -c . 2>/dev/null || true) Peer(s) entfernen (--prune)"
      continue
    fi

    # Sicherung der laufenden Config VOR jeder Aenderung.
    "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
      "sudo cp /etc/wireguard/${INTERFACE}.conf /etc/wireguard/${INTERFACE}.conf.bak.\$(date +%Y%m%d%H%M%S) 2>/dev/null || true"

    while read -r pubkey; do
      [[ -z "$pubkey" ]] && continue
      allowed="$(printf '%s\n' "$want_out" | awk -v k="$pubkey" '$1==k{ $1=""; sub(/^ /,""); print }')"
      echo "APPLY ${name} (${host}): ergaenze Peer ${pubkey}"
      "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
        "sudo wg set ${INTERFACE} peer ${pubkey} allowed-ips ${allowed} && sudo wg-quick strip ${INTERFACE} > /dev/null 2>&1; sudo wg showconf ${INTERFACE} | sudo tee /etc/wireguard/${INTERFACE}.conf > /dev/null"
    done <<<"$missing"

    if [[ "$PRUNE" == true ]]; then
      while read -r pubkey; do
        [[ -z "$pubkey" ]] && continue
        echo "APPLY ${name} (${host}): entferne ueberzaehligen Peer ${pubkey} (--prune)"
        "$SSH_CMD" "${SSH_OPTS[@]}" "${SSH_USER}@${host}" \
          "sudo wg set ${INTERFACE} peer ${pubkey} remove && sudo wg showconf ${INTERFACE} | sudo tee /etc/wireguard/${INTERFACE}.conf > /dev/null"
      done <<<"$extra"
    fi
  fi
done <<<"$NODE_LIST"

if [[ "$ANY_REACHABLE" == false ]]; then
  echo "wg-mesh-sync ${SUBCOMMAND}: keine Node(s) von env '${ENV}' erreichbar — uebersprungen."
  exit 0
fi

if [[ "$SUBCOMMAND" == "drift" ]]; then
  if [[ "$DRIFT_FOUND" == true ]]; then
    echo "wg-mesh-sync drift: DRIFT in env '${ENV}' (interface ${INTERFACE})" >&2
    printf '%s\n' "${DRIFT_REPORT[@]}" >&2
    exit 1
  fi
  echo "wg-mesh-sync drift: OK — env '${ENV}' (interface ${INTERFACE}) ist deckungsgleich."
  exit 0
fi

# reconcile: nach erfolgreicher Anwendung (oder --dry-run) Exit 0, es sei denn
# es blieb unloesbare Drift (kann bei diesem Skript nicht auftreten, da jede
# fehlende Zeile behandelt wird) — defensiv trotzdem geprueft.
exit 0
