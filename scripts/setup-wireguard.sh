#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Set up WireGuard tunnel between WSL2 workstation and Hetzner nodes
# Enables the workstation to serve as a GPU worker for the prod cluster.
#
# Subnet: 10.13.13.0/24
#   10.13.13.1  Hetzner Node 1 (gekko-hetzner-2)
#   10.13.13.2  WSL2 Workstation (GPU worker)
#   10.13.13.3  Hetzner Node 2 (gekko-hetzner-3)
#   10.13.13.4  Hetzner Node 3 (gekko-hetzner-4)
#
# Usage:  ./scripts/setup-wireguard.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Node configuration (mirrors setup-ha-cluster.sh) ─────────────────
NODE1_NAME="gekko-hetzner-2"
NODE1_IP="178.104.169.206"
NODE1_WG_IP="10.13.13.1"

NODE2_NAME="gekko-hetzner-3"
NODE2_IP="46.225.125.59"
NODE2_WG_IP="10.13.13.3"

NODE3_NAME="gekko-hetzner-4"
NODE3_IP="178.104.159.79"
NODE3_WG_IP="10.13.13.4"

WS_WG_IP="10.13.13.2"

ALL_IPS=("$NODE1_IP" "$NODE2_IP" "$NODE3_IP")
ALL_NAMES=("$NODE1_NAME" "$NODE2_NAME" "$NODE3_NAME")
ALL_WG_IPS=("$NODE1_WG_IP" "$NODE2_WG_IP" "$NODE3_WG_IP")

SSH_KEY="$HOME/.ssh/id_ed25519_hetzner"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -i $SSH_KEY"
SSH_USER="root"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WG_DIR="$PROJECT_DIR/wireguard"

# ── Colors ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

run_ssh() {
  local ip="$1"; shift
  ssh $SSH_OPTS "${SSH_USER}@${ip}" "$@"
}

scp_to() {
  local ip="$1" src="$2" dst="$3"
  scp $SSH_OPTS "$src" "${SSH_USER}@${ip}:${dst}"
}

# ══════════════════════════════════════════════════════════════════════
# Phase 1: Prerequisites
# ══════════════════════════════════════════════════════════════════════
log "Phase 1: Checking prerequisites..."

if ! command -v wg &>/dev/null; then
  log "Installing wireguard-tools locally..."
  sudo apt-get update -qq && sudo apt-get install -y -qq wireguard-tools
fi

mkdir -p "$WG_DIR"

# ══════════════════════════════════════════════════════════════════════
# Phase 2: Generate keypairs
# ══════════════════════════════════════════════════════════════════════
log "Phase 2: Generating WireGuard keypairs..."

generate_keypair() {
  local name="$1"
  local keyfile="$WG_DIR/${name}.key"
  local pubfile="$WG_DIR/${name}.pub"

  if [[ -f "$keyfile" ]]; then
    warn "Keypair for $name already exists, skipping"
    return
  fi

  wg genkey | tee "$keyfile" | wg pubkey > "$pubfile"
  chmod 600 "$keyfile"
  log "Generated keypair for $name"
}

generate_keypair "workstation"
generate_keypair "node1"
generate_keypair "node2"
generate_keypair "node3"

# Read keys into variables
WS_PRIVATE_KEY=$(cat "$WG_DIR/workstation.key")
WS_PUBLIC_KEY=$(cat "$WG_DIR/workstation.pub")
NODE1_PRIVATE_KEY=$(cat "$WG_DIR/node1.key")
NODE1_PUBLIC_KEY=$(cat "$WG_DIR/node1.pub")
NODE2_PRIVATE_KEY=$(cat "$WG_DIR/node2.key")
NODE2_PUBLIC_KEY=$(cat "$WG_DIR/node2.pub")
NODE3_PRIVATE_KEY=$(cat "$WG_DIR/node3.key")
NODE3_PUBLIC_KEY=$(cat "$WG_DIR/node3.pub")

# ══════════════════════════════════════════════════════════════════════
# Phase 3: Build config files from templates
# ══════════════════════════════════════════════════════════════════════
log "Phase 3: Building WireGuard configs..."

