#!/usr/bin/env bash
# scripts/devmesh/k3s-install.sh — k3s auf einem devmesh-Host installieren [T900117]
#
# Usage: k3s-install.sh <host>
#   <host>  Name aus devmesh/inventory.yaml (peers[].name) mit k3s_role
#           server-init | server-join | agent
#
# Umgebung:
#   DRY_RUN=1          nur den Installationsbefehl ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Idempotent: laeuft auf dem Host bereits k3s_version mit identischen Argumenten, endet
# das Skript ohne Aenderung mit Exit 0. Das Join-Token geht nur ueber stdin, nie in argv.
# Exit 0 installiert/unveraendert, 1 Befund (Inventar, Installation), 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
ARGS_FILE=/etc/rancher/k3s/devmesh-install.args
SERVER_ROLES='.k3s_role == "server-init" or .k3s_role == "server-join"'
# Cluster-Netze, identisch auf allen Servern. Bewusst nicht 10.42/10.43: die belegt fleet,
# und PK-Desktop routet sie ueber wg-gpu. Registriert in docs/agent-guide/registry/networks.yaml.
CLUSTER_CIDR=10.52.0.0/16
SERVICE_CIDR=10.53.0.0/16
CLUSTER_DNS=10.53.0.10

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

[[ $# -eq 1 ]] || die "genau ein Argument erwartet: <host> (siehe Kopfkommentar)"
HOST="$1"
need yq
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

peer() { HOST="$HOST" yq -r ".peers[] | select(.name == strenv(HOST)) | .$1 // \"\"" "$INVENTORY"; }

VERSION="$(yq -r '.k3s_version // ""' "$INVENTORY")"
LAN_IP="$(peer lan_ip)"
ROLE="$(peer k3s_role)"
[[ -n "$LAN_IP" ]] || die "Host '$HOST' nicht im Inventar oder ohne lan_ip"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$ ]] || die "k3s_version '$VERSION' ungueltig (Form v1.36.1+k3s1)"
case "$ROLE" in
  server-init|server-join|agent) ;;
  *) die "k3s_role '$ROLE' fuer '$HOST' ungueltig (server-init|server-join|agent)" ;;
esac
[[ "$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | length' "$INVENTORY")" == 1 ]] \
  || die "Inventar braucht genau einen Host mit k3s_role server-init"
