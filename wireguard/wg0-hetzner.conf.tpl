# DEPRECATED: This single-peer template has been superseded by scripts/hetzner/generate-wg-conf.sh,
# which reads wireguard/wg-mesh-nodes.yaml and generates a full-mesh config (all nodes, self-excluded).
# Use generate-wg-conf.sh for all new provisioning. This file is kept only as a reference.
#
# ${NODE_NAME} (${NODE_IP})
[Interface]
PrivateKey = ${NODE_PRIVATE_KEY}
Address = ${NODE_WG_IP}/32
ListenPort = ${WG_LISTEN_PORT}

[Peer]
# WSL2 GPU Workstation
PublicKey = ${WS_PUBLIC_KEY}
AllowedIPs = ${WS_WG_IP}/32
