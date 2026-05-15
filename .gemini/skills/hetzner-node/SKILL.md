---
name: hetzner-node
description: Use when provisioning a new Hetzner node or resetting an existing one — guides through key management, cloud-config generation, Rescue Mode reinstall, and k3s cluster join. WireGuard mesh is wired automatically so the node reconnects without peer updates on every future reset.
---

# hetzner-node

Interactive runbook for provisioning or resetting a Hetzner server. Handles all three k3s roles (control-plane-init, control-plane-join, worker) and both modes (new server, Rescue Mode reset).

**Key design:** Each node's WireGuard private key is stored once in `environments/.secrets/<env>.yaml` (sealed). The same key survives every reset — existing mesh peers never need updating on recovery, only on first provisioning.

**Important distinction:**
- **New server via `hcloud create`** — Hetzner cloud VMs have cloud-init pre-installed; User Data runs automatically on first boot.
- **Rescue Mode reset** — `installimage` base images do **not** have cloud-init. After reboot you SSH in as root and run a setup script instead. Do NOT attempt cloud-init injection for Rescue Mode.

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
ssh patrick@<CP_IP> "sudo cat /var/lib/rancher/k3s/server/node-token"
```

Note: the default SSH key is `~/.ssh/id_ed25519` — no `-i` flag needed if that's the key in use.

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

Try `wg genkey` first. If `wg` is not installed (common on WSL), use the Python fallback:

```bash
# Preferred (needs wireguard-tools):
WG_PRIVATE=$(wg genkey)
WG_PUBLIC=$(echo "$WG_PRIVATE" | wg pubkey)

# Fallback — Python cryptography lib (available on most systems):
python3 - <<'EOF'
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
import base64
k = X25519PrivateKey.generate()
priv = base64.b64encode(k.private_bytes_raw()).decode()
pub  = base64.b64encode(k.public_key().public_bytes_raw()).decode()
print(f"Private: {priv}")
print(f"Public:  {pub}")
EOF
```

Store in `.secrets/<env>.yaml`:
```yaml
WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY: "<WG_PRIVATE>"
WG_MESH_<SCHEMA_KEY>_PUBLIC_KEY: "<WG_PUBLIC>"
```

Re-seal: `task env:seal ENV=<env>`

Record the public key, public IP endpoint, and wg_ip in `wireguard/wg-mesh-nodes.yaml` under the correct env block.

Ask for the node's wg-mesh IP if not already set in `wireguard/wg-mesh-nodes.yaml`:
```
wg-mesh IP for this node?   (next free in subnet, e.g. 10.13.13.5)
```

---

## Phase 1 — Generate Cloud-Config (new server) or Setup Script (Rescue Mode)

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

### Step 2a: Generate cloud-init (new server path only)

**Critical:** The peer block sits inside a YAML `content: |` literal-block scalar which requires consistent 6-space indentation. The replacement must indent every peer line to match — otherwise the YAML is invalid and cloud-init silently skips the file.

```python
python3 - <<'EOF'
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
import base64, yaml

TEMPLATE    = "prod/cloud-init.yaml"   # or join-cp / worker variant
WG_PRIVATE  = "<private key>"
WG_NODE_IP  = "<wg_ip>"
NODE_PUB_IP = "<public IP>"           # added to k3s tls-san
CP_IP       = "<CP IP>"               # join-cp / worker only
K3S_TOKEN   = "<token>"               # join-cp / worker only
PROD_DOMAIN = "<domain>"
INDENT      = "      "                # 6 spaces — matches content: | block depth

def build_peers(peer_list):
    blocks = []
    for name, pub, ep, wg_ip in peer_list:
        lines = [f"[Peer]", f"# {name}", f"PublicKey = {pub}"]
        if ep:
            lines.append(f"Endpoint = {ep}")
        lines += [f"AllowedIPs = {wg_ip}/32", "PersistentKeepalive = 25"]
        blocks.append("\n".join(INDENT + l for l in lines))
    return "\n\n".join(blocks)

