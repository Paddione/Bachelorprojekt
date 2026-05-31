#!/usr/bin/env bash
# scripts/hetzner/generate-wg-conf.sh
# Generates a full-mesh WireGuard config for one Hetzner node.
# Reads all peers from wireguard/wg-mesh-nodes.yaml and excludes the node itself.
# Adding a node to wg-mesh-nodes.yaml automatically includes it in every other node's
# peer list on next provisioning — no template edits required.
#
# Usage:
#   bash scripts/hetzner/generate-wg-conf.sh \
#     --env korczewski \
#     --node-name pk-hetzner-4 \
#     --private-key "<base64-wg-private-key>"
#
# Output: WireGuard config on stdout.
# For cloud-init embedding, pipe through base64:
#   WG_CONF_B64=$(bash scripts/hetzner/generate-wg-conf.sh ... | base64 -w0)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MESH_FILE="${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml"

ENV=""
NODE_NAME=""
PRIVATE_KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)         ENV="$2";         shift 2 ;;
    --node-name)   NODE_NAME="$2";   shift 2 ;;
    --private-key) PRIVATE_KEY="$2"; shift 2 ;;
    --mesh-file)   MESH_FILE="$2";   shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$ENV" ]]         && { echo "ERROR: --env required" >&2; exit 1; }
[[ -z "$NODE_NAME" ]]   && { echo "ERROR: --node-name required" >&2; exit 1; }
[[ -z "$PRIVATE_KEY" ]] && { echo "ERROR: --private-key required" >&2; exit 1; }
[[ ! -f "$MESH_FILE" ]] && { echo "ERROR: mesh file not found: $MESH_FILE" >&2; exit 1; }

python3 - "$MESH_FILE" "$ENV" "$NODE_NAME" "$PRIVATE_KEY" <<'PYEOF'
import sys
import yaml

mesh_file, env, node_name, private_key = sys.argv[1:]

with open(mesh_file) as f:
    mesh = yaml.safe_load(f)

if env not in mesh:
    print(f"ERROR: env '{env}' not found in {mesh_file}", file=sys.stderr)
    sys.exit(1)

env_data = mesh[env]
listen_port = env_data['listen_port']

# Locate self node across all categories
# IMPORTANT: keep this tuple in sync with the peer-emit loop below.
# Any category key present in wg-mesh-nodes.yaml must appear in BOTH tuples
# or those nodes are silently dropped from every peer list (T000371 regression).
MESH_CATEGORIES = ('nodes', 'gpu_hosts', 'home_workers', 'workers', 'devc_servers')
self_node = None
for cat in MESH_CATEGORIES:
    for node in env_data.get(cat, []):
        if node['name'] == node_name:
            self_node = node
            break
    if self_node:
        break

if self_node is None:
    print(f"ERROR: node '{node_name}' not found in env '{env}'", file=sys.stderr)
    sys.exit(1)

lines = [
    "[Interface]",
    f"PrivateKey = {private_key}",
    f"Address = {self_node['wg_ip']}/32",
    f"ListenPort = {listen_port}",
]

# Emit one [Peer] block per node in the mesh, skipping self
for cat in MESH_CATEGORIES:
    for peer in env_data.get(cat, []):
        if peer['name'] == node_name:
            continue
        lines += [
            "",
            "[Peer]",
            f"# {peer['name']}",
            f"PublicKey = {peer['public_key']}",
            f"AllowedIPs = {peer['wg_ip']}/32",
        ]
        if peer.get('endpoint'):
            lines.append(f"Endpoint = {peer['endpoint']}")
        if peer.get('keepalive'):
            lines.append(f"PersistentKeepalive = {peer['keepalive']}")

print("\n".join(lines))
PYEOF
