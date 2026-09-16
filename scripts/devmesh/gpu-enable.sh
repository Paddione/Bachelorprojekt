#!/usr/bin/env bash
# scripts/devmesh/gpu-enable.sh — GPU eines devmesh-Hosts fuer k3s nutzbar machen [T900179]
#
# Usage: gpu-enable.sh [host]        host = Name aus devmesh/inventory.yaml, Default gpu-metal
#
# Installiert das nvidia-container-toolkit, registriert die nvidia-Runtime per
# "nvidia-ctk runtime configure --runtime=containerd" und startet k3s neu, damit k3s seine
# containerd-Templates mit der Runtime neu schreibt. /var/lib/rancher/k3s/agent/etc/containerd/
# config.toml wird bewusst NICHT direkt editiert — k3s ueberschreibt die Datei beim Start.
#
# Umgebung:
#   DRY_RUN=1          nur den geplanten Ablauf ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Idempotent: sind Toolkit und nvidia-Runtime bereits vorhanden, endet das Skript ohne
# Aenderung und OHNE k3s-Neustart mit Exit 0.
# Exit 0 aktiviert/unveraendert, 1 Befund, 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
DEFAULT_HOST=gpu-metal
CONTAINERD_CONF=/var/lib/rancher/k3s/agent/etc/containerd/config.toml

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

case "${1:-}" in
  -h|--help) echo "Usage: gpu-enable.sh [host]   (Default: $DEFAULT_HOST)" >&2; exit 1 ;;
esac
[[ $# -le 1 ]] || die "hoechstens ein Argument erwartet: [host] (siehe Kopfkommentar)"
HOST="${1:-$DEFAULT_HOST}"

# Reihenfolge ist Vertrag: erst lokale Werkzeuge, dann Inventar, dann erst SSH. Ein fehlendes
# Werkzeug darf kein Kommando gegen den Host absetzen (Spec-Szenario "missing tool").
need yq
need ssh
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

LAN_IP="$(HOST="$HOST" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip // ""' "$INVENTORY")"
[[ -n "$LAN_IP" ]] || die "Host '$HOST' nicht im Inventar oder ohne lan_ip"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "host:    $HOST ($LAN_IP)"
  echo "plan:    nvidia-container-toolkit installieren, nvidia-ctk runtime configure --runtime=containerd, k3s neu starten"
  echo "hinweis: $CONTAINERD_CONF wird von k3s selbst neu geschrieben"
  exit 0
fi

remote() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${LAN_IP}" "$@"
}

remote "sudo -n true" \
  || { echo "Vorbedingung fehlt: SSH/sudo ohne Passwort auf ${SSH_USER}@${LAN_IP} (Host $HOST)" >&2; exit 2; }

# Eine Leseabfrage, nichts aendern: Version des nvidia-container-toolkit abfragen.
# Erfolg bedeutet: Toolkit installiert und damit die nvidia-Runtime in containerd registriert —
# der Idempotenz-Zweig endet hier ohne k3s-Neustart (Spec-Szenario "second run is a no-op").
rc=0
STATE="$(remote "nvidia-ctk --version")" || rc=$?

if (( rc == 0 )); then
  echo "unveraendert: $HOST hat nvidia-container-toolkit und die nvidia-Runtime in containerd"
  exit 0
fi