peers = build_peers([
    # ("name", "pubkey", "endpoint_or_empty", "wg_ip"),
])

out = open(TEMPLATE).read()
out = out \
    .replace(INDENT + "REPLACEME_WG_PEERS_BLOCK", peers) \
    .replace("REPLACEME_WG_PRIVATE_KEY", WG_PRIVATE) \
    .replace("REPLACEME_WG_NODE_IP",     WG_NODE_IP) \
    .replace("REPLACEME_NODE_PUBLIC_IP", NODE_PUB_IP) \
    .replace("${PROD_DOMAIN}",           PROD_DOMAIN) \
    .replace("PROD_DOMAIN",              PROD_DOMAIN) \
    .replace("EXISTING_CP_IP",           CP_IP) \
    .replace("K3S_TOKEN_HERE",           K3S_TOKEN)

# Validate the output is legal YAML before writing
yaml.safe_load(out)

open("/tmp/cloud-init-ready.yaml", "w").write(out)
print("Written to /tmp/cloud-init-ready.yaml — YAML valid")
EOF
```

Verify no unreplaced placeholders remain (comment lines are fine):
```bash
grep "REPLACEME" /tmp/cloud-init-ready.yaml | grep -v "^#" | grep -v "skill substitutes"
```

### Step 2b: Generate setup script (Rescue Mode path only)

For Rescue Mode, the base Ubuntu 24.04 image installed by `installimage` has no cloud-init. Instead, produce a self-contained bash script that runs on first boot over SSH. Use the template below, filling in node-specific values:

```bash
cat > /tmp/setup-<nodename>.sh << 'SCRIPT'
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# ── Users ──────────────────────────────────────────────────────────────────────
id patrick &>/dev/null || useradd -m -s /bin/bash -G sudo patrick
echo 'patrick ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/patrick
id gekko &>/dev/null || useradd -m -s /bin/bash -G sudo gekko
echo 'gekko ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/gekko
mkdir -p /home/patrick/.ssh /home/gekko/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFN75CnuOz7YXaJipTFxWMVDgm35heu64JKN1QL+Z84+ patrick@korczewski.de' \
  > /home/patrick/.ssh/authorized_keys
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513' \
  > /home/gekko/.ssh/authorized_keys
chmod 700 /home/patrick/.ssh /home/gekko/.ssh
chmod 600 /home/patrick/.ssh/authorized_keys /home/gekko/.ssh/authorized_keys
chown -R patrick:patrick /home/patrick/.ssh
chown -R gekko:gekko /home/gekko/.ssh

# ── sysctl ────────────────────────────────────────────────────────────────────
cat > /etc/sysctl.d/99-k3s.conf <<'EOF'
net.core.somaxconn=32768
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.ipv4.conf.all.forwarding=1
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=512
vm.max_map_count=262144
EOF
sysctl --system >/dev/null 2>&1

# ── SSH hardening ─────────────────────────────────────────────────────────────
# NOTE: after this runs, root SSH is disabled. Use patrick@ for all further access.
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/hardened.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers patrick gekko
EOF

# ── Packages ──────────────────────────────────────────────────────────────────
apt-get update -q
apt-get install -y -q curl wget git htop unattended-upgrades apt-transport-https \
  open-iscsi nfs-common jq fail2ban ufw wireguard-tools

# ── WireGuard ─────────────────────────────────────────────────────────────────
mkdir -p /etc/wireguard && chmod 700 /etc/wireguard
cat > /etc/wireguard/wg-mesh.conf << 'WGEOF'
[Interface]
PrivateKey = FILL_WG_PRIVATE_KEY
Address = FILL_WG_NODE_IP/24
ListenPort = 51820

