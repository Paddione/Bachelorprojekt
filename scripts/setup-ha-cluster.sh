#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Bootstrap a 3-node k3s HA cluster on bare Hetzner servers
#
# Usage:  ./scripts/setup-ha-cluster.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Node configuration ────────────────────────────────────────────────
NODE1_NAME="gekko-hetzner-2"
NODE1_IP="178.104.169.206"

NODE2_NAME="gekko-hetzner-3"
NODE2_IP="46.225.125.59"

NODE3_NAME="gekko-hetzner-4"
NODE3_IP="178.104.159.79"

ALL_IPS=("$NODE1_IP" "$NODE2_IP" "$NODE3_IP")
ALL_NAMES=("$NODE1_NAME" "$NODE2_NAME" "$NODE3_NAME")

SSH_KEY="$HOME/.ssh/id_ed25519_hetzner"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -i $SSH_KEY"
SSH_USER="root"

# Load environment config — accepts ENV= parameter (default: mentolder)
ENV="${ENV:-mentolder}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"
PROD_DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN not set — check environments/${ENV}.yaml}"

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
# Phase 1: Base setup on ALL nodes
# ══════════════════════════════════════════════════════════════════════
setup_node() {
  local ip="$1"
  local name="$2"

  log "[$name] Starting base setup on $ip ..."

  # Set hostname first
  run_ssh "$ip" "hostnamectl set-hostname '$name'"

  # Upload and run setup script
  local tmp_script="/tmp/setup-node-${name}.sh"
  cat > "$tmp_script" <<'SETUP_EOF'
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo ">>> Updating packages"
apt-get update -qq
apt-get upgrade -y -qq

echo ">>> Installing required packages"
apt-get install -y -qq \
  curl wget git htop jq \
  unattended-upgrades apt-transport-https \
  open-iscsi nfs-common \
  fail2ban ufw

echo ">>> Enabling iscsid (required for Longhorn)"
systemctl enable --now iscsid

echo ">>> Writing sysctl tuning"
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

echo ">>> Configuring fail2ban"
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

echo ">>> Configuring SSH hardening"
tee /etc/ssh/sshd_config.d/hardened.conf > /dev/null <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
SSHD
systemctl restart ssh || systemctl restart sshd

echo ">>> Configuring firewall"
ufw --force reset > /dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 6443/tcp
ufw allow 10250/tcp
ufw allow 8472/udp
ufw allow 2379:2380/tcp
ufw allow 9500/tcp
ufw allow 10256/tcp
ufw --force enable

echo ">>> Enabling unattended-upgrades"
systemctl enable unattended-upgrades
systemctl start unattended-upgrades

echo ">>> Creating patrick user"
if ! id patrick &>/dev/null; then
  useradd -m -s /bin/bash -G sudo patrick
  echo "patrick ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/patrick
  mkdir -p /home/patrick/.ssh
  cp /root/.ssh/authorized_keys /home/patrick/.ssh/authorized_keys
  chown -R patrick:patrick /home/patrick/.ssh
  chmod 700 /home/patrick/.ssh
  chmod 600 /home/patrick/.ssh/authorized_keys
fi

echo ">>> Base setup complete on $(hostname)"
SETUP_EOF

  scp_to "$ip" "$tmp_script" "/tmp/setup-node.sh"
  run_ssh "$ip" "chmod +x /tmp/setup-node.sh && /tmp/setup-node.sh"
  rm -f "$tmp_script"

  log "[$name] Base setup complete"
}