# Workstation config
export WS_PRIVATE_KEY NODE1_PUBLIC_KEY NODE2_PUBLIC_KEY NODE3_PUBLIC_KEY
envsubst < "$WG_DIR/wg0-workstation.conf.tpl" > "$WG_DIR/wg0-workstation.conf"
chmod 600 "$WG_DIR/wg0-workstation.conf"
log "Built workstation config"

# Hetzner node configs
NODE_KEYS=("$NODE1_PRIVATE_KEY" "$NODE2_PRIVATE_KEY" "$NODE3_PRIVATE_KEY")

for i in 0 1 2; do
  export NODE_PRIVATE_KEY="${NODE_KEYS[$i]}"
  export NODE_WG_IP="${ALL_WG_IPS[$i]}"
  export NODE_NAME="${ALL_NAMES[$i]}"
  export NODE_IP="${ALL_IPS[$i]}"
  export WS_PUBLIC_KEY

  envsubst < "$WG_DIR/wg0-hetzner.conf.tpl" > "$WG_DIR/wg0-${ALL_NAMES[$i]}.conf"
  chmod 600 "$WG_DIR/wg0-${ALL_NAMES[$i]}.conf"
  log "Built config for ${ALL_NAMES[$i]}"
done

# ══════════════════════════════════════════════════════════════════════
# Phase 4: Deploy to Hetzner nodes
# ══════════════════════════════════════════════════════════════════════
log "Phase 4: Deploying WireGuard to Hetzner nodes..."

for i in 0 1 2; do
  ip="${ALL_IPS[$i]}"
  name="${ALL_NAMES[$i]}"
  conf="$WG_DIR/wg0-${name}.conf"

  log "[$name] Installing wireguard-tools..."
  run_ssh "$ip" "apt-get update -qq && apt-get install -y -qq wireguard-tools"

  log "[$name] Deploying config..."
  scp_to "$ip" "$conf" "/etc/wireguard/wg0.conf"
  run_ssh "$ip" "chmod 600 /etc/wireguard/wg0.conf"

  log "[$name] Opening firewall port 51820/udp..."
  run_ssh "$ip" "ufw allow 51820/udp comment 'WireGuard GPU worker tunnel'"

  log "[$name] Enabling WireGuard..."
  run_ssh "$ip" "systemctl enable wg-quick@wg0 && systemctl restart wg-quick@wg0"

  log "[$name] WireGuard active"
done

# ══════════════════════════════════════════════════════════════════════
# Phase 5: Start WireGuard on workstation
# ══════════════════════════════════════════════════════════════════════
log "Phase 5: Starting WireGuard on workstation..."

sudo cp "$WG_DIR/wg0-workstation.conf" /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf

# Stop if already running
sudo wg-quick down wg0 2>/dev/null || true
sudo wg-quick up wg0

# ══════════════════════════════════════════════════════════════════════
# Phase 6: Verify connectivity
# ══════════════════════════════════════════════════════════════════════
log "Phase 6: Verifying tunnel connectivity..."

FAILED=0
for i in 0 1 2; do
  wg_ip="${ALL_WG_IPS[$i]}"
  name="${ALL_NAMES[$i]}"
  if ping -c 2 -W 3 "$wg_ip" &>/dev/null; then
    log "[$name] Reachable at $wg_ip"
  else
    warn "[$name] NOT reachable at $wg_ip"
    FAILED=1
  fi
done

echo ""
if [[ $FAILED -eq 0 ]]; then
  log "WireGuard tunnel setup complete!"
  echo ""
  echo "  Workstation: $WS_WG_IP"
  echo "  Node 1:      $NODE1_WG_IP ($NODE1_IP)"
  echo "  Node 2:      $NODE2_WG_IP ($NODE2_IP)"
  echo "  Node 3:      $NODE3_WG_IP ($NODE3_IP)"
  echo ""
  echo "  Next: task gpu-worker:start && task gpu-worker:switch-prod"
else
  warn "Some nodes are not reachable. Check firewall rules and WireGuard logs."
  echo "  Debug: sudo wg show"
  echo "  Logs:  sudo journalctl -u wg-quick@wg0 --no-pager -n 20"
fi
