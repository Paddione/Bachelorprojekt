#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Enroll pk-hetzner-2 and pk-hetzner-3 into the korczewski k3s cluster
# as additional control-plane nodes, converting it from single-node
# (SQLite) to a 3-node HA cluster (embedded etcd).
#
# Network topology after this script:
#   pk-hetzner   62.238.9.39    wg0: 192.168.100.1  (existing CP)
#   pk-hetzner-2 77.42.33.194   wg0: 192.168.100.21 (new CP)
#   pk-hetzner-3 62.238.23.79   wg0: 192.168.100.22 (new CP)
#
# WireGuard IPs .21/.22 are chosen to avoid the existing wg0 peers:
#   k3s-1..3   use 192.168.100.2-4   (home servers)
#   k3w-1..3   use 192.168.100.11-13 (RPis)
#
# Usage:  ./scripts/enroll-korczewski.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Node config ───────────────────────────────────────────────────────
CP1_PUB="62.238.9.39"
CP1_WG="192.168.100.1"
CP2_PUB="77.42.33.194"
CP2_WG="192.168.100.21"
CP2_NAME="pk-hetzner-2"

CP3_PUB="62.238.23.79"
CP3_WG="192.168.100.22"
CP3_NAME="pk-hetzner-3"

SSH_KEY="$HOME/.ssh/id_ed25519_hetzner"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -i $SSH_KEY"

# ── Colors ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }
step() { echo -e "\n${GREEN}══════════════════════════════════════${NC}"; echo -e "${GREEN}  $*${NC}"; echo -e "${GREEN}══════════════════════════════════════${NC}"; }

run1() { ssh $SSH_OPTS "root@${CP1_PUB}" "$@"; }
run2() { ssh $SSH_OPTS "root@${CP2_PUB}" "$@"; }
run3() { ssh $SSH_OPTS "root@${CP3_PUB}" "$@"; }

# ══════════════════════════════════════════════════════════════════════
# Phase 0: SSH key access on new servers
# ══════════════════════════════════════════════════════════════════════
step "Phase 0: Install SSH key on new servers"
log "You will be prompted for the root passwords once per server."
log "  pk-hetzner-2 ($CP2_PUB) password: nwKmdgadHmVL"
log "  pk-hetzner-3 ($CP3_PUB) password: RKPe4W4vVCE3"
echo ""

for IP in "$CP2_PUB" "$CP3_PUB"; do
  if ssh $SSH_OPTS "root@${IP}" "echo ok" &>/dev/null; then
    log "$IP already accepts key auth, skipping"
  else
    log "Installing SSH key on $IP (enter password when prompted)..."
    ssh-copy-id -i "${SSH_KEY}.pub" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "root@${IP}"
  fi
done
log "SSH key access confirmed on both new nodes"

# ══════════════════════════════════════════════════════════════════════
# Phase 1: Base setup on new servers (packages, sysctl, fail2ban, ufw)
# ══════════════════════════════════════════════════════════════════════
step "Phase 1: Base setup on pk-hetzner-2 and pk-hetzner-3"

base_setup() {
  local ip="$1" name="$2"
  log "[$name] Running base setup on $ip ..."

  ssh $SSH_OPTS "root@${ip}" bash <<SETUP
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

hostnamectl set-hostname "$name"

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git htop jq wireguard-tools \
  unattended-upgrades apt-transport-https \
  open-iscsi nfs-common \
  fail2ban ufw

systemctl enable --now iscsid

tee /etc/sysctl.d/99-k3s.conf > /dev/null <<'SYSCTL'
net.core.somaxconn=32768
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.ipv4.conf.all.forwarding=1
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=512
vm.max_map_count=262144
SYSCTL
sysctl --system > /dev/null

tee /etc/fail2ban/jail.local > /dev/null <<'F2B'
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 3600
findtime = 600
F2B
systemctl enable fail2ban
systemctl restart fail2ban

tee /etc/ssh/sshd_config.d/hardened.conf > /dev/null <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
SSHD
systemctl restart ssh || systemctl restart sshd

ufw --force reset > /dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 6443/tcp       # k3s API
ufw allow 2379:2380/tcp  # etcd
ufw allow 10250/tcp      # kubelet
ufw allow 8472/udp       # flannel VXLAN
ufw allow 9500/tcp       # k3s metrics
ufw allow 10256/tcp      # kube-proxy health
ufw allow 51820/udp      # WireGuard (k3s mesh)
ufw allow 51820/tcp      # WireGuard fallback
ufw allow 3478/tcp       # CoTURN
ufw allow 3478/udp       # CoTURN
ufw allow 5349/tcp       # CoTURN TURNS
ufw allow 49152:49252/udp # CoTURN relay
ufw allow 7880/tcp       # LiveKit signaling
ufw allow 7881/tcp       # LiveKit RTC TCP
ufw allow 50000:60000/udp # LiveKit RTC
ufw allow 30000:40000/udp # LiveKit TURN
ufw --force enable

systemctl enable unattended-upgrades
systemctl start unattended-upgrades

echo ">>> Base setup complete on \$(hostname)"
SETUP

  log "[$name] Base setup done"
}

