#!/usr/bin/env bash
# scripts/devmesh/gpu-cdi.sh — CDI-Injektion fuer NVIDIA-GPUs unter k3s aktivieren.
#
# Usage: gpu-cdi.sh [host]        host = Name aus devmesh/inventory.yaml, Default gpu-metal
#
# Ergaenzt scripts/devmesh/gpu-enable.sh (Toolkit + Legacy-Runtime): Der
# Legacy-Pfad (BinaryName /usr/bin/nvidia-container-runtime) existiert in
# Toolkit >= 1.17 nicht mehr — ohne CDI sieht der Scheduler die GPU, aber kein
# Pod erhaelt /dev/nvidia*. Dieses Skript legt den k3s-Drop-in mit
# enable_cdi an, regeneriert die CDI-Spec und startet k3s neu.
#
# Umgebung:
#   DRY_RUN=1          nur den geplanten Ablauf ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Idempotent: enthaelt der Drop-in bereits enable_cdi, endet das Skript ohne
# Aenderung und OHNE k3s-Neustart mit Exit 0.
# Exit 0 aktiviert/unveraendert, 1 Befund, 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
DEFAULT_HOST=gpu-metal
DROPIN_DIR=/var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d
DROPIN_FILE="$DROPIN_DIR/99-cdi.toml"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }

case "${1:-}" in
  -h|--help) echo "Usage: gpu-cdi.sh [host]   (Default: $DEFAULT_HOST)" >&2; exit 1 ;;
esac
[[ $# -le 1 ]] || die "hoechstens ein Argument erwartet: [host] (siehe Kopfkommentar)"
HOST="${1:-$DEFAULT_HOST}"

need yq
need ssh
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

LAN_IP="$(HOST="$HOST" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip // ""' "$INVENTORY")"
[[ -n "$LAN_IP" ]] || die "Host '$HOST' nicht im Inventar oder ohne lan_ip"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "host:    $HOST ($LAN_IP)"
  echo "plan:    CDI-Drop-in $DROPIN_FILE anlegen, CDI-Spec regenerieren, k3s neu starten"
  exit 0
fi

remote() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${LAN_IP}" "$@"
}

remote "sudo -n true" \
  || { echo "Vorbedingung fehlt: SSH/sudo ohne Passwort auf ${SSH_USER}@${LAN_IP} (Host $HOST)" >&2; exit 2; }

if remote "sudo -n grep -q 'enable_cdi = true' $DROPIN_FILE" >/dev/null 2>&1; then
  echo "unveraendert: $HOST hat den CDI-Drop-in bereits"
  exit 0
fi

remote_body() {
  cat << 'REMOTE'
set -euo pipefail
command -v nvidia-ctk >/dev/null 2>&1 || { echo "nvidia-ctk fehlt (erst scripts/devmesh/gpu-enable.sh)" >&2; exit 2; }
sudo -n mkdir -p /var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d
printf '%s\n' '[plugins."io.containerd.cri.v1.runtime".containerd]' '  enable_cdi = true' \
  | sudo -n tee /var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d/99-cdi.toml >/dev/null
sudo -n nvidia-ctk cdi generate --output=/var/run/cdi/nvidia.yaml
sudo -n systemctl restart k3s
for _ in $(seq 1 36); do k3s kubectl get node "$(hostname)" >/dev/null 2>&1 && break; sleep 5; done
sudo -n k3s kubectl wait --for=condition=Ready "node/$(hostname)" --timeout=180s
REMOTE
}

rc=0
remote_body | remote "sudo -n bash -s" || rc=$?
(( rc == 2 )) && { echo "Vorbedingung fehlt: nvidia-ctk auf $HOST (erst gpu-enable.sh laufen lassen)" >&2; exit 2; }
(( rc == 0 )) || die "CDI-Aktivierung auf $HOST fehlgeschlagen (Exit $rc)"
echo "aktiviert: $HOST CDI-Drop-in angelegt, k3s neu gestartet"
