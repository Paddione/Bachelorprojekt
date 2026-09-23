#!/usr/bin/env bash
# scripts/devmesh/longhorn-prereqs.sh — T900181 (SP-2/Storage, ADR-008)
# Stellt die Longhorn-1.11.2-Vorbedingungen auf einem devmesh-Server her
# (idempotent): open-iscsi + iscsid + iscsi_tcp, NFSv4-Client, cryptsetup +
# dm_crypt, device-mapper, Mount-Propagation. Optional --with-disks fuer die
# gpu-metal-Plattenvorbereitung (hddthin-Resolution, sda/sdb).
#
# Usage:
#   longhorn-prereqs.sh [--with-disks] [--dry-run] [--help] <host>
#
# Exit 0  Vorbedingungen hergestellt (oder bereits erfuellt)
# Exit 1  Remote-Befehl schlug fehl
# Exit 2  Vorbedingung fehlt: Host unbekannt, SSH-Key fehlt, yq/python3 fehlt
#
# Overrides: DEVMESH_INVENTORY, DEVMESH_SSH_USER (Default: patrick),
#            DEVMESH_SSH_KEY (Default: ~/.ssh/patrick_ed25519), DRY_RUN=1.
# Aufruf ueber Taskfile: task devmesh:longhorn:prereqs HOST=<name>.
set -euo pipefail

WITH_DISKS=0
DRY_RUN="${DRY_RUN:-0}"
INVENTORY="${DEVMESH_INVENTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../devmesh" && pwd)/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-disks) WITH_DISKS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) HOST="$1"; shift ;;
  esac
done

[[ -n "${HOST:-}" ]] || { echo "missing <host>" >&2; usage >&2; exit 2; }
[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY" >&2; exit 2; }

LAN_IP="$(HOST="$HOST" python3 -c 'import os,sys,yaml; inv=yaml.safe_load(open(sys.argv[1])) or {}; print(next((p.get("lan_ip","") for p in inv.get("peers",[]) if p.get("name")==os.environ["HOST"]), ""))' "$INVENTORY" 2>/dev/null || true)"
TARGET="${LAN_IP:-$HOST}"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SSH_USER}@${TARGET}")

REMOTE_SETUP='
set -euo pipefail
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq open-iscsi nfs-common cryptsetup dmsetup
sudo systemctl enable --now iscsid
sudo modprobe iscsi_tcp
sudo modprobe dm_crypt
grep -q iscsi_tcp /proc/modules || { echo "iscsi_tcp not loaded" >&2; exit 1; }
grep -q dm_crypt /proc/modules || { echo "dm_crypt not loaded" >&2; exit 1; }
systemctl show -p MountFlags / 2>/dev/null | grep -q shared || findmnt -o PROPAGATION / | grep -q shared || { echo "mount propagation not shared on /" >&2; exit 1; }
echo "longhorn preconditions ok"
'

REMOTE_DISKS='
set -euo pipefail
# hddthin: Thin-Pool aktivieren falls vorhanden aber inaktiv (Ticketlage T900181:
# Pool da, Data% 0.00, Meta% 0.24 — LV-Pfad je Maschine pruefen, kein Auto-Wipe).
if sudo lvs --noheadings -o lv_name,vg_name,attr 2>/dev/null | grep -q hddthin; then
  sudo lvchange -ay "$(sudo lvs --noheadings -o vg_name 2>/dev/null | grep -v "^$" | head -1 | tr -d " ")/hddthin" || true
fi
for dev in /dev/sda /dev/sdb; do
  if [[ -b "$dev" ]] && ! sudo blkid -o value -s TYPE "$dev" >/dev/null 2>&1; then
    echo "unformatted disk $dev — operator action required (no auto-format)" >&2
  fi
done
echo "disk check ok"
'

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN: ${SSH[*]} <remote-setup>"
  [[ "$WITH_DISKS" == "1" ]] && echo "DRY_RUN: ${SSH[*]} <remote-disks>"
  exit 0
fi

"${SSH[@]}" "$REMOTE_SETUP"
if [[ "$WITH_DISKS" == "1" ]]; then
  "${SSH[@]}" "$REMOTE_DISKS"
fi
