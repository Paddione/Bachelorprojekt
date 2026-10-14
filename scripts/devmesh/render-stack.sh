#!/usr/bin/env bash
# scripts/devmesh/render-stack.sh — rendert dev-local/<profil> fuer devmesh [T900118].
# Arbeitskopie -> kustomize -> envsubst (nur gesetzte Variablen) -> stdout.
#
# Aufruf: render-stack.sh [core|full]   Default: DEVMESH_PROFILE aus environments/dev.yaml
# Env:    DEVMESH_INVENTORY (Default devmesh/inventory.yaml) liefert gpu_endpoint
#         (address, port, ports). Je Eintrag in gpu_endpoint.ports haengt das Skript
#         einen benannten Port an Service und EndpointSlice llm-gateway-host an.
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

# Benannte GPU-Ports [T900191]. Fehlt die Liste, bleibt es beim Port http.
GPU_PORTS_JSON="$(yq -o=json -I=0 '.gpu_endpoint.ports // []' "$INVENTORY")"
while IFS=$'\t' read -r pname pport; do
  [[ -z "$pname$pport" ]] && continue
  [[ "$pname" =~ ^[a-z0-9]([-a-z0-9]{0,13}[a-z0-9])?$ && "$pname" != http ]] \
    || { echo "render-stack: gpu_endpoint.ports Name '$pname' ungueltig ($INVENTORY)" >&2; exit 2; }
  [[ "$pport" =~ ^[0-9]+$ ]] && (( pport > 0 && pport < 65536 )) \
    || { echo "render-stack: gpu_endpoint.ports Port '$pport' ($pname) ist keine gueltige Portnummer" >&2; exit 2; }
done < <(yq -r '.gpu_endpoint.ports // [] | .[] | [.name, .port] | @tsv' "$INVENTORY")
export GPU_PORTS_JSON

export GPU_ENDPOINT_ADDRESS GPU_ENDPOINT_PORT
# T901777: Cluster-CIDRs fuer die NetworkPolicies in k3d/website.yaml.
# devmesh-Werte kommen aus environments/dev.yaml (10.52/10.53); die Defaults
# greifen nur, falls ein Env-File sie (noch) nicht definiert.
export POD_CIDR="${POD_CIDR:-10.42.0.0/16}"
export SERVICE_CIDR="${SERVICE_CIDR:-10.43.0.0/16}"
export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"
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
# Benannte Ports an Service und EndpointSlice llm-gateway-host anhaengen. Kustomize kann
# ueber eine Liste nicht iterieren, deshalb geschieht das nach dem Rendern.
rendered="$(envsubst "$vars" <<<"$rendered" | sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g')"
# envFrom is captured at pod creation; config changes must trigger a rollout.
WEBSITE_CONFIG_SHA="$(yq ea -o=json -I=0 'select(.kind == "ConfigMap" and .metadata.name == "website-config") | .data' <<<"$rendered" | sha256sum | cut -d' ' -f1)"
export WEBSITE_CONFIG_SHA
yq e '
  (select(.kind == "ConfigMap") | .data[]) |= to_string |
  (select(.kind == "Deployment" or .kind == "Job" or .kind == "StatefulSet") | .spec.template.spec.containers[]?.env[]? | select(has("value")) | .value) |= to_string |
  (select(.kind == "Deployment" or .kind == "Job" or .kind == "StatefulSet") | .spec.template.spec.initContainers[]?.env[]? | select(has("value")) | .value) |= to_string |
  (select(.kind == "Deployment" and .metadata.name == "website") | .spec.template.metadata.annotations."checksum/config") = strenv(WEBSITE_CONFIG_SHA) |
  (select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports) +=
    (env(GPU_PORTS_JSON) | map({"name": .name, "port": .port, "protocol": "TCP"})) |
  (select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports) +=
    (env(GPU_PORTS_JSON) | map({"name": .name, "port": .port, "protocol": "TCP"}))' - <<<"$rendered"
