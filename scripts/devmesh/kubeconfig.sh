#!/usr/bin/env bash
# scripts/devmesh/kubeconfig.sh — Admin-Kubeconfig eines devmesh-Servers als Context "devmesh" mergen [T900117]
#
# Usage: kubeconfig.sh [<server>]
#   <server>  Name aus devmesh/inventory.yaml mit k3s_role server-init|server-join
#             (Default: der server-init-Host). Faellt dieser aus, auf einen anderen Server umschalten.
#
# Der API-Server im Context ist der Tailnet-Name des Servers (design.md D3): zu Hause direkter
# Pfad, unterwegs DERP. Andere Contexts und current-context bleiben unangetastet.
#
# Umgebung: DEVMESH_INVENTORY, DEVMESH_SSH_USER, DEVMESH_SSH_KEY,
#           KUBECONFIG_TARGET (Default: erster Eintrag aus $KUBECONFIG, sonst ~/.kube/config)
# Exit 0 gemerged, 1 Befund, 2 Vorbedingung fehlt (yq, ssh, SSH-Zugang, Inventar).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

need yq
need ssh
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

SERVER="${1:-$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | .[0].name // ""' "$INVENTORY")}"
[[ -n "$SERVER" ]] || die "kein server-init im Inventar"
peer() { HOST="$SERVER" yq -r ".peers[] | select(.name == strenv(HOST)) | .$1 // \"\"" "$INVENTORY"; }
ROLE="$(peer k3s_role)"
LAN_IP="$(peer lan_ip)"
TAILNET="$(peer tailnet_name)"
case "$ROLE" in
  server-init|server-join) ;;
  *) die "'$SERVER' ist kein devmesh-Server (k3s_role '${ROLE}')" ;;
esac
[[ -n "$LAN_IP" && -n "$TAILNET" ]] || die "lan_ip oder tailnet_name fehlt fuer '$SERVER'"

TARGET="${KUBECONFIG_TARGET:-${KUBECONFIG:-$HOME/.kube/config}}"
TARGET="${TARGET%%:*}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rc=0
ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "${SSH_USER}@${LAN_IP}" "sudo -n cat /etc/rancher/k3s/k3s.yaml" > "$TMP/devmesh.yaml" || rc=$?
if (( rc == 255 )); then echo "Vorbedingung fehlt: SSH zu ${SSH_USER}@${LAN_IP}" >&2; exit 2; fi
(( rc == 0 )) || die "k3s.yaml auf $SERVER nicht lesbar (Exit $rc)"
[[ "$(yq -r '.clusters | length' "$TMP/devmesh.yaml" 2>/dev/null)" == 1 ]] \
  || die "Antwort von $SERVER ist keine k3s-Kubeconfig mit genau einem Cluster"

SERVER_URL="https://${TAILNET}:6443" yq -i '
  .clusters[0].name = "devmesh" |
  .clusters[0].cluster.server = strenv(SERVER_URL) |
  .users[0].name = "devmesh" |
  .contexts[0].name = "devmesh" |
  .contexts[0].context.cluster = "devmesh" |
  .contexts[0].context.user = "devmesh" |
  .["current-context"] = "devmesh"' "$TMP/devmesh.yaml"

if [[ -s "$TARGET" ]]; then
  cp "$TARGET" "$TMP/merged.yaml"
else
  printf 'apiVersion: v1\nkind: Config\nclusters: []\nusers: []\ncontexts: []\n' > "$TMP/merged.yaml"
fi
NEW="$TMP/devmesh.yaml" yq -i '
  .clusters = ((.clusters // []) | map(select(.name != "devmesh"))) + load(strenv(NEW)).clusters |
  .users    = ((.users // [])    | map(select(.name != "devmesh"))) + load(strenv(NEW)).users |
  .contexts = ((.contexts // [])  | map(select(.name != "devmesh"))) + load(strenv(NEW)).contexts |
  .["current-context"] = (.["current-context"] // "devmesh")' "$TMP/merged.yaml"
[[ "$(yq -r '[.contexts[] | select(.name == "devmesh")] | length' "$TMP/merged.yaml")" == 1 ]] \
  || die "Merge ergab nicht genau einen Context devmesh"

mkdir -p "$(dirname "$TARGET")"
install -m 0600 "$TMP/merged.yaml" "$TARGET"
echo "Context devmesh -> https://${TAILNET}:6443 (${SERVER})"