FILL_WG_PEERS_BLOCK
WGEOF
chmod 600 /etc/wireguard/wg-mesh.conf
systemctl enable wg-quick@wg-mesh
systemctl start wg-quick@wg-mesh
until ip addr show wg-mesh 2>/dev/null | grep -q 'inet'; do sleep 2; done
echo "WireGuard up: $(ip addr show wg-mesh | grep 'inet ')"

# ── Firewall ──────────────────────────────────────────────────────────────────
ufw default deny incoming && ufw default allow outgoing
for rule in 22/tcp 80/tcp 443/tcp 6443/tcp 10250/tcp 8472/udp 51820/udp \
            3478/tcp 3478/udp 5349/tcp "49152:49252/udp" "2379:2380/tcp" \
            7880/tcp 7881/tcp "50000:60000/udp" "30000:40000/udp"; do
  ufw allow $rule
done
ufw deny 2222/tcp
ufw --force enable

# ── k3s config ────────────────────────────────────────────────────────────────
mkdir -p /etc/rancher/k3s
# CP INIT variant — replace with join-cp block for JOIN nodes:
cat > /etc/rancher/k3s/config.yaml << 'KCFG'
tls-san:
  - FILL_PROD_DOMAIN
  - "*.FILL_PROD_DOMAIN"
  - FILL_NODE_PUBLIC_IP
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
flannel-iface: wg-mesh
KCFG
# For JOIN nodes, use instead:
# server: "https://FILL_CP_IP:6443"
# token: "FILL_K3S_TOKEN"
# (remove cluster-init: true)

# ── Services ──────────────────────────────────────────────────────────────────
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable fail2ban && systemctl start fail2ban
systemctl restart ssh    # Ubuntu 24.04: service is "ssh", not "sshd"
systemctl enable unattended-upgrades && systemctl start unattended-upgrades
systemctl enable --now iscsid

# ── k3s install ───────────────────────────────────────────────────────────────
curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL=stable sh -
until kubectl get nodes 2>/dev/null | grep -q 'Ready'; do sleep 3; done
echo "k3s ready: $(kubectl get nodes)"

