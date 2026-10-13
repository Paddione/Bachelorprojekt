#!/usr/bin/env bash
# scripts/hetzner/render-cloud-init.sh
# Renders a cloud-init template with per-node env vars and prints to stdout.
# fleet auf gekko (T016529, D1): Knotenverkehr laeuft ueber
# das private Hetzner-Netz, Admin-Zugriff ueber Tailscale (tag:fleet).
#
# Usage:
#   bash scripts/hetzner/render-cloud-init.sh \
#     [--versions-file <path>] \
#     [--template <path>]          default: cloud-init.yaml.tmpl (agent/worker)
#                                  server:  cloud-init-server.yaml.tmpl (k3s CP)
#     --node-name <name>           node hostname (e.g. gekko-hetzner-2)
#     --node-ip <private-ip>       node's private IP 192.168.200.x (k3s node-ip)
#     --node-public-ip <ip>        node's public IP (TLS SAN)
#     [--private-iface <iface>]    private network interface (default: eth1)
#     [--private-subnet <cidr>]    private subnet (default: 192.168.200.0/24)
#     --tailnet-name <name>        node's Tailnet (MagicDNS) name (TLS SAN)
#     --tailnet-ip <ip>            node's Tailnet IP 100.x (TLS SAN)
#     --tailscale-auth-key <key>   tagged Tailscale auth key (tag:fleet)
#     --k3s-url <url>              k3s server URL to join (agent) or existing CP (server HA)
#                                  omit or pass "" for first server node (cluster-init)
#     --k3s-token <token>
#     --ssh-key "<pubkey>"
#
# Provision first control-plane node (cluster-init, gekko-hetzner-2):
#   bash scripts/hetzner/render-cloud-init.sh \
#     --template scripts/hetzner/cloud-init-server.yaml.tmpl \
#     --node-name gekko-hetzner-2 --node-ip 192.168.200.2 \
#     --node-public-ip 178.104.169.206 \
#     --tailnet-name "<tailnet-name>" --tailnet-ip "<tailnet-ip>" \
#     --tailscale-auth-key "$TS_AUTHKEY" \
#     --k3s-url "" --k3s-token "$TOKEN" \
#     --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" > /tmp/ci-gekko2.yaml
#
# Provision joining control-plane node (gekko-hetzner-3):
#   bash scripts/hetzner/render-cloud-init.sh \
#     --template scripts/hetzner/cloud-init-server.yaml.tmpl \
#     --node-name gekko-hetzner-3 --node-ip 192.168.200.3 \
#     --node-public-ip 46.225.125.59 \
#     --tailnet-name "<tailnet-name>" --tailnet-ip "<tailnet-ip>" \
#     --tailscale-auth-key "$TS_AUTHKEY" \
#     --k3s-url https://192.168.200.2:6443 --k3s-token "$TOKEN" \
#     --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" > /tmp/ci-gekko3.yaml
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

usage() {
  sed -n '2,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

VERSIONS_FILE="${PROJECT_DIR}/environments/versions.yaml"
TEMPLATE="${SCRIPT_DIR}/cloud-init.yaml.tmpl"
NODE_NAME=""
NODE_IP=""
NODE_PUBLIC_IP=""
PRIVATE_IFACE="eth1"
PRIVATE_SUBNET="192.168.200.0/24"
TAILNET_NAME=""
TAILNET_IP=""
TAILSCALE_AUTH_KEY=""
K3S_URL=""
K3S_TOKEN=""
SSH_PUBLIC_KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)        usage; exit 0 ;;
    --versions-file)  VERSIONS_FILE="$2";      shift 2 ;;
    --template)       TEMPLATE="$2";           shift 2 ;;
    --node-name)      NODE_NAME="$2";          shift 2 ;;
    --node-ip)        NODE_IP="$2";            shift 2 ;;
    --node-public-ip) NODE_PUBLIC_IP="$2";     shift 2 ;;
    --private-iface)  PRIVATE_IFACE="$2";      shift 2 ;;
    --private-subnet) PRIVATE_SUBNET="$2";     shift 2 ;;
    --tailnet-name)   TAILNET_NAME="$2";       shift 2 ;;
    --tailnet-ip)     TAILNET_IP="$2";         shift 2 ;;
    --tailscale-auth-key) TAILSCALE_AUTH_KEY="$2"; shift 2 ;;
    --k3s-url)        K3S_URL="$2";            shift 2 ;;
    --k3s-token)      K3S_TOKEN="$2";          shift 2 ;;
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
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Validate required arguments
missing=()
[[ -z "$NODE_NAME"         ]] && missing+=("--node-name")
[[ -z "$NODE_IP"           ]] && missing+=("--node-ip")
[[ -z "$NODE_PUBLIC_IP"    ]] && missing+=("--node-public-ip")
[[ -z "$TAILNET_NAME"      ]] && missing+=("--tailnet-name")
[[ -z "$TAILNET_IP"        ]] && missing+=("--tailnet-ip")
[[ -z "$TAILSCALE_AUTH_KEY" ]] && missing+=("--tailscale-auth-key")
[[ -z "$K3S_TOKEN"         ]] && missing+=("--k3s-token")
[[ -z "$SSH_PUBLIC_KEY"    ]] && missing+=("--ssh-key")
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
export NODE_NAME NODE_IP NODE_PUBLIC_IP PRIVATE_IFACE PRIVATE_SUBNET
export TAILNET_NAME TAILNET_IP TAILSCALE_AUTH_KEY K3S_URL K3S_TOKEN SSH_PUBLIC_KEY

# Render — only substitute known vars to avoid clobbering literal ${} in scripts
envsubst '${NODE_NAME} ${NODE_IP} ${NODE_PUBLIC_IP} ${PRIVATE_IFACE} ${PRIVATE_SUBNET} ${TAILNET_NAME} ${TAILNET_IP} ${TAILSCALE_AUTH_KEY} ${K3S_VERSION} ${K3S_URL} ${K3S_TOKEN} ${SSH_PUBLIC_KEY}' \
  < "$TEMPLATE"