base_setup "$CP2_PUB" "$CP2_NAME"
base_setup "$CP3_PUB" "$CP3_NAME"

# ══════════════════════════════════════════════════════════════════════
# Phase 2: WireGuard — generate keys, configure peers
# ══════════════════════════════════════════════════════════════════════
step "Phase 2: WireGuard setup"

log "Generating WireGuard keys on new nodes ..."
CP2_WG_PRIV=$(run2 "wg genkey")
CP2_WG_PUB=$(echo "$CP2_WG_PRIV" | run2 "wg pubkey")
CP3_WG_PRIV=$(run3 "wg genkey")
CP3_WG_PUB=$(echo "$CP3_WG_PRIV" | run3 "wg pubkey")

log "pk-hetzner-2 WireGuard pubkey: $CP2_WG_PUB"
log "pk-hetzner-3 WireGuard pubkey: $CP3_WG_PUB"

# Get pk-hetzner public key and private key for peer configs
CP1_WG_PUB=$(run1 "wg show wg0 public-key")
log "pk-hetzner WireGuard pubkey: $CP1_WG_PUB"

# Write wg0.conf on pk-hetzner-2
log "Configuring wg0 on pk-hetzner-2 ..."
ssh $SSH_OPTS "root@${CP2_PUB}" bash <<WG2
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${CP2_WG}/24
ListenPort = 51820
PrivateKey = ${CP2_WG_PRIV}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

[Peer]
# pk-hetzner (CP1)
PublicKey = ${CP1_WG_PUB}
Endpoint = ${CP1_PUB}:51820
AllowedIPs = 192.168.100.0/24
PersistentKeepalive = 25
EOF
chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0
WG2

# Write wg0.conf on pk-hetzner-3
log "Configuring wg0 on pk-hetzner-3 ..."
ssh $SSH_OPTS "root@${CP3_PUB}" bash <<WG3
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${CP3_WG}/24
ListenPort = 51820
PrivateKey = ${CP3_WG_PRIV}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

[Peer]
# pk-hetzner (CP1)
PublicKey = ${CP1_WG_PUB}
Endpoint = ${CP1_PUB}:51820
AllowedIPs = 192.168.100.0/24
PersistentKeepalive = 25
EOF
chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0
WG3

# Add new peers to pk-hetzner's wg0.conf and reload
log "Adding new peers to pk-hetzner wg0.conf ..."
run1 bash <<WGPEER
# Append only if not already present
if ! grep -q "${CP2_WG_PUB}" /etc/wireguard/wg0.conf; then
  cat >> /etc/wireguard/wg0.conf <<EOF

[Peer]
# pk-hetzner-2
PublicKey = ${CP2_WG_PUB}
AllowedIPs = ${CP2_WG}/32
EOF
fi
if ! grep -q "${CP3_WG_PUB}" /etc/wireguard/wg0.conf; then
  cat >> /etc/wireguard/wg0.conf <<EOF

[Peer]
# pk-hetzner-3
PublicKey = ${CP3_WG_PUB}
AllowedIPs = ${CP3_WG}/32
EOF
fi
wg addpeer "${CP2_WG_PUB}" allowed-ips "${CP2_WG}/32" 2>/dev/null || true
wg addpeer "${CP3_WG_PUB}" allowed-ips "${CP3_WG}/32" 2>/dev/null || true
wg syncconf wg0 <(wg-quick strip wg0) 2>/dev/null || systemctl restart wg-quick@wg0
WGPEER

# Verify WireGuard connectivity
log "Waiting for WireGuard tunnels to come up ..."
sleep 5
if run1 "ping -c 2 -W 3 ${CP2_WG}" &>/dev/null; then
  log "pk-hetzner → pk-hetzner-2 (${CP2_WG}) OK"
else
  err "Cannot reach ${CP2_WG} via WireGuard — check firewall/keys"
fi
if run1 "ping -c 2 -W 3 ${CP3_WG}" &>/dev/null; then
  log "pk-hetzner → pk-hetzner-3 (${CP3_WG}) OK"
else
  err "Cannot reach ${CP3_WG} via WireGuard — check firewall/keys"
fi

