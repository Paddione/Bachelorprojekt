#!/usr/bin/env bash
# Liegt nach der Installation unter /usr/local/sbin/k3s-join.sh.
# Zieht den Node in einen k3s-Cluster — bewusst NACH der Installation, weil
# Rolle und Token erst feststehen, wenn alle Maschinen laufen.
#
# Reihenfolge bei drei Workstations (HA mit embedded etcd):
#   Node 1:  k3s-join.sh --role init --token "$T"
#   Node 2:  k3s-join.sh --role server --token "$T" --server https://<ip-node-1>:6443
#   Node 3:  k3s-join.sh --role server --token "$T" --server https://<ip-node-1>:6443
#
# Als Worker in einen bestehenden Cluster stattdessen:
#   k3s-join.sh --role agent --token "$T" --server https://<cp-ip>:6443
#
# Token frei waehlen (>= 32 Zeichen), auf allen drei Nodes identisch:
#   openssl rand -hex 32
#
# etcd braucht ungerade Server-Anzahl: 3 Server = ein Ausfall wird verkraftet.
# Zwei Server sind schlechter als einer — sie verlieren bei jedem Ausfall das
# Quorum. Deshalb entweder alle drei als --role server, oder einer init + zwei
# agent (dann ohne HA).
set -euo pipefail

K3S_VERSION_DEFAULT="__K3S_VERSION__"

ROLE=""
TOKEN=""
SERVER_URL=""
NODE_IP=""
FLANNEL_IFACE=""
K3S_VERSION="${K3S_VERSION:-$K3S_VERSION_DEFAULT}"
ENABLE_UFW=1

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role)          ROLE="$2";          shift 2 ;;
    --token)         TOKEN="$2";         shift 2 ;;
    --server)        SERVER_URL="$2";    shift 2 ;;
    --node-ip)       NODE_IP="$2";       shift 2 ;;
    --flannel-iface) FLANNEL_IFACE="$2"; shift 2 ;;
    --k3s-version)   K3S_VERSION="$2";   shift 2 ;;
    --no-ufw)        ENABLE_UFW=0;       shift ;;
    -h|--help)       usage 0 ;;
    *) echo "Unbekanntes Flag: $1" >&2; usage 1 ;;
  esac
done

# Argumente zuerst pruefen, root erst danach: ein Tippfehler soll die Ursache
# nennen statt "als root ausfuehren".
case "$ROLE" in
  init|server|agent) ;;
  "") echo "ERROR: --role fehlt (init|server|agent)" >&2; exit 1 ;;
  *)  echo "ERROR: unbekannte Rolle '$ROLE' (init|server|agent)" >&2; exit 1 ;;
esac
[[ -n "$TOKEN" ]] || { echo "ERROR: --token fehlt" >&2; exit 1; }
if [[ "$ROLE" != "init" && -z "$SERVER_URL" ]]; then
  echo "ERROR: --server wird fuer Rolle '$ROLE' gebraucht" >&2; exit 1
fi
if [[ "$ROLE" == "init" && -n "$SERVER_URL" ]]; then
  echo "ERROR: --server ist bei --role init falsch — init startet den Cluster" >&2
  exit 1
fi

[[ $EUID -eq 0 ]] || { echo "ERROR: als root ausfuehren (sudo)" >&2; exit 1; }

if command -v k3s >/dev/null 2>&1; then
  echo "ERROR: k3s ist bereits installiert. Erst deinstallieren:" >&2
  echo "  /usr/local/bin/k3s-uninstall.sh   (Server)" >&2
  echo "  /usr/local/bin/k3s-agent-uninstall.sh   (Agent)" >&2
  exit 1
fi

# Node-IP: ohne Angabe die IP der Default-Route. k3s raet sonst bei mehreren
# NICs falsch, und ein Node mit falscher node-ip ist im Cluster unerreichbar.
if [[ -z "$NODE_IP" ]]; then
  NODE_IP="$(ip -4 -o route get 1.1.1.1 2>/dev/null \
    | grep -o 'src [0-9.]*' | awk '{print $2}')"
fi
[[ -n "$NODE_IP" ]] || { echo "ERROR: node-ip nicht ermittelbar, --node-ip angeben" >&2; exit 1; }

echo "==> Rolle:      $ROLE"
echo "==> Node-IP:    $NODE_IP"
echo "==> k3s:        $K3S_VERSION"
[[ -n "$SERVER_URL" ]] && echo "==> Server-URL: $SERVER_URL"

# --- /etc/rancher/k3s/config.yaml -------------------------------------------
install -d -m 0755 /etc/rancher/k3s
{
  echo "node-ip: \"${NODE_IP}\""
  [[ -n "$FLANNEL_IFACE" ]] && echo "flannel-iface: \"${FLANNEL_IFACE}\""
  if [[ "$ROLE" == "agent" ]]; then
    echo "node-label:"
    echo "  - \"node-role.kubernetes.io/worker=true\""
  else
    echo "tls-san:"
    echo "  - \"${NODE_IP}\""
    echo "write-kubeconfig-mode: \"0640\""
  fi
} > /etc/rancher/k3s/config.yaml

# --- Firewall ---------------------------------------------------------------
if [[ "$ENABLE_UFW" -eq 1 ]] && command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp    comment 'SSH'          >/dev/null
  ufw allow 6443/tcp  comment 'k3s API'      >/dev/null
  ufw allow 10250/tcp comment 'kubelet'      >/dev/null
  ufw allow 8472/udp  comment 'Flannel VXLAN' >/dev/null
  if [[ "$ROLE" != "agent" ]]; then
    ufw allow 2379:2380/tcp comment 'etcd' >/dev/null
  fi
  ufw --force enable >/dev/null
  echo "==> ufw aktiv"
fi

systemctl enable --now iscsid >/dev/null 2>&1 || true

# --- k3s installieren -------------------------------------------------------
export INSTALL_K3S_VERSION="$K3S_VERSION"
export K3S_TOKEN="$TOKEN"

case "$ROLE" in
  init)
    curl -sfL https://get.k3s.io | sh -s - server --cluster-init
    ;;
  server)
    export K3S_URL=""   # server-Rolle nutzt --server, nicht K3S_URL
    curl -sfL https://get.k3s.io | sh -s - server --server "$SERVER_URL"
    ;;
  agent)
    export K3S_URL="$SERVER_URL"
    curl -sfL https://get.k3s.io | sh -
    ;;
esac

echo
if [[ "$ROLE" == "agent" ]]; then
  echo "Fertig. Node registriert gegen ${SERVER_URL}."
  echo "Pruefen auf einem Server-Node: kubectl get nodes -o wide"
else
  # Kurz auf die Registrierung warten: direkt nach dem Install meldet
  # kubectl sonst "No resources found" und der Lauf sieht fehlgeschlagen aus,
  # obwohl der Node Sekunden spaeter Ready ist.
  echo "Warte auf Node-Registrierung (bis 120s)..."
  k3s kubectl wait --for=condition=Ready node --all --timeout=120s >/dev/null 2>&1 || true
  echo "Cluster-Status:"
  k3s kubectl get nodes -o wide || true
  echo
  echo "Token fuer weitere Nodes: $(cat /var/lib/rancher/k3s/server/node-token)"
  echo "kubeconfig: /etc/rancher/k3s/k3s.yaml (server: auf ${NODE_IP} umschreiben)"
fi