# ── kubeconfig for patrick ────────────────────────────────────────────────────
mkdir -p /home/patrick/.kube
cp /etc/rancher/k3s/k3s.yaml /home/patrick/.kube/config
PUBLIC_IP=$(curl -s http://169.254.169.254/hetzner/v1/metadata/public-ipv4)
sed -i "s/127.0.0.1/${PUBLIC_IP}/g" /home/patrick/.kube/config
chown -R patrick:patrick /home/patrick/.kube

# ── CP INIT only: Helm + task + Traefik ──────────────────────────────────────
# (skip this block for JOIN / WORKER nodes)
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
sudo sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
su - patrick -c "helm repo add traefik https://traefik.github.io/charts && helm repo update"
su - patrick -c "KUBECONFIG=/home/patrick/.kube/config helm install traefik traefik/traefik \
  -n kube-system \
  --set ports.web.hostPort=80 \
  --set ports.websecure.hostPort=443 \
  --set deployment.kind=DaemonSet \
  --set ingressRoute.dashboard.enabled=false"

echo "SETUP COMPLETE on $(hostname)"
SCRIPT
```

Fill in all `FILL_*` values before running. For **JOIN** nodes running in parallel, pass node-specific values as script arguments and use background jobs:

```bash
# Run two JOIN nodes in parallel
ssh root@<IP6> bash -s < /tmp/setup-pk6.sh > /tmp/pk6.log 2>&1 &
ssh root@<IP8> bash -s < /tmp/setup-pk8.sh > /tmp/pk8.log 2>&1 &
wait
tail -3 /tmp/pk6.log /tmp/pk8.log
```

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

The `installimage` binary is **not in PATH** — use the full path:

```bash
ssh-keygen -f ~/.ssh/known_hosts -R <NODE_IP>   # clear stale host key first
ssh -o StrictHostKeyChecking=no root@<NODE_IP> bash << 'RESCUE'
cat > /tmp/installimage.conf << 'EOF'
DRIVE1 /dev/sda
BOOTLOADER grub
HOSTNAME <hostname>
PART /boot ext4 512M
PART swap swap 4G
PART / ext4 all
IMAGE /root/.oldroot/nfs/install/../images/Ubuntu-2404-noble-amd64-base.tar.gz
EOF
/root/.oldroot/nfs/install/installimage -a -c /tmp/installimage.conf
echo "INSTALL_DONE"
RESCUE
```

### Step 3: Reboot into fresh OS

```bash
ssh -o StrictHostKeyChecking=no root@<NODE_IP> "reboot" || true
```

**Do NOT attempt to inject cloud-init here.** The installimage unmounts the disk after completing — `/mnt` is gone by the time the script exits. The Hetzner base Ubuntu 24.04 image also has no cloud-init binary. Use the setup script in Phase 3 instead.

---

## Phase 3 — Run Setup Script (Rescue Mode) / Wait for cloud-init (New Server)

### Rescue Mode path

Wait for SSH on the fresh OS, then run the setup script as root. After SSH hardening takes effect, root login is disabled — subsequent commands must use `patrick@`:

```bash
# Clear stale host key (it changed from rescue → fresh OS)
ssh-keygen -f ~/.ssh/known_hosts -R <NODE_IP>

echo "Waiting for SSH..."
until ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@<NODE_IP> "echo UP" 2>/dev/null; do
  sleep 8
done
echo "SSH ready"

# Run setup script (root SSH works until hardening applies)
ssh -o StrictHostKeyChecking=no root@<NODE_IP> bash -s < /tmp/setup-<nodename>.sh

# All further SSH commands must use patrick (root login now disabled):
ssh patrick@<NODE_IP> "kubectl get nodes"
```

### New server path

Poll for patrick SSH (cloud-init creates the user):
```bash
until ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
  patrick@<NODE_IP> "sudo cloud-init status --wait" 2>/dev/null; do
  sleep 10
done
ssh patrick@<NODE_IP> "sudo cloud-init status && ip addr show wg-mesh"
```

---

## Phase 4 — WireGuard Peer Sync

**Recovery (same key reused):** wg-mesh reconnects automatically to all existing peers. Verify:
```bash
ssh patrick@<NODE_IP> "sudo wg show wg-mesh | grep 'latest handshake'"
```

**First provisioning (new key):** Existing peers must be told the new public key.

```bash
NEW_PUBLIC="<WG_PUBLIC from Phase 0b>"
NEW_WG_IP="<WG_NODE_IP>"
NEW_ENDPOINT="<NODE_PUBLIC_IP>:51820"

for PEER_IP in <CP1_IP> <CP2_IP> <CP3_IP>; do
  echo "Updating peer on $PEER_IP..."
  ssh patrick@$PEER_IP \
    "sudo wg set wg-mesh peer $NEW_PUBLIC \
       allowed-ips ${NEW_WG_IP}/32 \
       endpoint $NEW_ENDPOINT \
       persistent-keepalive 25"

  ssh patrick@$PEER_IP \
    "printf '\n[Peer]\n# <NODE_NAME>\nPublicKey = %s\nEndpoint = %s\nAllowedIPs = %s/32\nPersistentKeepalive = 25\n' \
     '$NEW_PUBLIC' '$NEW_ENDPOINT' '$NEW_WG_IP' \
     | sudo tee -a /etc/wireguard/wg-mesh.conf > /dev/null"
done
```

Update `wireguard/wg-mesh-nodes.yaml` with the new node's public key and commit:
```bash
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
ssh patrick@<NODE_IP> "sudo journalctl -u k3s -u k3s-agent -n 50 --no-pager"
```

Label the node:
```bash
NODE_NAME=<hostname>

# Control-plane join:
kubectl label node $NODE_NAME \
  node-role.kubernetes.io/control-plane="" \
  node-role.kubernetes.io/etcd="" \
  --context <env> --overwrite

# Worker:
kubectl label node $NODE_NAME \
  node-role.kubernetes.io/worker="" \
  --context <env> --overwrite
```

---

## Phase 6 — Post-Provisioning Checklist

### Update local kubeconfig (CP INIT only)

After a CP INIT reset the cluster has a new TLS CA. Delete the old stale context before merging:

```bash
kubectl config delete-context <env-context> 2>/dev/null || true
kubectl config delete-cluster  <env-context> 2>/dev/null || true
kubectl config delete-user     <env-context> 2>/dev/null || true

ssh patrick@<NODE_IP> "sudo cat /etc/rancher/k3s/k3s.yaml" \
  | sed 's/127.0.0.1/<NODE_PUBLIC_IP>/g' \
  | sed 's/: default/: <env-context>/g' \
  > /tmp/new-kubeconfig.yaml

KUBECONFIG=~/.kube/config:/tmp/new-kubeconfig.yaml kubectl config view --flatten \
  > /tmp/merged.yaml && cp /tmp/merged.yaml ~/.kube/config && chmod 600 ~/.kube/config

kubectl get nodes --context <env-context>
```

### Verify and deploy

```bash
task health
task workspace:status ENV=<env>
# Then deploy the workspace:
task workspace:deploy ENV=<env>
```

If this is a permanent new node (not replacing an existing one):
- Add it to `scripts/setup-ha-cluster.sh` (`ALL_IPS`, `ALL_NAMES`).
- Add it to `Taskfile.yml → ha:import-image → HA_NODES`.
- Add a home worker `wg-mesh.conf` peer entry for each home-LAN node if applicable.

---

## Quick Reference

| File | Purpose |
|------|---------|
| `prod/cloud-init.yaml` | CP INIT — new server User Data |
| `prod/cloud-init-join-cp.yaml` | CP JOIN — new server User Data |
| `prod/cloud-init-worker.yaml` | Worker/Agent — new server User Data |
| `wireguard/wg-mesh-nodes.yaml` | Node registry: IPs + public keys (committed) |
| `environments/.secrets/<env>.yaml` | Private keys (sealed, gitignored) |
| `environments/schema.yaml` | WG_MESH_* key declarations |

## Common Blockers

| Symptom | Fix |
|---------|-----|
| `wg genkey: command not found` | Use the Python `cryptography` fallback in Phase 0b |
| `installimage: command not found` | Use full path: `/root/.oldroot/nfs/install/installimage` |
| `scp: No such file or directory` on `/mnt/...` | installimage unmounts disk when done — don't try to inject cloud-init; use setup script on first boot instead |
| `cloud-init: command not found` on fresh node | Hetzner `installimage` base image has no cloud-init; use setup script approach |
| YAML invalid after peer block substitution | Peer lines must be indented 6 spaces to match the `content: \|` block — see Phase 1 Python script |
| `systemctl restart sshd` fails | Ubuntu 24.04 uses `ssh.service`, not `sshd.service` — use `systemctl restart ssh` |
| Root SSH blocked after setup | SSH hardening sets `PermitRootLogin no` — switch to `patrick@` for all subsequent commands |
| TLS cert error on kubeconfig after reset | Old context has stale CA — delete old context/cluster/user entries before merging new kubeconfig |
| `wg-mesh` not up after cloud-init | `journalctl -u wg-quick@wg-mesh` — check for malformed config or missing private key |
| k3s `NotReady`, Flannel errors | `wg-mesh` came up too slowly — confirm `ip addr show wg-mesh` exists, then restart k3s |
| Handshakes not forming | Public key mismatch — re-derive: `echo "<PRIVATE_KEY>" \| wg pubkey` and compare |
| `wg set` fails on existing peers | `sudo modprobe wireguard` if module not loaded |
| Node appears in cluster but pods `Pending` | wg-mesh peer missing for a home-LAN worker — add peer entry manually |