# ══════════════════════════════════════════════════════════════════════
# Phase 3: Convert pk-hetzner to embedded etcd (cluster-init)
# ══════════════════════════════════════════════════════════════════════
step "Phase 3: Convert pk-hetzner SQLite → embedded etcd"
warn "k3s API will be unavailable for ~60 seconds. Pods keep running."
warn "Press Enter to proceed or Ctrl+C to abort."
read -r

log "Adding --cluster-init to k3s service ..."
run1 bash <<ETCD
# Backup service file
cp /etc/systemd/system/k3s.service /etc/systemd/system/k3s.service.bak

# Inject --cluster-init after the 'server \' line if not already present
if ! grep -q -- '--cluster-init' /etc/systemd/system/k3s.service; then
  sed -i '/ExecStart=.*k3s.*server/{ /cluster-init/! s/$/ \\\n    --cluster-init/ }' \
    /etc/systemd/system/k3s.service
fi

# Also add TLS SANs for the new nodes while we're editing
if ! grep -q "${CP2_WG}" /etc/systemd/system/k3s.service; then
  sed -i "/--tls-san ${CP1_PUB}/a\\    --tls-san ${CP2_PUB} \\\\\n    --tls-san ${CP2_WG} \\\\\n    --tls-san ${CP3_PUB} \\\\\n    --tls-san ${CP3_WG} \\\\" \
    /etc/systemd/system/k3s.service
fi

systemctl daemon-reload
systemctl restart k3s

echo "Waiting for k3s with etcd to be ready ..."
for i in \$(seq 1 60); do
  kubectl get nodes &>/dev/null && break
  sleep 3
done

kubectl get nodes
ETCD

log "pk-hetzner is now running with embedded etcd"

# ══════════════════════════════════════════════════════════════════════
# Phase 4: Join new nodes as server (control-plane)
# ══════════════════════════════════════════════════════════════════════
step "Phase 4: Join pk-hetzner-2 and pk-hetzner-3 as control-plane nodes"

K3S_TOKEN=$(run1 "cat /var/lib/rancher/k3s/server/node-token")
log "Got cluster join token"

join_node() {
  local pub_ip="$1" wg_ip="$2" name="$3"

  log "[$name] Installing k3s and joining cluster ..."
  ssh $SSH_OPTS "root@${pub_ip}" bash <<JOIN
set -euo pipefail

mkdir -p /etc/rancher/k3s
cat > /etc/rancher/k3s/config.yaml <<EOF
server: https://${CP1_WG}:6443
token: ${K3S_TOKEN}
node-ip: ${wg_ip}
node-name: ${name}
tls-san:
  - "${pub_ip}"
  - "${wg_ip}"
  - "${CP1_WG}"
disable:
  - traefik
  - servicelb
kubelet-arg:
  - "max-pods=110"
write-kubeconfig-mode: "0644"
secrets-encryption: true
EOF

curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL=stable sh -s - server

echo "Waiting for node to join ..."
for i in \$(seq 1 60); do
  kubectl get node "${name}" 2>/dev/null | grep -q "Ready" && break
  sleep 5
done

curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

echo "[$name] Joined cluster successfully"
kubectl get nodes
JOIN

  log "[$name] joined cluster"
}

join_node "$CP2_PUB" "$CP2_WG" "$CP2_NAME"
join_node "$CP3_PUB" "$CP3_WG" "$CP3_NAME"

# ══════════════════════════════════════════════════════════════════════
# Phase 5: Fetch updated kubeconfig
# ══════════════════════════════════════════════════════════════════════
step "Phase 5: Fetch kubeconfig"

KUBECONFIG_PATH="$HOME/.kube/config-korczewski"
run1 "cat /etc/rancher/k3s/k3s.yaml" \
  | sed "s/127.0.0.1/${CP1_PUB}/g" \
  | sed "s/: default$/: korczewski/g" \
  > "$KUBECONFIG_PATH"
chmod 600 "$KUBECONFIG_PATH"

log "Kubeconfig saved to $KUBECONFIG_PATH"
log "Merge into ~/.kube/config with:"
echo ""
echo "  KUBECONFIG=~/.kube/config:$KUBECONFIG_PATH kubectl config view --flatten > /tmp/kube-merged"
echo "  mv /tmp/kube-merged ~/.kube/config"
echo "  chmod 600 ~/.kube/config"
echo ""

# ══════════════════════════════════════════════════════════════════════
# Final summary
# ══════════════════════════════════════════════════════════════════════
echo ""
log "══════════════════════════════════════════════"
log "  korczewski HA cluster enrollment complete!"
log "══════════════════════════════════════════════"
echo ""
run1 "kubectl get nodes -o wide"
echo ""
log "Next: deploy the workspace:"
log "  task workspace:deploy ENV=korczewski"
