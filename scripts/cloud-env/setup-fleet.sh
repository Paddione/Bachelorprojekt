#!/usr/bin/env bash
# scripts/cloud-env/setup-fleet.sh - Cloud-Umgebung "mentolder-prod" (Claude Code on the web) an fleet anbinden
#
#   install   einmalig (Setup-Skript-Feld der Umgebung): kubectl, tailscale
#   connect   je Session: Tailscale (Userspace, SOCKS5) starten, Kubeconfig schreiben, API pruefen
#
# Netzpfad: wie scripts/cloud-env/setup.sh. tailscaled laeuft im Userspace-Modus, kubectl geht ueber den
# SOCKS5-Proxy an den Tailnet-Namen des API-Servers (Server-URL der Kubeconfig, *.ts.net).
# Zeigt die Kubeconfig auf eine oeffentliche IP, wird Tailscale uebersprungen (TS_AUTHKEY dann nicht noetig).
# Zugang: ServiceAccount-Token aus scripts/cloud-env/fleet-kubeconfig.sh (FLEET_API=https://<tailnet-name>:6443).
# Netzwerkzugriff der Umgebung: controlplane.tailscale.com, DERP, tailscale.com, dl.k8s.io ("Full" oder Hostliste).
# Doku: docs/runbooks/cloud-env-fleet.md
#
# Variablen: FLEET_KUBECONFIG_B64 (Pflicht fuer connect), TS_AUTHKEY (Pflicht bei *.ts.net-Server)
# Exit: 0 ok, 1 Befund, 2 Vorbedingung fehlt.
set -euo pipefail

STATE_DIR="${CLOUD_ENV_STATE_DIR:-$HOME/.cache/cloud-env}"
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.36.1}"
KUBECONFIG_FILE="$STATE_DIR/fleet.kubeconfig"
SOCKS_ADDR="127.0.0.1:1055"
READY_TIMEOUT=60

say() { printf '[cloud-env-fleet] %s\n' "$*"; }
die() { printf '[cloud-env-fleet] FEHLER: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { printf '[cloud-env-fleet] Vorbedingung fehlt: %s\n' "$1" >&2; exit 2; }; }
need_env() {
  local v
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || { printf '[cloud-env-fleet] Vorbedingung fehlt: Variable %s ist nicht gesetzt\n' "$v" >&2; exit 2; }
  done
}
SUDO=(); [[ $EUID -eq 0 ]] || SUDO=(sudo -n)
as_root() { "${SUDO[@]}" "$@"; }

wait_for() { # wait_for <beschreibung> <befehl...>
  local what="$1" i=0; shift
  until "$@" >/dev/null 2>&1; do
    (( ++i > READY_TIMEOUT )) && die "Timeout (${READY_TIMEOUT}s): $what"
    sleep 1
  done
}

do_install() {
  need curl
  mkdir -p "$STATE_DIR"
  if ! command -v kubectl >/dev/null 2>&1; then
    say "Installiere kubectl ${KUBECTL_VERSION}"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
    curl -fsSL -o "$tmp/kubectl.sha256" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256"
    (cd "$tmp" && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c -) || die "kubectl-Pruefsumme stimmt nicht"
    as_root install -m 0755 "$tmp/kubectl" /usr/local/bin/kubectl
    rm -rf "$tmp"
  fi
  if ! command -v tailscaled >/dev/null 2>&1; then
    say "Installiere Tailscale (offizielles Installationsskript)"
    curl -fsSL https://tailscale.com/install.sh | as_root sh
  fi
  say "install fertig"
}

start_tailscale() {
  need tailscale
  need tailscaled
  need_env TS_AUTHKEY
  mkdir -p "$STATE_DIR"

  if tailscale --socket="$STATE_DIR/tailscaled.sock" status >/dev/null 2>&1; then
    say "Tailscale laeuft bereits"
    return
  fi

  say "Starte tailscaled (Userspace, SOCKS5 ${SOCKS_ADDR})"
  nohup "${SUDO[@]}" tailscaled --tun=userspace-networking --socks5-server="$SOCKS_ADDR" \
    --state=mem: --socket="$STATE_DIR/tailscaled.sock" >"$STATE_DIR/tailscaled.log" 2>&1 &
  wait_for "tailscaled-Socket" test -S "$STATE_DIR/tailscaled.sock"

  # Auth-Key ueber Datei statt Argument, damit er nicht in der Prozessliste steht.
  local keyfile; keyfile="$(umask 077 && mktemp "$STATE_DIR/authkey.XXXXXX")"
  printf '%s' "$TS_AUTHKEY" >"$keyfile"
  trap 'rm -f "$keyfile"' RETURN
  as_root tailscale --socket="$STATE_DIR/tailscaled.sock" up \
    --auth-key="file:$keyfile" --hostname="cloud-env-fleet-$(hostname | cut -c1-20)" \
    --accept-dns=false --accept-routes=false --ssh=false \
    || die "tailscale up fehlgeschlagen (Key abgelaufen oder widerrufen?)"
  say "Tailscale verbunden"
}

do_connect() {
  need kubectl
  need_env FLEET_KUBECONFIG_B64
  mkdir -p "$STATE_DIR"
  (umask 077 && printf '%s' "$FLEET_KUBECONFIG_B64" | base64 -d >"$KUBECONFIG_FILE") \
    || die "FLEET_KUBECONFIG_B64 ist kein gueltiges Base64"
  export KUBECONFIG="$KUBECONFIG_FILE"
  kubectl config get-contexts -o name | grep -qx fleet || die "Kubeconfig enthaelt keinen Context 'fleet'"
  kubectl config use-context fleet >/dev/null

  local cluster server
  cluster="$(kubectl config view -o jsonpath="{.contexts[?(@.name=='fleet')].context.cluster}")"
  server="$(kubectl config view -o jsonpath="{.clusters[?(@.name=='$cluster')].cluster.server}")"
  if [[ "$server" == *.ts.net* ]]; then
    start_tailscale
    kubectl config set-cluster "$cluster" --proxy-url="socks5h://${SOCKS_ADDR}" >/dev/null
  fi

  # Spaetere Tool-Aufrufe der Session sehen die Kubeconfig ueber CLAUDE_ENV_FILE
  [[ -z "${CLAUDE_ENV_FILE:-}" ]] || printf 'export KUBECONFIG=%q\n' "$KUBECONFIG_FILE" >>"$CLAUDE_ENV_FILE"
  wait_for "fleet-API (Netzpfad, Token abgelaufen? neues Token: docs/runbooks/cloud-env-fleet.md, Abschnitt Notfall)" \
    kubectl get nodes
  say "fleet-API erreichbar; Nodes: $(kubectl get nodes --no-headers | wc -l)"
}

case "${1:-}" in
  install) do_install ;;
  connect) do_connect ;;
  *) echo "Aufruf: $0 install|connect" >&2; exit 2 ;;
esac
