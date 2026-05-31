---
title: dev.mentolder.de 3-node HA k3s Migration — Implementation Plan
ticket_id: T000372
domains: [website, infra, db, ops, test, security]
status: blocked
pr_number: 1244
---

# dev.mentolder.de 3-node HA k3s Migration — Implementation Plan

> [!WARNING]
> **Blocked:** dev1 and dev2 Proxmox hosts went offline mid-session (network loss, dev3 lost quorum). The cluster will recover when the network restores. Phase 7 (devc-1 + k3d decommission) and Phase 6.3 (live E2E verification) are pending cluster recovery.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-node k3d `dev.mentolder.de` cluster with a real 3-node HA k3s cluster (embedded etcd) across the existing VMs at 10.0.0.26/.27/.28, with Longhorn 3-replica storage, while keeping k3d available for laptop-local dev.

**Architecture:** Three k3s servers with embedded etcd, one VM per dev Proxmox node (dev1→.27, dev2→.28, dev3→.26). Flannel runs over the LAN (10.0.0.0/24, no WireGuard for pod traffic). 10.0.0.26 bootstraps with `--cluster-init`; .27/.28 join as servers. Built-in Traefik is the ingress; services are exposed on the node IP 10.0.0.26 via NodePort/klipper instead of k3d host-port mappings. Dev images move from `k3d image import` to ghcr.io push+pull (ghcr-pull-secret already exists).

**Tech Stack:** k3s (v1.32.13-k3s1, embedded etcd), Longhorn 1.7.2 (HelmChart CR), Traefik (built-in), Proxmox `qm`, cloud-init, bash, go-task, BATS, kustomize.

---

## Spec reference

`docs/superpowers/specs/2026-05-31-dev-k3s-multinode-design.md`

## Current verified state (do not re-discover)

