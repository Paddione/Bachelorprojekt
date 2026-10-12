#!/usr/bin/env bash
# scripts/devmesh/lan-dns-firewall.sh — Port 53 fuer LAN-DNS auf allen k3s-Hosts oeffnen [T016515]
#
# Usage: lan-dns-firewall.sh
#
# Die k3s-ServiceLB stellt AdGuard (dev-local/lan-dns) auf Port 53 jeder Node-IP bereit.
# ufw ist auf den devmesh-Hosts aktiv und verwirft das ohne diese Regeln. Neue Hosts
# bekommen sie ueber k3s-install.sh, dieses Skript zieht bestehende Hosts nach.
# ufw ignoriert bereits vorhandene Regeln, der Lauf ist idempotent.
#
# Umgebung:
#   DRY_RUN=1          nur Host und Befehle ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Exit 0 alle Hosts ok, 1 mindestens ein Host fehlgeschlagen (Name im Output), 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"

command -v yq >/dev/null 2>&1 || { echo "Vorbedingung fehlt: yq nicht im PATH" >&2; exit 2; }
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

RULES=(
  "ufw allow from 10.0.0.0/8 to any port 53 proto udp comment 'lan-dns'"
  "ufw allow from 10.0.0.0/8 to any port 53 proto tcp comment 'lan-dns'"
)

mapfile -t HOSTS < <(yq -r '.peers[] | select((.k3s_role // "") != "") | .name + " " + .lan_ip' "$INVENTORY")
[[ ${#HOSTS[@]} -gt 0 ]] || { echo "Vorbedingung fehlt: kein k3s-Host im Inventar" >&2; exit 2; }

failed=()
for entry in "${HOSTS[@]}"; do
  name="${entry%% *}"; ip="${entry##* }"
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    for r in "${RULES[@]}"; do echo "$name ($ip): sudo $r"; done
    continue
  fi
  body="set -e; $(printf 'sudo -n %s >/dev/null; ' "${RULES[@]}")"
  if ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "${SSH_USER}@${ip}" "$body"; then
    echo "ok: $name ($ip)"
  else
    echo "FEHLER: $name ($ip)" >&2
    failed+=("$name")
  fi
done

[[ ${#failed[@]} -eq 0 ]] || { echo "fehlgeschlagen: ${failed[*]}" >&2; exit 1; }
