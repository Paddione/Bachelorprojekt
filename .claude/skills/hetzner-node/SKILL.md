---
name: hetzner-node
description: Use when provisioning a new Hetzner node or resetting an existing one — guides through cloud-config selection, Rescue Mode reinstall, WireGuard mesh wiring, and k3s cluster join.
---

# hetzner-node

Interactive runbook for provisioning or resetting a Hetzner server into the k3s cluster. Covers all three roles (control-plane-init, control-plane-join, worker) and both modes (new server, Rescue Mode reset).

---

## Phase 0 — Input Collection

Ask the user:

```
Mode?
  [1] New server    — paste cloud-config as User Data when creating in Hetzner
  [2] Reset         — existing server via Rescue Mode reinstall

Role?
  [1] Control-Plane INIT    — starts a brand-new cluster  → prod/cloud-init.yaml
  [2] Control-Plane JOIN    — adds HA etcd member          → prod/cloud-init-join-cp.yaml
  [3] Worker / Agent        — pure workload node            → prod/cloud-init-worker.yaml

Target env? (mentolder / korczewski)
Node public IP?
Node hostname? (e.g. gekko-hetzner-5)
```

For roles JOIN and WORKER, also ask:
```
Existing CP IP (for server URL):
K3S token (from /var/lib/rancher/k3s/server/node-token on CP-1):
WireGuard mesh IP for this node (e.g. 10.13.13.5):
```

Get the K3S token from the live cluster if needed:
```bash
kubectl exec -n kube-system --context <env> \
  $(kubectl get pod -n kube-system --context <env> -l component=kube-apiserver -o name | head -1) \
  -- cat /var/lib/rancher/k3s/server/node-token 2>/dev/null \
  || ssh patrick@<CP_IP> "sudo cat /var/lib/rancher/k3s/server/node-token"
```

---

## Phase 1 — Prepare Cloud-Config

Select the template file based on role:

| Role | File |
|------|------|
| CP INIT | `prod/cloud-init.yaml` |
| CP JOIN | `prod/cloud-init-join-cp.yaml` |
| Worker | `prod/cloud-init-worker.yaml` |

For JOIN and WORKER, substitute the placeholders in the template:
```bash
sed \
  -e "s|EXISTING_CP_IP|<CP_IP>|g" \
  -e "s|K3S_TOKEN_HERE|<TOKEN>|g" \
  -e "s|PROD_DOMAIN|<PROD_DOMAIN>|g" \
  prod/cloud-init-join-cp.yaml > /tmp/cloud-init-ready.yaml
```

Show the final config and ask: "Looks good to apply?"

---

## Phase 2a — New Server

Paste the generated cloud-config as **User data** when creating the server in the Hetzner Cloud Console, or use the CLI:

```bash
hcloud server create \
  --name <hostname> \
  --type <type>       \  # e.g. cx22, cx32, ccx23
  --image ubuntu-24.04 \
  --location <fsn1|hel1|nbg1> \
  --ssh-key <your-hcloud-key-name> \
  --user-data-from-file /tmp/cloud-init-ready.yaml
```

Skip to Phase 3 (wait for SSH).

---

## Phase 2b — Reset via Rescue Mode

### Step 1: Enable Rescue Mode

In Hetzner Cloud Console: Server → Rescue → Enable rescue & root password → note the root password.
Or via CLI:
```bash
hcloud server enable-rescue --type linux64 <server-id>
hcloud server reset <server-id>
```

### Step 2: SSH into rescue

```bash
ssh -o StrictHostKeyChecking=no root@<NODE_IP>
# Use the rescue root password shown in Hetzner console
```

### Step 3: Reinstall OS

```bash
# Inside rescue shell — installs Ubuntu 24.04 LTS
cat > /tmp/installimage.conf <<'EOF'
DRIVE1 /dev/sda
BOOTLOADER grub
HOSTNAME <hostname>
PART /boot ext4 512M
PART swap swap 4G
PART / ext4 all
IMAGE /root/.oldroot/nfs/install/../images/Ubuntu-2404-noble-amd64-base.tar.gz
EOF
installimage -a -c /tmp/installimage.conf
```

Wait for installimage to finish (~3-5 min), then:

### Step 4: Inject cloud-init and reboot

```bash
# Copy cloud-init config to the new install
mkdir -p /mnt/root/var/lib/cloud/instance
cp /tmp/cloud-init-ready.yaml /mnt/root/etc/cloud/cloud.cfg.d/99_custom.cfg

reboot
```

---

## Phase 3 — Wait for SSH

Poll until the node accepts SSH connections (cloud-init takes 3-8 min):

```bash
NODE_IP=<NODE_IP>
echo "Waiting for SSH on $NODE_IP..."
until ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no \
  -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP true 2>/dev/null; do
  printf "."; sleep 10
done
echo " SSH ready!"
```

Verify cloud-init completed without errors:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo cloud-init status --wait && sudo journalctl -u cloud-final --no-pager | tail -5"
```

---

## Phase 4 — WireGuard Mesh

The wg-mesh connects all cluster nodes (Hetzner CPs + home workers). Each node needs a unique key pair and peer entries for every other node.

### Step 1: Generate key pair for the new node

```bash
NODE_PRIVATE=$(wg genkey)
NODE_PUBLIC=$(echo "$NODE_PRIVATE" | wg pubkey)
echo "Private: $NODE_PRIVATE"
echo "Public:  $NODE_PUBLIC"
```

Record the public key — existing nodes need it as a new `[Peer]` entry.

### Step 2: Build wg0.conf for the new node

Use `wireguard/wg0-hetzner.conf.tpl` as a base and add `[Peer]` sections for every existing cluster node. Example for a mentolder node:

```ini
[Interface]
PrivateKey = <NODE_PRIVATE>
Address = <NODE_WG_IP>/24     # e.g. 10.13.13.5/24
ListenPort = 51820