INIT_IP="$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | .[0].lan_ip // ""' "$INVENTORY")"
MISSING="$(yq -r "[.peers[] | select(($SERVER_ROLES) and ((.tailnet_name // \"\") == \"\"))] | map(.name) | join(\",\")" "$INVENTORY")"
[[ -z "$MISSING" ]] || die "tailnet_name fehlt fuer: $MISSING (wird fuer --tls-san gebraucht)"

# --- Argumente ----------------------------------------------------------------
args=()
case "$ROLE" in
  server-init) args+=(server --cluster-init) ;;
  server-join) args+=(server --server "https://${INIT_IP}:6443") ;;
  agent)       args+=(agent --server "https://${INIT_IP}:6443") ;;
esac
args+=(--node-ip "$LAN_IP")
while IFS= read -r label; do
  if [[ -n "$label" ]]; then args+=(--node-label "$label"); fi
done < <(HOST="$HOST" yq -r '.peers[] | select(.name == strenv(HOST)) | (.labels // []) | .[]' "$INVENTORY")
if [[ "$ROLE" != agent ]]; then
  args+=(--flannel-backend=wireguard-native)
  while IFS= read -r san; do
    args+=(--tls-san "$san")
  done < <(yq -r ".peers[] | select($SERVER_ROLES) | (.lan_ip, .tailnet_name)" "$INVENTORY")
  args+=("--etcd-snapshot-schedule-cron=0 */6 * * *" --etcd-snapshot-retention=20)
  args+=("--cluster-cidr=${CLUSTER_CIDR}" "--service-cidr=${SERVICE_CIDR}" "--cluster-dns=${CLUSTER_DNS}")
fi

ARGS_STR=""
for a in "${args[@]}"; do ARGS_STR+="$(printf '%q' "$a") "; done
ARGS_STR="${ARGS_STR% }"
CMD="curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=$(printf '%q' "$VERSION") sh -s - ${ARGS_STR}"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "host:    $HOST ($ROLE, $LAN_IP)"
  if [[ "$ROLE" != server-init ]]; then
    echo "token:   aus ${INIT_IP}:/var/lib/rancher/k3s/server/token (wird nicht ausgegeben)"
  fi
  echo "command: $CMD"
  exit 0
fi

# --- Remote -------------------------------------------------------------------
need ssh
remote() {
  local ip="$1"; shift
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${ip}" "$@"
}

remote "$LAN_IP" "sudo -n true" \
  || { echo "Vorbedingung fehlt: SSH/sudo ohne Passwort auf ${SSH_USER}@${LAN_IP}" >&2; exit 2; }

STATE="$(remote "$LAN_IP" "sudo -n sh -c 'k3s --version 2>/dev/null | head -n1; echo ---; cat $ARGS_FILE 2>/dev/null; true'")"
CUR_VERSION="$(printf '%s\n' "$STATE" | head -n1)"
CUR_ARGS="$(printf '%s\n' "$STATE" | awk 'f {print} /^---$/ {f = 1}')"
if [[ "$CUR_VERSION" == *" $VERSION "* && "$CUR_ARGS" == "$ARGS_STR" ]]; then
  echo "unveraendert: $HOST laeuft k3s $VERSION mit identischen Argumenten"
  exit 0
fi

TOKEN=""
if [[ "$ROLE" != server-init ]]; then
  TOKEN="$(remote "$INIT_IP" "sudo -n cat /var/lib/rancher/k3s/server/token")" \
    || die "Token von ${INIT_IP} nicht lesbar (laeuft server-init schon?)"
  [[ -n "$TOKEN" ]] || die "Token von ${INIT_IP} ist leer"
fi

remote_body() {
  echo 'set -euo pipefail'
  if [[ -n "$TOKEN" ]]; then printf 'export K3S_TOKEN=%q\n' "$TOKEN"; fi
  echo 'command -v ufw >/dev/null || { echo "ufw fehlt auf $(hostname)" >&2; exit 1; }'
  cat << 'UFW'
ufw allow from 10.0.0.0/8    to any port 22        proto tcp comment 'devmesh ssh lan'
ufw allow from 100.64.0.0/10 to any port 22        proto tcp comment 'devmesh ssh tailnet'
ufw allow from 10.0.0.0/8    to any port 10250     proto tcp comment 'k3s kubelet'
ufw allow from 10.0.0.0/8    to any port 51820     proto udp comment 'k3s flannel wireguard'
UFW
  printf "ufw allow from %s comment 'devmesh pods'\n" "$CLUSTER_CIDR"
  printf "ufw allow from %s comment 'devmesh services'\n" "$SERVICE_CIDR"
  if [[ "$ROLE" != agent ]]; then
    cat << 'UFW'
ufw allow from 10.0.0.0/8    to any port 6443      proto tcp comment 'k3s api lan'
ufw allow from 100.64.0.0/10 to any port 6443      proto tcp comment 'k3s api tailnet'
ufw allow from 10.0.0.0/8    to any port 2379:2380 proto tcp comment 'k3s etcd'
ufw allow from 10.0.0.0/8    to any port 80        proto tcp comment 'traefik http'
ufw allow from 10.0.0.0/8    to any port 443       proto tcp comment 'traefik https lan'
ufw allow from 100.64.0.0/10 to any port 443       proto tcp comment 'traefik https tailnet'
UFW
  fi
  echo 'ufw --force enable'
  printf '%s\n' "$CMD"
  if [[ "$ROLE" == agent ]]; then
    echo 'systemctl is-active --quiet k3s-agent'
  else
    cat << 'WAIT'
for _ in $(seq 1 36); do k3s kubectl get node "$(hostname)" >/dev/null 2>&1 && break; sleep 5; done
k3s kubectl wait --for=condition=Ready "node/$(hostname)" --timeout=180s
WAIT
  fi
  # Argumente erst nach erfolgreicher Installation festhalten: ein abgebrochener Lauf
  # gilt beim naechsten Aufruf nicht als "unveraendert".
  printf 'printf %%s %q > %s\n' "$ARGS_STR" "$ARGS_FILE"
}

rc=0
remote_body | remote "$LAN_IP" "sudo -n bash -s" || rc=$?
(( rc == 0 )) || die "Installation auf $HOST fehlgeschlagen (Exit $rc)"
echo "installiert: $HOST ($ROLE) k3s $VERSION"