# ══════════════════════════════════════════════════════════════════════
# Phase 2: Install k3s on first node (cluster-init)
# ══════════════════════════════════════════════════════════════════════
install_k3s_node1() {
  local ip="$NODE1_IP"
  local name="$NODE1_NAME"

  log "[$name] Installing k3s (cluster-init) ..."

  local tmp_script="/tmp/install-k3s-node1.sh"
  cat > "$tmp_script" <<K3S1_EOF
#!/usr/bin/env bash
set -euo pipefail

mkdir -p /etc/rancher/k3s

cat > /etc/rancher/k3s/config.yaml <<'K3SCONF'
tls-san:
  - "${PROD_DOMAIN}"
  - "*.${PROD_DOMAIN}"
  - "${NODE1_IP}"
  - "${NODE2_IP}"
  - "${NODE3_IP}"
disable:
  - traefik
  - servicelb
kubelet-arg:
  - "max-pods=110"
kube-apiserver-arg:
  - "default-not-ready-toleration-seconds=30"
  - "default-unreachable-toleration-seconds=30"
write-kubeconfig-mode: "0644"
cluster-init: true
secrets-encryption: true
node-name: "${name}"
K3SCONF

echo ">>> Installing k3s ..."
curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL=stable sh -

echo ">>> Waiting for k3s to be ready ..."
for i in \$(seq 1 60); do
  kubectl get nodes 2>/dev/null | grep -q "Ready" && break
  sleep 3
done

echo ">>> Setting up kubeconfig for patrick"
mkdir -p /home/patrick/.kube
cp /etc/rancher/k3s/k3s.yaml /home/patrick/.kube/config
sed -i "s/127.0.0.1/${ip}/g" /home/patrick/.kube/config
chown -R patrick:patrick /home/patrick/.kube

echo ">>> Installing Helm"
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

echo ">>> Installing task"
sh -c "\$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin

echo ">>> k3s node 1 ready!"
kubectl get nodes
K3S1_EOF

  scp_to "$ip" "$tmp_script" "/tmp/install-k3s.sh"
  run_ssh "$ip" "chmod +x /tmp/install-k3s.sh && /tmp/install-k3s.sh"
  rm -f "$tmp_script"

  log "[$name] k3s cluster initialized"
}

# ══════════════════════════════════════════════════════════════════════
# Phase 3: Join additional nodes
# ══════════════════════════════════════════════════════════════════════
join_k3s_node() {
  local ip="$1"
  local name="$2"
  local token="$3"

  log "[$name] Joining k3s cluster ..."

  local tmp_script="/tmp/join-k3s-${name}.sh"
  cat > "$tmp_script" <<JOINEOF
#!/usr/bin/env bash
set -euo pipefail

mkdir -p /etc/rancher/k3s

cat > /etc/rancher/k3s/config.yaml <<'K3SCONF'
server: https://${NODE1_IP}:6443
token: ${token}
tls-san:
  - "${PROD_DOMAIN}"
  - "*.${PROD_DOMAIN}"
  - "${NODE1_IP}"
  - "${NODE2_IP}"
  - "${NODE3_IP}"
disable:
  - traefik
  - servicelb
kubelet-arg:
  - "max-pods=110"
write-kubeconfig-mode: "0644"
secrets-encryption: true
node-name: "${name}"
K3SCONF

echo ">>> Installing k3s (server mode, joining cluster) ..."
curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL=stable sh -s - server

echo ">>> Waiting for node to be ready ..."
for i in \$(seq 1 60); do
  kubectl get node "${name}" 2>/dev/null | grep -q "Ready" && break
  sleep 3
done

echo ">>> Installing Helm"
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

echo ">>> [${name}] joined cluster successfully!"
JOINEOF

  scp_to "$ip" "$tmp_script" "/tmp/join-k3s.sh"
  run_ssh "$ip" "chmod +x /tmp/join-k3s.sh && /tmp/join-k3s.sh"
  rm -f "$tmp_script"

  log "[$name] Joined cluster"
}

# ══════════════════════════════════════════════════════════════════════
# Phase 4: Post-cluster setup (Traefik, Longhorn)
# ══════════════════════════════════════════════════════════════════════
post_cluster_setup() {
  log "Installing Traefik + Longhorn ..."

  local tmp_script="/tmp/post-cluster.sh"
  cat > "$tmp_script" <<'POSTEOF'
#!/usr/bin/env bash
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo ">>> Waiting for all nodes to be Ready ..."
for i in $(seq 1 30); do
  READY=$(kubectl get nodes --no-headers 2>/dev/null | grep -c "Ready" || true)
  [ "$READY" -ge 3 ] && break
  echo "  $READY/3 nodes ready, waiting..."
  sleep 10
done
kubectl get nodes

echo ">>> Installing Traefik via Helm (DaemonSet)"
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm install traefik traefik/traefik -n kube-system \
  --set ports.web.hostPort=80 \
  --set ports.websecure.hostPort=443 \
  --set deployment.kind=DaemonSet \
  --set ingressRoute.dashboard.enabled=false

echo ">>> Installing Longhorn for distributed storage"
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --create-namespace \
  --set defaultSettings.defaultReplicaCount=2 \
  --set defaultSettings.defaultDataLocality=best-effort

echo ">>> Waiting for Longhorn to be ready ..."
kubectl rollout status deployment/longhorn-driver-deployer -n longhorn-system --timeout=300s

echo ">>> Setting Longhorn as default StorageClass"
kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl patch storageclass longhorn -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

echo ">>> Cluster overview:"
kubectl get nodes -o wide
echo "---"
kubectl get pods -A
echo "---"
kubectl get storageclass

echo ">>> Post-cluster setup complete!"
POSTEOF

  scp_to "$NODE1_IP" "$tmp_script" "/tmp/post-cluster.sh"
  run_ssh "$NODE1_IP" "chmod +x /tmp/post-cluster.sh && /tmp/post-cluster.sh"
  rm -f "$tmp_script"

  log "Traefik + Longhorn installed"
}

