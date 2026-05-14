---
name: hetzner-node
description: Use when provisioning a new Hetzner node or resetting an existing one — guides through key management, cloud-config generation, Rescue Mode reinstall, and k3s cluster join. WireGuard mesh is wired automatically so the node reconnects without peer updates on every future reset.
---

# hetzner-node

Interactive runbook for provisioning or resetting a Hetzner server. Handles all three k3s roles (control-plane-init, control-plane-join, worker) and both modes (new server, Rescue Mode reset).

**Key design:** Each node's WireGuard private key is stored once in `environments/.secrets/<env>.yaml` (sealed). The same key survives every reset — existing mesh peers never need updating on recovery, only on first provisioning.

---

## Phase 0 — Input Collection

Ask:

```
Mode?
  [1] New server    — paste cloud-config as User Data when creating in Hetzner
  [2] Reset         — existing server via Rescue Mode reinstall

Role?
  [1] Control-Plane INIT    → prod/cloud-init.yaml
  [2] Control-Plane JOIN    → prod/cloud-init-join-cp.yaml
  [3] Worker / Agent        → prod/cloud-init-worker.yaml

Target env?       mentolder / korczewski
Node name?        e.g. gekko-hetzner-5
Node public IP?   e.g. 178.104.x.x
```

For JOIN and WORKER also ask:
```
Existing CP IP (for server URL):
K3S token (from live CP or see below):
```

Get the K3S token from the cluster:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@<CP_IP> \
  "sudo cat /var/lib/rancher/k3s/server/node-token"
```

### Phase 0b — WireGuard key decision

Check `environments/.secrets/<env>.yaml` for an existing key under `WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY`:

```bash
grep "WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY" environments/.secrets/<env>.yaml 2>/dev/null
```

**Key exists (recovery path):**
- Use the stored private key — no peer updates needed.
- Derive the public key: `echo "<PRIVATE_KEY>" | wg pubkey`
- Confirm the derived public key matches what's in `wireguard/wg-mesh-nodes.yaml`.

**Key absent (first provisioning):**
- Generate a new keypair:
  ```bash
  WG_PRIVATE=$(wg genkey)
  WG_PUBLIC=$(echo "$WG_PRIVATE" | wg pubkey)
  echo "Private: $WG_PRIVATE"
  echo "Public:  $WG_PUBLIC"
  ```
- Store in `.secrets/<env>.yaml`:
  ```yaml
  WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY: "<WG_PRIVATE>"
  WG_MESH_<SCHEMA_KEY>_PUBLIC_KEY: "<WG_PUBLIC>"
  ```
- Re-seal: `task env:seal ENV=<env>`
- Record the public key and wg_ip in `wireguard/wg-mesh-nodes.yaml` under the correct env block.

Ask for the node's wg-mesh IP if not already set in `wireguard/wg-mesh-nodes.yaml`:
```
wg-mesh IP for this node?   (next free in subnet, e.g. 10.13.13.5)
```

---

## Phase 1 — Generate Cloud-Config

### Step 1: Build the peer list

Read `wireguard/wg-mesh-nodes.yaml` for the target env. Build a WireGuard `[Peer]` block for every node **except the one being provisioned**. Include home workers (no endpoint = NAT, use PersistentKeepalive only).

```
[Peer]
# <node_name>
PublicKey = <public_key>
Endpoint = <endpoint>          # omit line if endpoint is ""
AllowedIPs = <wg_ip>/32
PersistentKeepalive = 25
```

For nodes whose `public_key` is still `""` in the registry: warn the user and skip that peer entry (it can be added live after both nodes are up via `wg set`).

### Step 2: Substitute placeholders into the cloud-init template

```bash
TEMPLATE="prod/cloud-init.yaml"   # or join-cp / worker variant
WG_PEERS_BLOCK="<the peer block built above>"

# Use sed for single-line replacements; Python for the multi-line peer block
python3 - <<'EOF'
import sys, re

template  = open("$TEMPLATE").read()
private   = "$WG_PRIVATE"
node_ip   = "$WG_NODE_IP"
peers     = """$WG_PEERS_BLOCK"""

out = template \
    .replace("REPLACEME_WG_PRIVATE_KEY", private) \
    .replace("REPLACEME_WG_NODE_IP",     node_ip) \
    .replace("REPLACEME_WG_PEERS_BLOCK", peers)

# For join-cp and worker: also replace k3s server/token placeholders
out = out \
    .replace("EXISTING_CP_IP",  "$CP_IP") \
    .replace("K3S_TOKEN_HERE",  "$K3S_TOKEN") \
    .replace("PROD_DOMAIN",     "$PROD_DOMAIN")

open("/tmp/cloud-init-ready.yaml", "w").write(out)
print("Written to /tmp/cloud-init-ready.yaml")
EOF
```

Show the generated file to the user for confirmation before proceeding.

---

## Phase 2a — New Server

```bash
hcloud server create \
  --name <hostname> \
  --type <type>        \   # cx22 / cx32 / ccx23 / …
  --image ubuntu-24.04 \
  --location <fsn1|hel1|nbg1> \
  --ssh-key <hcloud-key-name> \
  --user-data-from-file /tmp/cloud-init-ready.yaml
```

Skip to Phase 3.

---

## Phase 2b — Reset via Rescue Mode

### Step 1: Enable Rescue Mode

Hetzner Console → Server → Rescue → Enable (linux64) → note root password.
Or via CLI:
```bash
hcloud server enable-rescue --type linux64 <server-id>
hcloud server reset <server-id>
```

### Step 2: SSH into rescue + reinstall

```bash
ssh -o StrictHostKeyChecking=no root@<NODE_IP>
# Inside rescue shell:
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

