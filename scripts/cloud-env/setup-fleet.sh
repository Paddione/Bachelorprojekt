#!/usr/bin/env bash
# scripts/cloud-env/setup-fleet.sh - Cloud-Umgebung "mentolder-prod" (Claude Code on the web) an fleet anbinden
#
#   install   einmalig (Setup-Skript-Feld der Umgebung): kubectl (+ flux-CLI)
#   connect   je Session: Kubeconfig aus FLEET_KUBECONFIG_B64 schreiben, API pruefen
#
# Kein Tailscale: die fleet-API-Server (:6443) sind oeffentlich erreichbar, der Zugang laeuft ueber das
# ServiceAccount-Token aus scripts/cloud-env/fleet-kubeconfig.sh. Netzwerkzugriff der Umgebung muss
# 204.168.244.104, 37.27.251.38, 62.238.23.79 (je :6443), dl.k8s.io und github.com erlauben.
# Doku: docs/runbooks/cloud-env-fleet.md
#
# Variablen: FLEET_KUBECONFIG_B64 (Pflicht fuer connect)
# Exit: 0 ok, 1 Befund, 2 Vorbedingung fehlt.
set -euo pipefail

STATE_DIR="${CLOUD_ENV_STATE_DIR:-$HOME/.cache/cloud-env}"
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.36.1}"
KUBECONFIG_FILE="$STATE_DIR/fleet.kubeconfig"

say() { printf '[cloud-env-fleet] %s\n' "$*"; }
die() { printf '[cloud-env-fleet] FEHLER: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { printf '[cloud-env-fleet] Vorbedingung fehlt: %s\n' "$1" >&2; exit 2; }; }
SUDO=(); [[ $EUID -eq 0 ]] || SUDO=(sudo -n)

do_install() {
  need curl
  mkdir -p "$STATE_DIR"
  if ! command -v kubectl >/dev/null 2>&1; then
    say "Installiere kubectl ${KUBECTL_VERSION}"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
    curl -fsSL -o "$tmp/kubectl.sha256" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256"
    (cd "$tmp" && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c -) || die "kubectl-Pruefsumme stimmt nicht"
    "${SUDO[@]}" install -m 0755 "$tmp/kubectl" /usr/local/bin/kubectl
    rm -rf "$tmp"
  fi
  say "install fertig"
}

do_connect() {
  need kubectl
  [[ -n "${FLEET_KUBECONFIG_B64:-}" ]] || { echo "[cloud-env-fleet] Vorbedingung fehlt: Variable FLEET_KUBECONFIG_B64" >&2; exit 2; }
  mkdir -p "$STATE_DIR"
  (umask 077 && printf '%s' "$FLEET_KUBECONFIG_B64" | base64 -d >"$KUBECONFIG_FILE") \
    || die "FLEET_KUBECONFIG_B64 ist kein gueltiges Base64"
  export KUBECONFIG="$KUBECONFIG_FILE"
  kubectl config use-context fleet >/dev/null
  # Spaetere Tool-Aufrufe der Session sehen die Kubeconfig ueber CLAUDE_ENV_FILE
  [[ -z "${CLAUDE_ENV_FILE:-}" ]] || printf 'export KUBECONFIG=%q\n' "$KUBECONFIG_FILE" >>"$CLAUDE_ENV_FILE"
  kubectl get nodes >/dev/null || die "fleet-API nicht erreichbar oder Token abgelaufen/ungueltig - neues Token: docs/runbooks/cloud-env-fleet.md, Abschnitt Notfall"
  say "fleet-API erreichbar; Nodes: $(kubectl get nodes --no-headers | wc -l)"
}

case "${1:-}" in
  install) do_install ;;
  connect) do_connect ;;
  *) echo "Aufruf: $0 install|connect" >&2; exit 2 ;;
esac