# ══════════════════════════════════════════════════════════════════════
# Phase 5: Fetch kubeconfig for local use
# ══════════════════════════════════════════════════════════════════════
fetch_kubeconfig() {
  local kubeconfig_path="$HOME/.kube/config-mentolder-ha"

  log "Fetching kubeconfig ..."

  run_ssh "$NODE1_IP" "cat /etc/rancher/k3s/k3s.yaml" \
    | sed "s/127.0.0.1/$NODE1_IP/g" \
    | sed "s/: default$/: mentolder-ha/g" \
    > "$kubeconfig_path"

  chmod 600 "$kubeconfig_path"

  log "Kubeconfig saved to $kubeconfig_path"
  log "Merge into your config with:"
  echo "  export KUBECONFIG=~/.kube/config:$kubeconfig_path"
  echo "  kubectl config view --flatten > ~/.kube/config.merged && mv ~/.kube/config.merged ~/.kube/config"
  echo "  kubectl config use-context mentolder-ha"
}

# ══════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════
main() {
  echo ""
  echo "  ╔═══════════════════════════════════════════════════╗"
  echo "  ║  k3s HA Cluster Bootstrap (3 Hetzner Nodes)      ║"
  echo "  ╠═══════════════════════════════════════════════════╣"
  echo "  ║  Node 1: $NODE1_NAME  $NODE1_IP  ║"
  echo "  ║  Node 2: $NODE2_NAME  $NODE2_IP      ║"
  echo "  ║  Node 3: $NODE3_NAME  $NODE3_IP   ║"
  echo "  ╚═══════════════════════════════════════════════════╝"
  echo ""

  # Verify SSH connectivity
  log "Verifying SSH connectivity ..."
  for i in 0 1 2; do
    if ! run_ssh "${ALL_IPS[$i]}" "echo 'OK'" &>/dev/null; then
      err "Cannot SSH to ${ALL_NAMES[$i]} (${ALL_IPS[$i]})"
    fi
    log "  ${ALL_NAMES[$i]} (${ALL_IPS[$i]}) - reachable"
  done

  # Phase 1: Base setup (sequential to avoid output interleaving)
  log "Phase 1: Base setup on all nodes ..."
  for i in 0 1 2; do
    setup_node "${ALL_IPS[$i]}" "${ALL_NAMES[$i]}"
  done
  log "Phase 1 complete"

  # Phase 2: Initialize k3s on node 1
  log "Phase 2: Initialize k3s cluster on ${NODE1_NAME} ..."
  install_k3s_node1

  # Get join token
  K3S_TOKEN=$(run_ssh "$NODE1_IP" "cat /var/lib/rancher/k3s/server/node-token")
  log "Got cluster join token"

  # Phase 3: Join nodes 2 & 3 (sequential for cleaner output)
  log "Phase 3: Joining remaining nodes ..."
  join_k3s_node "$NODE2_IP" "$NODE2_NAME" "$K3S_TOKEN"
  join_k3s_node "$NODE3_IP" "$NODE3_NAME" "$K3S_TOKEN"
  log "Phase 3 complete - all nodes joined"

  # Phase 4: Post-cluster setup
  log "Phase 4: Installing Traefik + Longhorn ..."
  post_cluster_setup

  # Phase 5: Fetch kubeconfig
  fetch_kubeconfig

  echo ""
  log "========================================="
  log "  HA Cluster is ready!"
  log "========================================="
  log ""
  log "Next steps:"
  log "  1. Merge kubeconfig (see above)"
  log "  2. Install cert-manager:  task cert:install"
  log "  3. Store cert secret:     task cert:secret -- <ipv64-api-key>"
  log "  4. Deploy workspace:      task workspace:prod:deploy"
  log ""
}

main "$@"