### Step 3: Inject cloud-init + reboot

```bash
# From your local machine — copy cloud-init into the reinstalled OS
scp -o StrictHostKeyChecking=no /tmp/cloud-init-ready.yaml \
  root@<NODE_IP>:/mnt/etc/cloud/cloud.cfg.d/99_custom.cfg

# Back in the rescue shell:
reboot
```

---

## Phase 3 — Wait for SSH

```bash
echo "Waiting for SSH on $NODE_IP..."
until ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no \
  -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP true 2>/dev/null; do
  printf "."; sleep 10
done
echo " SSH ready!"

# Verify cloud-init completed cleanly
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo cloud-init status --wait && sudo cloud-init status"
```

Check wg-mesh came up before k3s:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "ip addr show wg-mesh && sudo wg show wg-mesh"
```

If wg-mesh shows no peers or is not up:
```bash
# Troubleshoot — check journald
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo journalctl -u wg-quick@wg-mesh -n 30 --no-pager"
```

---

## Phase 4 — WireGuard Peer Sync

**Recovery (same key reused):** wg-mesh reconnects automatically to all existing peers the moment it comes up. Skip peer update. Verify:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo wg show wg-mesh | grep 'latest handshake'"
```

**First provisioning (new key):** Existing peers must be told the new public key.

```bash
NEW_PUBLIC="<WG_PUBLIC from Phase 0b>"
NEW_WG_IP="<WG_NODE_IP>"
NEW_ENDPOINT="<NODE_PUBLIC_IP>:51820"

# All existing Hetzner nodes in the cluster
for PEER_IP in <CP1_IP> <CP2_IP> <CP3_IP>; do
  echo "Updating peer on $PEER_IP..."
  ssh -i ~/.ssh/id_ed25519_hetzner patrick@$PEER_IP \
    "sudo wg set wg-mesh peer $NEW_PUBLIC \
       allowed-ips ${NEW_WG_IP}/32 \
       endpoint $NEW_ENDPOINT \
       persistent-keepalive 25"

  # Make permanent in /etc/wireguard/wg-mesh.conf
  ssh -i ~/.ssh/id_ed25519_hetzner patrick@$PEER_IP \
    "printf '\n[Peer]\n# <NODE_NAME>\nPublicKey = %s\nEndpoint = %s\nAllowedIPs = %s/32\nPersistentKeepalive = 25\n' \
     '$NEW_PUBLIC' '$NEW_ENDPOINT' '$NEW_WG_IP' \
     | sudo tee -a /etc/wireguard/wg-mesh.conf > /dev/null"
done
```

Update `wireguard/wg-mesh-nodes.yaml` with the new node's public key and commit:
```bash
# Edit wireguard/wg-mesh-nodes.yaml — set public_key for this node
git add wireguard/wg-mesh-nodes.yaml environments/sealed-secrets/<env>.yaml
git commit -m "chore(infra): add wg-mesh key for <node-name>"
git push
```

---

## Phase 5 — k3s Join Verification (JOIN / WORKER roles)

```bash
# Node should appear within ~60s after k3s starts
kubectl get nodes --context <env> -o wide

# If not after 2 min, check logs:
ssh -i ~/.ssh/id_ed25519_hetzner patrick@$NODE_IP \
  "sudo journalctl -u k3s -u k3s-agent -n 50 --no-pager"
```

Label the node:
```bash
NODE_NAME=<hostname>

# Control-plane join:
kubectl label node $NODE_NAME \
  node-role.kubernetes.io/control-plane="" \
  node-role.kubernetes.io/etcd="" \
  --context <env>

# Worker:
kubectl label node $NODE_NAME \
  node-role.kubernetes.io/worker="" \
  --context <env>
```

---

## Phase 6 — Post-Provisioning Checklist

```bash
task health
task workspace:status ENV=<env>
```

If this is a permanent new node (not replacing an existing one):
- Add it to `scripts/setup-ha-cluster.sh` (`ALL_IPS`, `ALL_NAMES`).
- Add it to `Taskfile.yml → ha:import-image → HA_NODES`.
- Add a home worker `wg-mesh.conf` peer entry for each home-LAN node if applicable.

---

## Quick Reference

| File | Purpose |
|------|---------|
| `prod/cloud-init.yaml` | CP INIT — starts new cluster |
| `prod/cloud-init-join-cp.yaml` | CP JOIN — joins existing cluster |
| `prod/cloud-init-worker.yaml` | Worker/Agent |
| `wireguard/wg-mesh-nodes.yaml` | Node registry: IPs + public keys (committed) |
| `environments/.secrets/<env>.yaml` | Private keys (sealed, gitignored) |
| `environments/schema.yaml` | WG_MESH_* key declarations |

## Common Blockers

| Symptom | Fix |
|---------|-----|
| `wg-mesh` not up after cloud-init | `journalctl -u wg-quick@wg-mesh` — check for malformed config or missing private key |
| k3s `NotReady`, Flannel errors | `wg-mesh` came up too slowly — confirm `ip addr show wg-mesh` exists, then restart k3s |
| Handshakes not forming | Public key mismatch — re-derive: `echo "<PRIVATE_KEY>" \| wg pubkey` and compare |
| `installimage` not found | Wrong Rescue type — select `linux64` in Hetzner console |
| `wg set` fails on existing peers | `sudo modprobe wireguard` if module not loaded |
| Node appears in cluster but pods `Pending` | wg-mesh peer missing for a home-LAN worker — add peer entry manually |