# ── Existing peers ─────────────────────────────────────────────
[Peer]
# gekko-hetzner-2
PublicKey = <GEKKO2_PUBLIC_KEY>
Endpoint = 178.104.169.206:51820
AllowedIPs = 10.13.13.1/32
PersistentKeepalive = 25

[Peer]
# gekko-hetzner-3
PublicKey = <GEKKO3_PUBLIC_KEY>
Endpoint = 46.225.125.59:51820
AllowedIPs = 10.13.13.3/32
PersistentKeepalive = 25

[Peer]
# gekko-hetzner-4
PublicKey = <GEKKO4_PUBLIC_KEY>
Endpoint = 178.104.159.79:51820
AllowedIPs = 10.13.13.4/32
PersistentKeepalive = 25
```

Get existing public keys from live nodes if needed:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@<EXISTING_IP> \
  "sudo wg show wg-mesh public-key 2>/dev/null || sudo wg show wg0 public-key"
```

### Step 3: Deploy wg0.conf and bring up the interface

```bash
NODE_IP=<NODE_IP>
scp -i ~/.ssh/id_ed25519_hetzner /tmp/wg0-new-node.conf patrick@$NODE_IP:/tmp/wg0.conf
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP <<'ENDSSH'
  sudo mkdir -p /etc/wireguard
  sudo mv /tmp/wg0.conf /etc/wireguard/wg-mesh.conf
  sudo chmod 600 /etc/wireguard/wg-mesh.conf
  sudo systemctl enable --now wg-quick@wg-mesh
  sudo wg show wg-mesh
ENDSSH
```

### Step 4: Add new node as peer on all existing nodes

For each existing cluster node, add a `[Peer]` block at runtime (persists across restarts):
```bash
for EXISTING_IP in 178.104.169.206 46.225.125.59 178.104.159.79; do
  ssh -i ~/.ssh/id_ed25519_hetzner patrick@$EXISTING_IP \
    "sudo wg set wg-mesh peer $NODE_PUBLIC allowed-ips <NODE_WG_IP>/32 endpoint $NODE_IP:51820 persistent-keepalive 25"
done
```

To make the peer permanent on existing nodes, append to their `/etc/wireguard/wg-mesh.conf`:
```bash
for EXISTING_IP in 178.104.169.206 46.225.125.59 178.104.159.79; do
  ssh -i ~/.ssh/id_ed25519_hetzner patrick@$EXISTING_IP \
    "echo -e '\n[Peer]\n# <hostname>\nPublicKey = $NODE_PUBLIC\nEndpoint = $NODE_IP:51820\nAllowedIPs = <NODE_WG_IP>/32\nPersistentKeepalive = 25' \
     | sudo tee -a /etc/wireguard/wg-mesh.conf > /dev/null"
done
```

Verify mesh connectivity:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "ping -c2 10.13.13.1 && ping -c2 10.13.13.3"
```

---

## Phase 5 — k3s Join Verification (JOIN / WORKER roles)

Check that the node appears in the cluster:
```bash
kubectl get nodes --context <env> -o wide
# New node should appear within ~60s after k3s starts
```

If it doesn't appear after 2 minutes, check k3s logs on the new node:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo journalctl -u k3s -u k3s-agent -n 50 --no-pager"
```

### Label the node

```bash
NODE_NAME=<hostname>
# For control-plane join nodes:
kubectl label node $NODE_NAME node-role.kubernetes.io/control-plane="" --context <env>
kubectl label node $NODE_NAME node-role.kubernetes.io/etcd="" --context <env>

# For worker nodes:
kubectl label node $NODE_NAME node-role.kubernetes.io/worker="" --context <env>

# Add to the standard Hetzner affinity label set used in pod scheduling:
kubectl label node $NODE_NAME hetzner-node=true --context <env>
```

---

## Phase 6 — Post-Provisioning Checklist

```bash
# Overall cluster health
task health

# Verify workspace status on the target env
task workspace:status ENV=<env>

# Update Taskfile HA_NODES if it's a permanent mentolder node
# (Taskfile.yml → ha:import-image task → HA_NODES variable)
```

Update `scripts/setup-ha-cluster.sh` if the new node is a permanent cluster member: add `NODE_N_NAME`, `NODE_N_IP` and include it in `ALL_IPS`/`ALL_NAMES`.

Also update `wireguard/wg0-hetzner.conf.tpl` with the new peer entry so future provisioning picks it up automatically.

---

## Quick Reference

| File | Role |
|------|------|
| `prod/cloud-init.yaml` | CP INIT (new cluster) |
| `prod/cloud-init-join-cp.yaml` | CP JOIN (existing cluster) |
| `prod/cloud-init-worker.yaml` | Worker/Agent |
| `wireguard/wg0-hetzner.conf.tpl` | WireGuard template base |
| `scripts/setup-ha-cluster.sh` | Multi-node HA bootstrap script |
| `Taskfile.yml → ha:import-image` | Import Docker images to all HA nodes |

## Common Blockers

| Symptom | Fix |
|---------|-----|
| SSH refused after cloud-init | cloud-init still running — wait and retry Phase 3 poll |
| k3s agent fails with `unable to connect to server` | WireGuard not up yet, or wrong CP IP/token in cloud-config |
| Node stuck `NotReady` | Missing `flannel-iface: wg-mesh` — wg-mesh not peering |
| `wg set` fails with `Operation not supported` | WireGuard kernel module not loaded — `sudo modprobe wireguard` |
| `installimage` not found in rescue | Wrong rescue image type — select `linux64` in Hetzner console |
