#!/usr/bin/env bash
# scripts/devmesh/tailnet-subnet-routes.sh — Subnet-Routen der devmesh-Hosts ins Tailnet freigeben [T016515]
#
# Usage: tailnet-subnet-routes.sh
#
# Liest je Peer das Inventarfeld subnet_routes und setzt auf dem Host
# `tailscale set --advertise-routes=<liste>`. Mehrere Router fuer dieselbe Route
# schaltet Tailscale bei Ausfall automatisch um. Freigabe ueber autoApprovers in
# devmesh/tailnet-policy.hujson. Der Befehl setzt den Sollzustand, der Lauf ist idempotent.
#
# Umgebung: DRY_RUN, DEVMESH_INVENTORY, DEVMESH_SSH_USER, DEVMESH_SSH_KEY wie lan-dns-firewall.sh.
# Exit 0 alle Hosts ok, 1 mindestens ein Host fehlgeschlagen (Name im Output), 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"

command -v yq >/dev/null 2>&1 || { echo "Vorbedingung fehlt: yq nicht im PATH" >&2; exit 2; }
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

mapfile -t HOSTS < <(yq -r '.peers[] | select(((.subnet_routes // []) | length) > 0)
  | .name + " " + .lan_ip + " " + (.subnet_routes | join(","))' "$INVENTORY")
[[ ${#HOSTS[@]} -gt 0 ]] || { echo "Vorbedingung fehlt: kein Peer mit subnet_routes im Inventar" >&2; exit 2; }

failed=()
for entry in "${HOSTS[@]}"; do
  read -r name ip routes <<< "$entry"
  cmd="tailscale set --advertise-routes=${routes}"
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    echo "$name ($ip): sudo $cmd"
    continue
  fi
  if ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "${SSH_USER}@${ip}" "sudo -n $cmd"; then
    echo "ok: $name ($ip) -> $routes"
  else
    echo "FEHLER: $name ($ip)" >&2
    failed+=("$name")
  fi
done

[[ ${#failed[@]} -eq 0 ]] || { echo "fehlgeschlagen: ${failed[*]}" >&2; exit 1; }
