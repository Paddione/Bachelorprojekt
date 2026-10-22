#!/usr/bin/env bash
# scripts/devmesh/lan-dns-check.sh — AdGuard auf jedem lan_dns-Host per dig abfragen [T016515]
#
# Usage: lan-dns-check.sh [QUERY] (Default quad9.net)
# Umgebung: DEVMESH_INVENTORY (Default: devmesh/inventory.yaml im Repo-Root).
# Exit 1 = eine IP antwortet nicht, 2 = Vorbedingung fehlt (dig/yq/Inventar).
set -euo pipefail

QUERY="${1:-${QUERY:-quad9.net}}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"

command -v dig >/dev/null 2>&1 || { echo "Vorbedingung fehlt: dig" >&2; exit 2; }
command -v yq >/dev/null 2>&1 || { echo "Vorbedingung fehlt: yq nicht im PATH" >&2; exit 2; }
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

rc=0
for ip in $(yq -r '.peers[] | select(.lan_dns == true) | .lan_ip' "$INVENTORY"); do
  if [ -n "$(dig +time=3 +tries=1 +short @"$ip" "$QUERY" 2>/dev/null)" ]; then echo "ok    $ip"; else echo "FEHLT $ip"; rc=1; fi
done
exit $rc
