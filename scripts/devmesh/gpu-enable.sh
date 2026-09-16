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
remote "nvidia-ctk --version" >/dev/null 2>&1 || rc=$?

if (( rc == 0 )); then
  echo "unveraendert: $HOST hat nvidia-container-toolkit und die nvidia-Runtime in containerd"
  exit 0
fi

# Der ganze Aenderungsblock geht als EIN Skript ueber stdin. "set -euo pipefail" darin sorgt
# dafuer, dass ein Fehlschlag vor dem k3s-Neustart abbricht, statt den Host mit installiertem
# Toolkit und unkonfigurierter Runtime zurueckzulassen.
remote_body() {
  cat << 'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# Treiber-Vorbedingung zuerst: ohne nvidia-smi ist die Installation sinnlos. Exit 2 wird lokal
# zur Meldung "kein NVIDIA-Treiber" aufgeloest (Vorbedingung, kein Installationsfehler).
command -v nvidia-smi >/dev/null 2>&1 || exit 2
if ! command -v nvidia-ctk >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update
  apt-get install -y nvidia-container-toolkit
fi
command -v nvidia-ctk >/dev/null 2>&1 || { echo "nvidia-ctk fehlt nach der Installation" >&2; exit 1; }
nvidia-ctk runtime configure --runtime=containerd
# k3s schreibt config.toml aus seinem Template neu und erkennt die Runtime dabei selbst.
systemctl restart k3s
for _ in $(seq 1 36); do k3s kubectl get node "$(hostname)" >/dev/null 2>&1 && break; sleep 5; done
k3s kubectl wait --for=condition=Ready "node/$(hostname)" --timeout=180s
grep -q nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
REMOTE
}

rc=0
remote_body | remote "sudo -n bash -s" || rc=$?
(( rc == 2 )) && { echo "Vorbedingung fehlt: kein NVIDIA-Treiber auf $HOST (nvidia-smi nicht im PATH)" >&2; exit 2; }
(( rc == 0 )) || die "GPU-Aktivierung auf $HOST fehlgeschlagen (Exit $rc)"
echo "aktiviert: $HOST nvidia-container-toolkit installiert, k3s neu gestartet"
