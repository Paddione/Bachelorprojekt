#!/usr/bin/env bash
# scripts/devmesh/render-stack.sh — rendert dev-local/<profil> fuer devmesh [T900118].
# Arbeitskopie -> kustomize -> envsubst (nur gesetzte Variablen) -> stdout.
#
# Aufruf: render-stack.sh [core|full]   Default: DEVMESH_PROFILE aus environments/dev.yaml
# Env:    DEVMESH_INVENTORY (Default devmesh/inventory.yaml) liefert gpu_endpoint
# Exit:   0 Manifest auf stdout, 2 Vorbedingung fehlt (Werkzeug, Profil, Inventar)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
for tool in kubectl yq envsubst python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "render-stack: $tool fehlt" >&2; exit 2; }
done

# shellcheck source=scripts/env-resolve.sh
source scripts/env-resolve.sh dev
PROFILE="${1:-${DEVMESH_PROFILE:-core}}"
case "$PROFILE" in core|full) : ;; *) echo "render-stack: Profil '$PROFILE' unbekannt (core|full)" >&2; exit 2 ;; esac
[[ -n "${DEVMESH_DOMAIN:-}" ]] || { echo "render-stack: DEVMESH_DOMAIN leer (environments/dev.yaml)" >&2; exit 2; }

INVENTORY="${DEVMESH_INVENTORY:-devmesh/inventory.yaml}"
[[ -f "$INVENTORY" ]] || { echo "render-stack: Inventar $INVENTORY fehlt" >&2; exit 2; }
GPU_ENDPOINT_ADDRESS="$(yq -r '.gpu_endpoint.address // ""' "$INVENTORY")"
GPU_ENDPOINT_PORT="$(yq -r '.gpu_endpoint.port // ""' "$INVENTORY")"
if ! [[ "$GPU_ENDPOINT_ADDRESS" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "render-stack: gpu_endpoint.address '$GPU_ENDPOINT_ADDRESS' liegt nicht in 100.64.0.0/10 ($INVENTORY)" >&2
  exit 2
fi
[[ "$GPU_ENDPOINT_PORT" =~ ^[0-9]+$ ]] || { echo "render-stack: gpu_endpoint.port '$GPU_ENDPOINT_PORT' ist keine Zahl" >&2; exit 2; }

export GPU_ENDPOINT_ADDRESS GPU_ENDPOINT_PORT
export POCKET_ID_DOMAIN="${POCKET_ID_DOMAIN:-auth.${DEVMESH_DOMAIN}}"
export WORKSPACE_NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"
export COLLABORA_SERVER_NAME="${COLLABORA_SERVER_NAME:-office.${DEVMESH_DOMAIN}}"
export COLLABORA_SSL_TERMINATION="${COLLABORA_SSL_TERMINATION:-true}"
export COLLABORA_ALIASGROUP1="${COLLABORA_ALIASGROUP1:-https://files.${DEVMESH_DOMAIN}:443}"
export COLLABORA_ALIASGROUP2="${COLLABORA_ALIASGROUP2:-https://files.${DEVMESH_DOMAIN}:443}"

rendered="$(kubectl kustomize --load-restrictor=LoadRestrictionsNone "dev-local/$PROFILE")"

# Nur Variablen ersetzen, die gesetzt sind und nicht als $${VAR} (Laufzeit im Container)
# stehen — sonst setzt envsubst Skript-Variablen der Seed-Jobs auf "" (Taskfile.sdlc.yml).
vars=""
for v in $(grep -oE '(^|[^$])\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" | sed -E 's/.*\$\{//; s/\}$//' | sort -u || true); do
  [[ -n "${!v+x}" ]] && vars+="\$$v "
done
envsubst "$vars" <<<"$rendered" | sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g'
