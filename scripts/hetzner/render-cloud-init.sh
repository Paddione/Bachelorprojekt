#!/usr/bin/env bash
# scripts/hetzner/render-cloud-init.sh
# Renders scripts/hetzner/cloud-init.yaml.tmpl with per-node env vars.
# Prints rendered YAML to stdout.
#
# Usage:
#   bash scripts/hetzner/render-cloud-init.sh \
#     [--versions-file <path>] [--template <path>] \
#     --node-ip <ip> --k3s-url <url> --k3s-token <token> --ssh-key "<pubkey>" \
#     [--wg-conf-b64 <base64>]
#
# To provision a node:
#   bash scripts/hetzner/render-cloud-init.sh ... > /tmp/ci.yaml
#   hcloud server create --user-data-from-file /tmp/ci.yaml --name <name> ...
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

VERSIONS_FILE="${PROJECT_DIR}/environments/versions.yaml"
TEMPLATE="${SCRIPT_DIR}/cloud-init.yaml.tmpl"
NODE_IP=""
K3S_URL=""
K3S_TOKEN=""
SSH_PUBLIC_KEY=""
WG_CONF_B64=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --versions-file) VERSIONS_FILE="$2"; shift 2 ;;
    --template)      TEMPLATE="$2";       shift 2 ;;
    --node-ip)       NODE_IP="$2";        shift 2 ;;
    --k3s-url)       K3S_URL="$2";        shift 2 ;;
    --k3s-token)     K3S_TOKEN="$2";      shift 2 ;;
    --ssh-key)
      shift
      # Consume all remaining args until next flag (starts with --)
      while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
        if [[ -z "$SSH_PUBLIC_KEY" ]]; then
          SSH_PUBLIC_KEY="$1"
        else
          SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY} $1"
        fi
        shift
      done
      ;;
    --wg-conf-b64)   WG_CONF_B64="$2";   shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Validate required arguments
missing=()
[[ -z "$NODE_IP"        ]] && missing+=("--node-ip")
[[ -z "$K3S_URL"        ]] && missing+=("--k3s-url")
[[ -z "$K3S_TOKEN"      ]] && missing+=("--k3s-token")
[[ -z "$SSH_PUBLIC_KEY" ]] && missing+=("--ssh-key")
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing required arguments: ${missing[*]}" >&2
  exit 1
fi

# Validate files exist
[[ ! -f "$VERSIONS_FILE" ]] && { echo "ERROR: versions file not found: $VERSIONS_FILE" >&2; exit 1; }
[[ ! -f "$TEMPLATE"      ]] && { echo "ERROR: template not found: $TEMPLATE" >&2; exit 1; }

# Source versions.yaml — each "key: value" line becomes an exported shell var
while IFS=': ' read -r key value rest; do
  [[ "${key:-}" =~ ^#  ]] && continue
  [[ -z "${key:-}"     ]] && continue
  export "${key}=${value}"
done < "$VERSIONS_FILE"

# Map lowercase "k3s" key → K3S_VERSION (matches ${K3S_VERSION} in template)
export K3S_VERSION="${k3s:-}"
if [[ -z "$K3S_VERSION" ]]; then
  echo "ERROR: 'k3s' key missing from versions.yaml" >&2
  exit 1
fi

# Export all template variables
export NODE_IP K3S_URL K3S_TOKEN SSH_PUBLIC_KEY WG_CONF_B64

# Render — only substitute known vars to avoid clobbering literal ${} in scripts
envsubst '${NODE_IP} ${K3S_VERSION} ${K3S_URL} ${K3S_TOKEN} ${SSH_PUBLIC_KEY} ${WG_CONF_B64}' \
  < "$TEMPLATE"