| Proxmox node | VMID | VM | IP | RAM now | k8s now |
|---|---|---|---|---|---|
| dev3 (10.0.0.25) | 9002 | mentolder-dev | 10.0.0.26/24 | 6 GB | k3d single-node (server-0 + serverlb) |
| dev1 (10.0.0.9)  | 9003 | mentolder-dev-2 | 10.0.0.27/**8** | 6 GB | empty (Docker + dev tools) |
| dev2 (10.0.0.11) | 9004 | mentolder-dev-3 | 10.0.0.28/**8** | 6 GB | empty (Docker + dev tools) |

- SSH to Proxmox hosts: `ssh dev1|dev2|dev3` (root, shared `dev_rsa` key).
- SSH to VMs: `ssh -i environments/.secrets/.ssh/gekko_ed25519 gekko@10.0.0.26|.27|.28` (gekko has passwordless sudo).
- Target per VM: 4 vCPU / **8 GB** / **80 GB**, all `/24`.

## File structure (created / modified)

| File | Responsibility |
|---|---|
| `environments/mentolder.yaml` | **Modify** — retarget `DEV_NODE` off dead `k3s-1`; add k3s server/worker IP vars |
| `environments/schema.yaml` | **Modify** — register the new DEV_* vars |
| `environments/.secrets/.ssh/config` | **Modify** — add `dev-vm-2` (.27) / `dev-vm-3` (.28) aliases |
| `prod/cloud-init-dev-worker.yaml` | **Create** — reproducible worker-VM cloud-init (codifies the existing VMs) |
| `scripts/provision-dev-worker.sh` | **Create** — mirror of `provision-dev-vm.sh` for dev1/dev2 workers |
| `scripts/reconcile-dev-vms.sh` | **Create** — bump RAM→8G, disk→80G, netmask→/24 on the 3 existing VMs |
| `scripts/dev-k3s-bootstrap.sh` | **Create** — k3s HA bring-up (server --cluster-init + 2 joins + kubeconfig) |
| `Taskfile.dev-stack.yml` | **Modify** — new `dev:cluster:create` (k3s) + `dev:longhorn:install`; keep k3d path as `dev:cluster:create-local`; fix `db:refresh`/`tunnel`/`build:*` for k3s |
| `k3d/dev-stack/shared-db-dev.yaml` | **Modify** — refresh stale k3d comment (storageClass already `longhorn`) |
| `tests/unit/dev-k3s-bootstrap.bats` | **Create** — structure/guard tests for the new scripts + env drift |
| `CLAUDE.md` | **Modify** — rewrite the “dev.mentolder.de stack” gotchas section for k3s |

---

## Task 1: Retarget env config + add k3s cluster vars

**Files:**
- Modify: `environments/mentolder.yaml:59-70`
- Modify: `environments/schema.yaml`
- Test: `tests/unit/dev-k3s-bootstrap.bats`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dev-k3s-bootstrap.bats` with this first test:

```bash
#!/usr/bin/env bats

@test "mentolder.yaml DEV_NODE no longer points at dead k3s-1" {
  run grep -E '^\s*DEV_NODE:' environments/mentolder.yaml
  [ "$status" -eq 0 ]
  [[ "$output" != *"k3s-1"* ]]
}

@test "mentolder.yaml declares the 3 k3s dev node IPs" {
  grep -qE 'DEV_K3S_SERVER_IP:\s*"?10\.0\.0\.26' environments/mentolder.yaml
  grep -qE 'DEV_K3S_JOIN_IPS:\s*"?10\.0\.0\.27,10\.0\.0\.28' environments/mentolder.yaml
}
```

- [ ] **Step 2: Run it; verify it fails**

Run: `cd /tmp/wt-dev-k3s-multinode && bats tests/unit/dev-k3s-bootstrap.bats`
Expected: FAIL (DEV_NODE still `k3s-1`; new keys absent).

- [ ] **Step 3: Edit `environments/mentolder.yaml`**

Replace the dev block (currently lines ~59-70) with:

```yaml
  DEV_DOMAIN: "dev.mentolder.de"
  DEV_NODE: "dev-vm"                 # k3s server VM (10.0.0.26); was the dead k3s-1
  DEV_SSH_USER: "gekko"
  DEV_WEBSITE_HOST: "web.dev.mentolder.de"
  DEV_BRETT_HOST: "brett.dev.mentolder.de"
  # 3-node HA k3s dev cluster (one VM per dev Proxmox node).
  DEV_K3S_SERVER_IP: "10.0.0.26"     # mentolder-dev  (dev3) — --cluster-init
  DEV_K3S_JOIN_IPS: "10.0.0.27,10.0.0.28"  # mentolder-dev-2 (dev1), -dev-3 (dev2)
  DEV_K3S_VERSION: "v1.32.13-k3s1"   # pin matches the prior k3d K3S version
  # Comma-separated CIDRs allowed to reach :2222 (sish) on the dev node.
  DEV_SSH_ALLOWLIST: "217.195.151.153/32"
```

- [ ] **Step 4: Register the vars in `environments/schema.yaml`**

Find the section listing `DEV_DOMAIN`/`DEV_NODE` and add (matching the file's existing style):

```yaml
  - DEV_K3S_SERVER_IP
  - DEV_K3S_JOIN_IPS
  - DEV_K3S_VERSION
```

(If schema.yaml groups vars differently, add them alongside the other `DEV_*` entries. Run `task env:validate ENV=mentolder` to confirm format.)

- [ ] **Step 5: Run tests + env validate**

Run: `bats tests/unit/dev-k3s-bootstrap.bats && task env:validate ENV=mentolder`
Expected: both tests PASS; `env:validate` reports OK.

- [ ] **Step 6: Commit**

```bash
git add environments/mentolder.yaml environments/schema.yaml tests/unit/dev-k3s-bootstrap.bats
git commit -m "feat(dev): retarget DEV_NODE off dead k3s-1, add k3s cluster vars"
```

---

## Task 2: SSH aliases for the worker VMs

**Files:**
- Modify: `environments/.secrets/.ssh/config` (Dev VM section, after the `dev-vm` block)

> This is a gitignored sensitive file. Editing is explicitly in scope.

- [ ] **Step 1: Add the two worker aliases**

After the existing `Host dev-vm/gekko` block, insert:

```sshconfig
# Worker VMs of the 3-node dev k3s cluster.
Host dev-vm-2
    HostName 10.0.0.27
    User gekko
    IdentityFile ~/Bachelorprojekt/environments/.secrets/.ssh/gekko_ed25519
Host dev-vm-3
    HostName 10.0.0.28
    User gekko
    IdentityFile ~/Bachelorprojekt/environments/.secrets/.ssh/gekko_ed25519
```

Also add `dev-vm-2 dev-vm-3` to the `Host pk-hetzner-* ...` defaults match-line near the top so they inherit the shared known_hosts/keepalive defaults.

- [ ] **Step 2: Verify resolution + connectivity**

Run:
```bash
for h in dev-vm dev-vm-2 dev-vm-3; do printf "%s: " "$h"; ssh -o ConnectTimeout=6 -o BatchMode=yes "$h" hostname 2>&1 | grep -v Warning; done
```
Expected: `dev-vm: mentolder-dev`, `dev-vm-2: mentolder-dev-2`, `dev-vm-3: mentolder-dev-3`.

- [ ] **Step 3: No commit**

The SSH config is gitignored; nothing to commit. Update the `reference-ssh-access-bundle` memory at the end (Task 10).

---

## Task 3: Reproducible worker cloud-init

**Files:**
- Create: `prod/cloud-init-dev-worker.yaml`
- Test: `tests/unit/dev-k3s-bootstrap.bats`

This codifies the worker VMs for future rebuilds. It mirrors `cloud-init-dev-vm.yaml` but drops k3d-specific firewall comments, opens the k3s ports, and parameterizes hostname/IP via `provision-dev-worker.sh` placeholders.

- [ ] **Step 1: Add failing test**

Append to `tests/unit/dev-k3s-bootstrap.bats`:

```bash
@test "worker cloud-init exists, installs open-iscsi, opens k3s ports" {
  f=prod/cloud-init-dev-worker.yaml
  [ -f "$f" ]
  grep -q 'open-iscsi' "$f"
  grep -q '6443/tcp' "$f"      # k3s API / etcd reachability on LAN
  grep -q 'REPLACEME_HOSTNAME' "$f"
}
```

- [ ] **Step 2: Run; verify FAIL** — `bats tests/unit/dev-k3s-bootstrap.bats` → FAIL (file missing).

- [ ] **Step 3: Create `prod/cloud-init-dev-worker.yaml`**

```yaml
#cloud-config
# =============================================================================
# cloud-init-dev-worker.yaml — a worker VM of the 3-node dev k3s cluster.
# =============================================================================
# Rendered + uploaded by scripts/provision-dev-worker.sh, which substitutes
# REPLACEME_HOSTNAME, the WireGuard private key, and the peer block. These VMs
# are real k3s server+etcd nodes (NOT k3d). Toolchain installed via
# install-dev-tools.sh (FORCE=1) for parity (docker for local builds is optional
# on workers; kept for symmetry with the dev-vm image).
# =============================================================================

hostname: REPLACEME_HOSTNAME
manage_etc_hosts: true

users:
  - default
  - name: patrick
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    lock_passwd: true
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFN75CnuOz7YXaJipTFxWMVDgm35heu64JKN1QL+Z84+ patrick@korczewski.de
  - name: gekko
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    lock_passwd: true
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513

ssh_pwauth: false
package_update: true
package_upgrade: true

packages:
  - curl
  - wget
  - git
  - htop
  - jq
  - ca-certificates
  - gnupg
  - unattended-upgrades
  - fail2ban
  - ufw
  - wireguard-tools
  - open-iscsi
  - nfs-common

write_files:
  - path: /etc/wireguard/wg-mesh.conf
    permissions: '0600'
    owner: root:root
    content: |
      [Interface]
      PrivateKey = REPLACEME_WG_PRIVATE_KEY
      Address = REPLACEME_WG_ADDRESS
      ListenPort = 51821

      REPLACEME_WG_PEERS_BLOCK

  - path: /etc/sysctl.d/99-dev-k3s.conf
    content: |
      net.ipv4.ip_forward=1
      net.bridge.bridge-nf-call-iptables=1
      fs.inotify.max_user_watches=524288
      fs.inotify.max_user_instances=512
      vm.max_map_count=262144

  - path: /etc/fail2ban/jail.local
    content: |
      [sshd]
      enabled = true
      port = 22
      maxretry = 5
      bantime = 3600
      findtime = 600

  - path: /etc/ssh/sshd_config.d/hardened.conf
    content: |
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PermitRootLogin no
      AllowUsers patrick gekko

runcmd:
  - sysctl --system
  # ── Firewall: k3s server+etcd + Traefik on the trusted LAN ────────────────
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 51821/udp                         # WireGuard mesh
  - ufw allow from 10.0.0.0/24 to any port 6443 proto tcp comment "k3s API (LAN)"
  - ufw allow from 10.0.0.0/24 to any port 2379:2380 proto tcp comment "etcd (LAN)"
  - ufw allow from 10.0.0.0/24 to any port 10250 proto tcp comment "kubelet (LAN)"
  - ufw allow from 10.0.0.0/24 to any port 8472 proto udp comment "flannel vxlan (LAN)"
  - ufw allow 80/tcp comment "Traefik web"
  - ufw allow from 10.0.0.0/24 to any port 30000 proto tcp comment "dev Postgres NodePort (LAN)"
  - ufw --force enable
  # ── Services ──────────────────────────────────────────────────────────────
  - systemctl enable fail2ban && systemctl start fail2ban
  - systemctl restart ssh
  - systemctl enable unattended-upgrades && systemctl start unattended-upgrades
  - systemctl enable --now iscsid
  - systemctl enable wg-quick@wg-mesh
  - systemctl start wg-quick@wg-mesh || true
  - curl -fsSL https://raw.githubusercontent.com/Paddione/Bachelorprojekt/main/scripts/install-dev-tools.sh -o /usr/local/sbin/install-dev-tools.sh
  - chmod +x /usr/local/sbin/install-dev-tools.sh
  - FORCE=1 DEV_USER=gekko /usr/local/sbin/install-dev-tools.sh

final_message: "dev k3s worker (REPLACEME_HOSTNAME) ready - $(hostname) - $(date)."
```

- [ ] **Step 4: Run test; verify PASS** — `bats tests/unit/dev-k3s-bootstrap.bats` → the worker-cloud-init test PASSES.

- [ ] **Step 5: Commit**

```bash
git add prod/cloud-init-dev-worker.yaml tests/unit/dev-k3s-bootstrap.bats
git commit -m "feat(dev): reproducible cloud-init for dev k3s worker VMs"
```

---

## Task 4: `provision-dev-worker.sh`

**Files:**
- Create: `scripts/provision-dev-worker.sh`
- Test: `tests/unit/dev-k3s-bootstrap.bats`

Mirrors `scripts/provision-dev-vm.sh` but takes a `WORKER` selector (`2` or `3`) mapping to the right Proxmox node / VMID / IP / wg-IP, and uses the worker cloud-init. Used to rebuild a worker from scratch (the live VMs already exist; this is for reproducibility / disaster recovery).

- [ ] **Step 1: Add failing test**

Append:

```bash
@test "provision-dev-worker.sh has a FORCE guard and worker map" {
  f=scripts/provision-dev-worker.sh
  [ -f "$f" ]
  run bash -n "$f"; [ "$status" -eq 0 ]      # syntax OK
  grep -q 'FORCE' "$f"
  grep -q '9003' "$f"     # dev1 worker VMID
  grep -q '9004' "$f"     # dev2 worker VMID
}
```

- [ ] **Step 2: Run; verify FAIL.**

- [ ] **Step 3: Create `scripts/provision-dev-worker.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# provision-dev-worker.sh — (re)create a dev k3s worker VM on dev1 or dev2.
# =============================================================================
# Usage:  WORKER=2 bash scripts/provision-dev-worker.sh      # mentolder-dev-2 (dev1)
#         WORKER=3 bash scripts/provision-dev-worker.sh      # mentolder-dev-3 (dev2)
# The live VMs already exist; pass FORCE=1 to destroy + recreate. Idempotent
# otherwise (refuses to clobber an existing VMID). Mirrors provision-dev-vm.sh.
# =============================================================================
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_CONFIG="${SSH_CONFIG:-$REPO_ROOT/environments/.secrets/.ssh/config}"
CLOUD_INIT_SRC="${CLOUD_INIT_SRC:-$REPO_ROOT/prod/cloud-init-dev-worker.yaml}"
WG_SECRETS_DIR="${WG_SECRETS_DIR:-$REPO_ROOT/environments/.secrets/wireguard}"

WORKER="${WORKER:?set WORKER=2 (dev1) or WORKER=3 (dev2)}"
case "$WORKER" in
  2) PVE_HOST=dev1; VMID=9003; VM_NAME=mentolder-dev-2; VM_IP=10.0.0.27; WG_IP=192.168.100.24 ;;
  3) PVE_HOST=dev2; VMID=9004; VM_NAME=mentolder-dev-3; VM_IP=10.0.0.28; WG_IP=192.168.100.25 ;;
  *) echo "WORKER must be 2 or 3" >&2; exit 2 ;;
esac
VM_CIDR=24; VM_GW=10.0.0.1; VM_DNS="1.1.1.1 9.9.9.9"
CORES="${CORES:-4}"; MEM_MB="${MEM_MB:-8192}"; DISK_SIZE="${DISK_SIZE:-80G}"
BRIDGE="${BRIDGE:-vmbr0}"; STORAGE="${STORAGE:-local-lvm}"
SNIPPET_STORAGE="${SNIPPET_STORAGE:-local}"; SNIPPET_NAME="dev-worker-${WORKER}-user.yaml"
IMAGE_URL="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
IMAGE_FILE="debian-12-genericcloud-amd64.qcow2"; IMAGE_CACHE="/var/lib/vz/template/iso"
WG_HUB_ENDPOINT="${WG_HUB_ENDPOINT:-178.104.169.206:51821}"
WG_HUB_PUBKEY="${WG_HUB_PUBKEY:-iXnGP9bIwrofD6a96D5Fz5rM7smbIAc3gXJcUx5m6j0=}"
WG_ALLOWED_IPS="${WG_ALLOWED_IPS:-192.168.100.0/24}"
FORCE="${FORCE:-0}"

ssh_pve() { ssh -F "$SSH_CONFIG" "$PVE_HOST" "bash -lc \"\$(cat)\"" <<<"$*"; }
log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v wg >/dev/null || die "wireguard-tools (wg) not installed locally."
[[ -f "$CLOUD_INIT_SRC" ]] || die "cloud-init template not found: $CLOUD_INIT_SRC"
ssh_pve 'command -v qm >/dev/null' || die "cannot reach $PVE_HOST or 'qm' missing."
log "Target: $PVE_HOST VMID=$VMID name=$VM_NAME ip=$VM_IP/$VM_CIDR wg=$WG_IP"

mkdir -p "$WG_SECRETS_DIR"; chmod 700 "$WG_SECRETS_DIR"
WG_KEY="$WG_SECRETS_DIR/${VM_NAME}.key"; WG_PUB="$WG_SECRETS_DIR/${VM_NAME}.pub"
if [[ ! -s "$WG_KEY" ]]; then (umask 077; wg genkey > "$WG_KEY"); wg pubkey < "$WG_KEY" > "$WG_PUB"; fi
chmod 600 "$WG_KEY"; WG_PRIVKEY="$(cat "$WG_KEY")"
log "$VM_NAME wg pubkey: $(cat "$WG_PUB")  → add to wireguard/wg-mesh-nodes.yaml + hub peer."

PEERS_BLOCK="[Peer]
PublicKey = $WG_HUB_PUBKEY
Endpoint = $WG_HUB_ENDPOINT
AllowedIPs = $WG_ALLOWED_IPS
PersistentKeepalive = 25"

RENDERED="$(mktemp)"; trap 'rm -f "$RENDERED"' EXIT
python3 - "$CLOUD_INIT_SRC" "$WG_PRIVKEY" "$PEERS_BLOCK" "$VM_NAME" "$WG_IP" > "$RENDERED" <<'PY'
import sys
src, privkey, peers, hostname, wg_ip = sys.argv[1:6]
t = open(src).read()
t = t.replace("REPLACEME_WG_PRIVATE_KEY", privkey)
t = t.replace("REPLACEME_HOSTNAME", hostname)
t = t.replace("REPLACEME_WG_ADDRESS", wg_ip + "/24")
peers_indented = "\n".join(("      " + l if l else l) for l in peers.splitlines())
t = t.replace("      REPLACEME_WG_PEERS_BLOCK", peers_indented)
sys.stdout.write(t)
PY

log "Uploading cloud-init snippet → $PVE_HOST:/var/lib/vz/snippets/$SNIPPET_NAME"
ssh_pve 'mkdir -p /var/lib/vz/snippets'
scp -F "$SSH_CONFIG" "$RENDERED" "$PVE_HOST:/var/lib/vz/snippets/$SNIPPET_NAME" >/dev/null
ssh_pve "chmod 600 /var/lib/vz/snippets/$SNIPPET_NAME"

ssh_pve "$(cat <<REMOTE
set -euo pipefail
if qm status $VMID &>/dev/null; then
  if [[ "$FORCE" == "1" ]]; then
    echo ">> VM $VMID exists; FORCE=1 → stop + destroy"; qm stop $VMID || true; qm destroy $VMID --purge
  else
    echo "ERROR: VM $VMID exists. Re-run with FORCE=1 to recreate." >&2; exit 1
  fi
fi
mkdir -p "$IMAGE_CACHE"
[[ -s "$IMAGE_CACHE/$IMAGE_FILE" ]] || curl -fSL "$IMAGE_URL" -o "$IMAGE_CACHE/$IMAGE_FILE"
qm create $VMID --name $VM_NAME --memory $MEM_MB --cores $CORES --cpu host \
  --net0 virtio,bridge=$BRIDGE --scsihw virtio-scsi-single --ostype l26 --agent enabled=1
qm importdisk $VMID "$IMAGE_CACHE/$IMAGE_FILE" $STORAGE
qm set $VMID --scsi0 $STORAGE:vm-$VMID-disk-0
qm set $VMID --ide2 $STORAGE:cloudinit
qm set $VMID --boot order=scsi0
qm set $VMID --serial0 socket --vga serial0
qm set $VMID --ipconfig0 ip=$VM_IP/$VM_CIDR,gw=$VM_GW
qm set $VMID --nameserver "$VM_DNS"
qm set $VMID --cicustom "user=$SNIPPET_STORAGE:snippets/$SNIPPET_NAME"
qm disk resize $VMID scsi0 $DISK_SIZE
qm start $VMID
echo ">> VM $VMID started; cloud-init runs on first boot."
REMOTE
)"
log "Done. $VM_NAME booting at $VM_IP (alias dev-vm-$WORKER). Next: scripts/dev-k3s-bootstrap.sh"
```

- [ ] **Step 4: Run test; verify PASS** — `bats tests/unit/dev-k3s-bootstrap.bats`.

- [ ] **Step 5: Commit**

```bash
git add scripts/provision-dev-worker.sh tests/unit/dev-k3s-bootstrap.bats
git commit -m "feat(dev): provision-dev-worker.sh for dev k3s worker VMs"
```

---

## Task 5: VM reconcile script (live VMs → target spec)

**Files:**
- Create: `scripts/reconcile-dev-vms.sh`
- Test: `tests/unit/dev-k3s-bootstrap.bats`

The three VMs already run; this brings them to spec without recreating: memory 6→8 GB, disk → 80 GB, worker netmask `/8`→`/24`. Disk + netmask changes require a guest-side `growpart`/`resize2fs` and a reboot — the script performs them and prints what it changed.

- [ ] **Step 1: Add failing test**

Append:

```bash
@test "reconcile-dev-vms.sh targets all 3 VMIDs and sets 8192/80G" {
  f=scripts/reconcile-dev-vms.sh
  [ -f "$f" ]
  run bash -n "$f"; [ "$status" -eq 0 ]
  grep -q '8192' "$f"
  grep -q '80G' "$f"
  for id in 9002 9003 9004; do grep -q "$id" "$f"; done
}
```

- [ ] **Step 2: Run; verify FAIL.**

- [ ] **Step 3: Create `scripts/reconcile-dev-vms.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# reconcile-dev-vms.sh — bring the 3 existing dev VMs to the k3s target spec.
# =============================================================================
# memory → 8192 MB, disk → 80G, netmask → /24 (workers were created /8).
# Each VM is rebooted to apply memory + grown disk + netplan. Run BEFORE
# dev-k3s-bootstrap.sh. Idempotent: skips changes already in place.
# =============================================================================
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_CONFIG="${SSH_CONFIG:-$REPO_ROOT/environments/.secrets/.ssh/config}"
MEM_MB=8192; DISK=80G

# node-alias  VMID  VM-IP
MAP=(
  "dev3 9002 10.0.0.26"
  "dev1 9003 10.0.0.27"
  "dev2 9004 10.0.0.28"
)
log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

for row in "${MAP[@]}"; do
  read -r NODE VMID IP <<<"$row"
  log "[$NODE] VM $VMID ($IP): set memory=$MEM_MB, resize scsi0→$DISK, ipconfig0 /24"
  ssh -F "$SSH_CONFIG" "$NODE" "bash -lc '
    set -e
    qm set $VMID --memory $MEM_MB
    qm set $VMID --ipconfig0 ip=$IP/24,gw=10.0.0.1
    # grow disk (no-op if already >=80G)
    qm disk resize $VMID scsi0 $DISK 2>&1 | grep -v \"cannot shrink\" || true
    qm reboot $VMID || qm start $VMID
  '"
done

log "VMs rebooting. Wait ~60s, then grow the in-guest filesystem on each:"
for ip in 10.0.0.26 10.0.0.27 10.0.0.28; do
  log "  ssh dev-vm@$ip → sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1"
done
log "After reboot verify: kubectl-free — 'ssh <vm> free -g' shows ~8G, 'df -h /' ~80G, 'ip -br a' shows /24."
```

> Note: the guest disk device may be `/dev/sda` (virtio-scsi) — confirm with `lsblk` per VM; the script prints the growpart commands rather than guessing destructively.

- [ ] **Step 4: Run test; verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add scripts/reconcile-dev-vms.sh tests/unit/dev-k3s-bootstrap.bats
git commit -m "feat(dev): reconcile-dev-vms.sh to bring dev VMs to k3s spec"
```

---

## Task 6: k3s HA bootstrap script

**Files:**
- Create: `scripts/dev-k3s-bootstrap.sh`
- Test: `tests/unit/dev-k3s-bootstrap.bats`

Installs k3s server `--cluster-init` on the server VM, joins the two workers as servers, fetches + rewrites + merges the kubeconfig (context `mentolder-dev`). Deletes any pre-existing k3d cluster on the server first so ports/containerd are free.

- [ ] **Step 1: Add failing test**

Append:

```bash
@test "dev-k3s-bootstrap.sh uses cluster-init, node-ip, and merges kubeconfig" {
  f=scripts/dev-k3s-bootstrap.sh
  [ -f "$f" ]
  run bash -n "$f"; [ "$status" -eq 0 ]
  grep -q -- '--cluster-init' "$f"
  grep -q -- '--node-ip' "$f"
  grep -q 'get.k3s.io' "$f"
  grep -q 'k3d cluster delete' "$f"     # free the server VM from k3d first
  grep -q 'mentolder-dev' "$f"          # kube context name
}
```

- [ ] **Step 2: Run; verify FAIL.**

- [ ] **Step 3: Create `scripts/dev-k3s-bootstrap.sh`**

```bash
#!/usr/bin/env bash
# =============================================================================
# dev-k3s-bootstrap.sh — bring up the 3-node HA k3s dev cluster.
# =============================================================================
# Server (10.0.0.26) runs `k3s server --cluster-init`; 10.0.0.27/.28 join as
# servers (embedded etcd). Flannel over the LAN (--node-ip on 10.0.0.0/24).
# Built-in Traefik kept. Fetches kubeconfig → context `mentolder-dev`.
# Requires the SSH aliases dev-vm / dev-vm-2 / dev-vm-3 (Task 2).
# =============================================================================
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source scripts/env-resolve.sh "${ENV:-mentolder}"

K3S_VERSION="${DEV_K3S_VERSION:-v1.32.13-k3s1}"
SERVER_IP="${DEV_K3S_SERVER_IP:-10.0.0.26}"
IFS=',' read -ra JOINS <<<"${DEV_K3S_JOIN_IPS:-10.0.0.27,10.0.0.28}"
SERVER_ALIAS="dev-vm"
declare -A ALIAS=( [10.0.0.27]=dev-vm-2 [10.0.0.28]=dev-vm-3 )
CTX="mentolder-dev"
EXTRA="--disable=metrics-server --node-ip=__IP__ --tls-san=${SERVER_IP} --tls-san=dev.mentolder.de"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
rsh() { ssh -o BatchMode=yes "$1" "sudo bash -lc \"\$(cat)\"" <<<"$2"; }

# 0. free the server VM from the old k3d cluster (containerd/ports)
log "Deleting any pre-existing k3d cluster on $SERVER_ALIAS"
ssh -o BatchMode=yes "$SERVER_ALIAS" 'k3d cluster delete mentolder-dev 2>/dev/null || true'

# 1. bootstrap server (embedded etcd)
log "Installing k3s server --cluster-init on $SERVER_IP ($K3S_VERSION)"
rsh "$SERVER_ALIAS" "
  curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION='$K3S_VERSION' \
    INSTALL_K3S_EXEC='server --cluster-init ${EXTRA/__IP__/$SERVER_IP}' sh -
  until kubectl get nodes >/dev/null 2>&1; do sleep 3; done
"
TOKEN="$(ssh -o BatchMode=yes "$SERVER_ALIAS" 'sudo cat /var/lib/rancher/k3s/server/node-token')"
[[ -n "$TOKEN" ]] || { echo 'failed to read node-token' >&2; exit 1; }

# 2. join the workers as servers
for ip in "${JOINS[@]}"; do
  a="${ALIAS[$ip]}"
  log "Joining $a ($ip) as HA server"
  rsh "$a" "
    curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION='$K3S_VERSION' K3S_TOKEN='$TOKEN' \
      INSTALL_K3S_EXEC='server --server https://${SERVER_IP}:6443 ${EXTRA/__IP__/$ip}' sh -
  "
done

# 3. fetch + merge kubeconfig
log "Merging kubeconfig as context $CTX"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
ssh -o BatchMode=yes "$SERVER_ALIAS" 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed "s#https://127.0.0.1:6443#https://${SERVER_IP}:6443#; s#: default#: ${CTX}#g; s#name: default#name: ${CTX}#g; s#cluster: default#cluster: ${CTX}#g" \
  > "$TMP"
KUBECONFIG="$HOME/.kube/config:$TMP" kubectl config view --flatten > "$HOME/.kube/config.new"
mv "$HOME/.kube/config.new" "$HOME/.kube/config"
kubectl --context "$CTX" get nodes -o wide
log "Done. 3 servers should be Ready. Next: task dev:longhorn:install ENV=$ENV"
```

> The `sed` context rename is intentionally explicit; if k3s emits a different default name, adjust the substitution. Verify with `kubectl config get-contexts`.

- [ ] **Step 4: Run test; verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-k3s-bootstrap.sh tests/unit/dev-k3s-bootstrap.bats
git commit -m "feat(dev): k3s HA bootstrap script (server --cluster-init + 2 joins)"
```

---

## Task 7: Taskfile — k3s cluster tasks + Longhorn + keep k3d-local

**Files:**
- Modify: `Taskfile.dev-stack.yml:28-100` (cluster tasks) and `:163-206` (build), `:290-301` (tunnel)

- [ ] **Step 1: Replace `cluster:create` with the k3s path; preserve k3d as `cluster:create-local`**

Rename the existing k3d `cluster:create` body to a new task `cluster:create-local` (unchanged — for laptop dev), and make `cluster:create` call the bootstrap script:

```yaml
  cluster:create:
    desc: "[dev] Bring up the 3-node HA k3s dev cluster (server .26 + workers .27/.28)"
    deps: [_node-guard]
    cmds:
      - bash scripts/dev-k3s-bootstrap.sh

  cluster:create-local:
    desc: "[dev] LAPTOP-ONLY: single-node k3d cluster for local iteration"
    cmds:
      - |
        set -euo pipefail
        source scripts/env-resolve.sh "{{.ENV}}"
        k3d cluster create {{.CLUSTER_NAME}} \
          --servers 1 --agents 0 \
          --port '127.0.0.1:18080:80@loadbalancer' \
          --port '0.0.0.0:2222:2222@loadbalancer' \
          --port '127.0.0.1:15432:30000@loadbalancer' \
          --k3s-arg '--disable=metrics-server@server:*' \
          --wait
        k3d kubeconfig merge {{.CLUSTER_NAME}} --kubeconfig-merge-default
```

Update `CTX_DEV` default: change `k3d-mentolder-dev` → `mentolder-dev` (the k3s context name). The laptop k3d path produces `k3d-mentolder-dev`; document that `cluster:create-local` users must pass `CTX_DEV=k3d-mentolder-dev`.

- [ ] **Step 2: Add `longhorn:install`**

```yaml
  longhorn:install:
    desc: "[dev] Install Longhorn (3-replica) on the dev k3s cluster"
    cmds:
      - kubectl --context {{.CTX_DEV}} apply -f k3d/dev-cluster/longhorn-helmchart.yaml
      - |
        echo "waiting for longhorn storageclass..."
        for i in $(seq 1 60); do
          kubectl --context {{.CTX_DEV}} get storageclass longhorn >/dev/null 2>&1 && break
          sleep 5
        done
        kubectl --context {{.CTX_DEV}} get storageclass longhorn
        kubectl --context {{.CTX_DEV}} -n longhorn-system get nodes.longhorn.io
```

- [ ] **Step 3: Fix `cluster:delete` for k3s**

```yaml
  cluster:delete:
    desc: "[dev] Uninstall k3s from all 3 dev VMs (data lost — refresh with dev:db:refresh)"
    cmds:
      - |
        for a in dev-vm dev-vm-2 dev-vm-3; do
          ssh -o BatchMode=yes "$a" 'sudo /usr/local/bin/k3s-uninstall.sh 2>/dev/null || sudo /usr/local/bin/k3s-agent-uninstall.sh 2>/dev/null || true'
        done
```

- [ ] **Step 4: Fix `db:refresh` host target**

Change line ~288 from `PGHOST=127.0.0.1 PGPORT=15432` to the k3s NodePort on the server IP:

```bash
        BACKUP_DIR="$TMP/backups" PGHOST="${DEV_K3S_SERVER_IP:-10.0.0.26}" PGPORT=30000 bash scripts/dev-db-refresh.sh
```

(The workstation reaches `10.0.0.26:30000` directly on the LAN. From off-LAN, run via `ssh -L 30000:10.0.0.26:30000 dev-vm` first.)

- [ ] **Step 5: Fix `tunnel` to use the sish NodePort on the node IP**

Change line ~301:

```bash
        ssh -p 2222 -R "$NAME:80:localhost:$PORT" tunnel@"${DEV_K3S_SERVER_IP:-10.0.0.26}"
```

(sish listens on NodePort 32222 → but the published `:2222` LAN access needs a firewall allow on 2222 mapped to the sish NodePort. Simpler: expose sish ssh via a NodePort and reach `10.0.0.26:32222`. Update the command to `-p 32222 ... @10.0.0.26` and update `firewall:open` to open 32222.)

- [ ] **Step 6: Convert `build:website` / `build:brett` to ghcr push (no k3d import)**

Replace the import branch in both tasks with a push, since k3s pulls via the existing `ghcr-pull-secret`:

```bash
        # k3s (multi-node): push to ghcr.io; nodes pull via ghcr-pull-secret.
        docker push ghcr.io/paddione/workspace-website:dev
```

(Drop the `docker save` / `k3d image import` / `scp` block. The `:dev` tag + `imagePullPolicy: Always` in the dev manifests ensures the rollout pulls the fresh image. Verify the dev website/brett Deployments set `imagePullPolicy: Always` and reference `ghcr-pull-secret` as an `imagePullSecret`; add them in Task 8 if missing.)

- [ ] **Step 7: Validate Taskfile parses**

Run: `task --list >/dev/null && task dev:cluster:create --summary 2>/dev/null | head`
Expected: no parse error; `dev:cluster:create` and `dev:cluster:create-local` both listed.

- [ ] **Step 8: Commit**

```bash
git add Taskfile.dev-stack.yml
git commit -m "feat(dev): k3s cluster tasks, longhorn install, ghcr push, node-IP exposure"
```

---

## Task 8: Dev manifests — pull policy + storageClass comment

**Files:**
- Modify: `k3d/dev-stack/website-dev.yaml`, `k3d/dev-stack/brett-dev.yaml` (imagePullPolicy + secret, if missing)
- Modify: `k3d/dev-stack/shared-db-dev.yaml:1-7` (stale comment)

- [ ] **Step 1: Ensure website/brett pull from ghcr on k3s**

Read both files. For each Deployment, ensure the pod spec has:

```yaml
      imagePullSecrets:
        - name: ghcr-pull-secret
      containers:
        - name: <name>
          image: ghcr.io/paddione/workspace-website:dev   # or workspace-brett:dev
          imagePullPolicy: Always
```

Add only what's missing (don't duplicate). These were unnecessary under k3d local-import but are required on real k3s.

- [ ] **Step 2: Refresh the stale k3d comment in `shared-db-dev.yaml`**

Replace lines 1-7 header comment:

```yaml
# ════════════════════════════════════════════════════════════════════
# shared-db-dev — Postgres 16 inside the dev k3s cluster.
# Credential set is DISTINCT from prod's shared-db so a leak here cannot
# unlock prod. NodePort 30000 is reachable on the dev node IP 10.0.0.26
# (LAN) and the dev-vm wg-mesh IP. The prod-side dev-db-refresh CronJob
# pg_restores the latest prod backup into here nightly at 03:30 UTC.
# storageClassName: longhorn — now real (Longhorn installed on this 3-node
# cluster; was a dangling reference under single-node k3d).
# ════════════════════════════════════════════════════════════════════
```

- [ ] **Step 3: Validate kustomize build**

Run: `kubectl kustomize k3d/dev-stack/ >/dev/null && echo OK`
Expected: `OK` (no build error).

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/website-dev.yaml k3d/dev-stack/brett-dev.yaml k3d/dev-stack/shared-db-dev.yaml
git commit -m "fix(dev): ghcr pull policy + storageClass comment for k3s dev cluster"
```

---

## Task 9: Live bring-up + verification (operational)

This task runs the new tooling against the real VMs. No commits; it produces the running cluster and the evidence that the design works. Do these on the operator workstation (LAN access to 10.0.0.0/24 required).

- [ ] **Step 1: Reconcile the VMs to spec**

Run: `bash scripts/reconcile-dev-vms.sh`
Then, per VM, grow the guest FS (device per `lsblk`):
```bash
for v in dev-vm dev-vm-2 dev-vm-3; do ssh "$v" 'sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1'; done
```
Expected: `ssh dev-vm free -g` shows ~8G; `df -h /` ~80G; `ip -br a` shows `/24` on all three.

- [ ] **Step 2: Bootstrap k3s**

Run: `task dev:cluster:create ENV=mentolder`
Expected: `kubectl --context mentolder-dev get nodes -o wide` → 3 nodes `Ready`, roles `control-plane,etcd,master`, INTERNAL-IP 10.0.0.26/.27/.28.

- [ ] **Step 3: Verify etcd quorum**

Run: `ssh dev-vm 'sudo k3s kubectl get --raw=/readyz?verbose' | tail -5`
Expected: `readyz check passed`; `kubectl get nodes` stays Ready if one VM is rebooted (optional resilience check).

- [ ] **Step 4: Install Longhorn**

Run: `task dev:longhorn:install ENV=mentolder`
Expected: `storageclass longhorn` exists; `kubectl -n longhorn-system get nodes.longhorn.io` shows 3 schedulable nodes.

- [ ] **Step 5: Materialise secrets + deploy the dev-stack**

Run:
```bash
task dev:_materialise-secrets ENV=mentolder      # via dev:apply dep, or directly
task dev:deploy ENV=mentolder                    # builds+pushes images, applies overlay
```
Expected: `kubectl --context mentolder-dev -n workspace-dev get pods` all `Running`; `shared-db-dev-data` PVC `Bound` on `longhorn` with 3 healthy replicas (`kubectl -n longhorn-system get volumes.longhorn.io`).

- [ ] **Step 6: Verify ingress + DB reachability**

```bash
curl -sI -H 'Host: web.dev.mentolder.de' http://10.0.0.26/ | head -1   # expect 200/3xx
PGPASSWORD=<DEV_SHARED_DB_PASSWORD> psql -h 10.0.0.26 -p 30000 -U postgres -c 'select 1'
```
Expected: HTTP status line from the website; `?column? = 1` from Postgres.

- [ ] **Step 7: Verify the prod→dev DB refresh path still works**

Run: `task dev:db:refresh ENV=mentolder`
Expected: completes; `website` DB present in shared-db-dev. (This confirms the NodePort-on-node-IP path replaces the old k3d loopback mapping.)

- [ ] **Step 8: Confirm cross-node scheduling**

Run: `kubectl --context mentolder-dev -n workspace-dev get pods -o wide`
Expected: pods distributed across more than one of 10.0.0.26/.27/.28 (proves dev1/dev2 contribute compute).

---

## Task 10: Docs + memory updates

**Files:**
- Modify: `CLAUDE.md` (the “### dev.mentolder.de stack” section)
- Update memories (outside the repo): `reference_devcluster_access`, `reference_ssh_access_bundle`, `project_k3s1_nvme_fault`

- [ ] **Step 1: Rewrite the CLAUDE.md dev-stack gotchas**

Replace the bullets that describe the single-node k3d-on-k3s-1 stack with the k3s reality: 3-node HA k3s on VMs 10.0.0.26/.27/.28 (one per dev Proxmox node), context `mentolder-dev`, Longhorn 3-replica, services on node IP 10.0.0.26 (Traefik :80, Postgres NodePort 30000, sish NodePort 32222), `task dev:cluster:create` = k3s bring-up / `dev:cluster:create-local` = laptop k3d, images via ghcr push+pull, dev-db-refresh via 10.0.0.26:30000. Keep the “dev sees prod data / erased nightly” warning.

- [ ] **Step 2: Validate offline test suite**

Run: `task test:all`
Expected: green (BATS incl. the new `dev-k3s-bootstrap.bats`, kustomize structure, Taskfile dry-run). Regenerate test inventory if prompted: `task test:inventory` and commit the JSON.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md website/src/data/test-inventory.json
git commit -m "docs(dev): describe 3-node HA k3s dev cluster (replaces k3d single-node)"
```

- [ ] **Step 4: Update memories**

Update `reference_devcluster_access` (k3d→k3s, context `mentolder-dev`, 3 VMs), `reference_ssh_access_bundle` (add dev-vm-2/.27, dev-vm-3/.28), and append a note to `project_k3s1_nvme_fault` that the dev stack is now multi-node k3s on dev1/2/3.

---

## Self-review notes

- **Spec coverage:** topology (T6), reuse .26 + add .27/.28 (T5/T6), flannel-over-LAN via `--node-ip` (T6), Longhorn 3-replica + storageClass fix (T7/T8), exposure rework 18080/2222/15432 → node-IP NodePorts (T7/T8), dev:* task updates (T7), k3d kept for laptop (T7 `cluster:create-local`), preserve prod→dev DB refresh (T7 step4 + T9 step7), VM sizing 8G/80G (T5), provisioning reproducibility (T3/T4), docs/memory (T10). All spec sections map to a task.
- **Known open item (from spec):** no control-plane VIP — joins/kubeconfig pin `10.0.0.26:6443`. Documented, intentionally out of scope.
- **Risk to watch during execution:** (a) guest disk device name (`/dev/sda` vs `/dev/vda`) — confirm with `lsblk` before `growpart` (T5/T9). (b) flannel must bind the LAN iface not wg — `--node-ip=10.0.0.2x` handles this; if pods on different nodes can't reach each other, add `--flannel-iface=<lan-if>` to `EXTRA` in `dev-k3s-bootstrap.sh`. (c) sish LAN port: standardize on NodePort 32222 (T7 step5) and open it in `firewall:open`.
