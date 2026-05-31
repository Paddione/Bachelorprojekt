#!/usr/bin/env bash
# =============================================================================
# provision-dev-vm.sh — create the new dev VM on the `dev` Proxmox node.
# =============================================================================
# Successor to the dead k3s-1 VM. Creates a Debian 12 cloud-init VM on the
# standalone Proxmox host `dev` (10.0.0.25), pre-installs the dev toolchain
# (Docker CE, k3d, kubectl, go-task, Node 22, pnpm, gh — via install-dev-tools.sh),
# installs WireGuard, and enrolls users patrick + gekko with their pubkeys.
#
# After it finishes, bring up the dev k3d cluster with:
#   task dev:cluster:create \
#     SSH_TARGET=gekko@dev-vm \
#     SSH_KEY=~/Bachelorprojekt/environments/.secrets/.ssh/gekko_ed25519
#
# Idempotent: re-running skips the image download and refuses to clobber an
# existing VMID (pass FORCE=1 to destroy + recreate).
#
# All tunables are env-overridable; defaults match the SSH config + wg registry.
# =============================================================================
set -euo pipefail

# ---- repo paths -------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_CONFIG="${SSH_CONFIG:-$REPO_ROOT/environments/.secrets/.ssh/config}"
CLOUD_INIT_SRC="${CLOUD_INIT_SRC:-$REPO_ROOT/prod/cloud-init-dev-vm.yaml}"
WG_SECRETS_DIR="${WG_SECRETS_DIR:-$REPO_ROOT/environments/.secrets/wireguard}"

# ---- Proxmox / VM parameters ------------------------------------------------
PVE_HOST="${PVE_HOST:-dev}"                 # ssh alias of the Proxmox node (root@10.0.0.25)
VMID="${VMID:-9002}"                        # old k3s-1 was 9001
VM_NAME="${VM_NAME:-mentolder-dev}"         # must match install-dev-tools.sh guard list
VM_IP="${VM_IP:-10.0.0.26}"                 # static LAN IP (matches `dev-vm` SSH alias)
VM_CIDR="${VM_CIDR:-24}"
VM_GW="${VM_GW:-10.0.0.1}"
VM_DNS="${VM_DNS:-1.1.1.1 9.9.9.9}"
WG_IP="${WG_IP:-192.168.100.23}"            # matches wireguard/wg-mesh-nodes.yaml (dev-vm)

CORES="${CORES:-4}"
MEM_MB="${MEM_MB:-8192}"
DISK_SIZE="${DISK_SIZE:-60G}"
BRIDGE="${BRIDGE:-vmbr0}"
STORAGE="${STORAGE:-local-lvm}"             # where the VM disk lives
SNIPPET_STORAGE="${SNIPPET_STORAGE:-local}" # storage with the 'snippets' content type
SNIPPET_NAME="${SNIPPET_NAME:-dev-vm-user.yaml}"

IMAGE_URL="${IMAGE_URL:-https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2}"
IMAGE_FILE="${IMAGE_FILE:-debian-12-genericcloud-amd64.qcow2}"
IMAGE_CACHE="${IMAGE_CACHE:-/var/lib/vz/template/iso}"

# wg hub: the dev VM is a home-LAN node on the mentolder mesh (192.168.100.0/24,
# port 51821). Like k3s-1/devc-*, it initiates outbound to a Hetzner CP node and
# routes the whole mesh through it. gekko-hetzner-2's pubkey is published in the
# registry, so this connects out-of-the-box (override to pin a different node).
WG_HUB_ENDPOINT="${WG_HUB_ENDPOINT:-178.104.169.206:51821}"   # gekko-hetzner-2
WG_HUB_PUBKEY="${WG_HUB_PUBKEY:-iXnGP9bIwrofD6a96D5Fz5rM7smbIAc3gXJcUx5m6j0=}"
WG_ALLOWED_IPS="${WG_ALLOWED_IPS:-192.168.100.0/24}"

FORCE="${FORCE:-0}"

# Remote exec on the Proxmox node. Force a login shell so /usr/sbin (qm, pvesm,
# lvextend, ...) is on PATH — non-login ssh sessions on Proxmox omit it.
ssh_pve() { ssh -F "$SSH_CONFIG" "$PVE_HOST" "bash -lc \"\$(cat)\"" <<<"$*"; }

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- 0. sanity --------------------------------------------------------------
command -v wg >/dev/null || die "wireguard-tools (wg) not installed locally — needed to generate the VM keypair."
[[ -f "$CLOUD_INIT_SRC" ]] || die "cloud-init template not found: $CLOUD_INIT_SRC"
log "Target Proxmox node: $PVE_HOST  |  VMID=$VMID  name=$VM_NAME  ip=$VM_IP/$VM_CIDR  wg=$WG_IP"
ssh_pve 'command -v qm >/dev/null' || die "cannot reach $PVE_HOST or 'qm' missing — check $SSH_CONFIG and that the node is up."

# ---- 1. WireGuard keypair for the VM ----------------------------------------
mkdir -p "$WG_SECRETS_DIR"; chmod 700 "$WG_SECRETS_DIR"
WG_KEY="$WG_SECRETS_DIR/dev-vm.key"
WG_PUB="$WG_SECRETS_DIR/dev-vm.pub"
if [[ ! -s "$WG_KEY" ]]; then
  log "Generating WireGuard keypair for dev-vm → $WG_KEY"
  (umask 077; wg genkey > "$WG_KEY")
  wg pubkey < "$WG_KEY" > "$WG_PUB"
fi
chmod 600 "$WG_KEY"
WG_PRIVKEY="$(cat "$WG_KEY")"
log "dev-vm WireGuard pubkey: $(cat "$WG_PUB")"
log "  → paste this into wireguard/wg-mesh-nodes.yaml (dev-vm wg_pubkey) and add"
log "    it as a peer on pk-hetzner-4 (AllowedIPs $WG_IP/32), then 'wg syncconf'."

# ---- 2. render cloud-init (inject wg private key + peer block) ---------------
PEERS_BLOCK="[Peer]
# mentolder mesh hub (routes the whole 192.168.100.0/24 mesh for this LAN node)
PublicKey = $WG_HUB_PUBKEY
Endpoint = $WG_HUB_ENDPOINT
AllowedIPs = $WG_ALLOWED_IPS
PersistentKeepalive = 25"

RENDERED="$(mktemp)"; trap 'rm -f "$RENDERED"' EXIT
# Use python for safe multi-line substitution (no sed delimiter / escaping pain).
python3 - "$CLOUD_INIT_SRC" "$WG_PRIVKEY" "$PEERS_BLOCK" > "$RENDERED" <<'PY'
import sys
src, privkey, peers = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()
text = text.replace("REPLACEME_WG_PRIVATE_KEY", privkey)
# keep the YAML block indentation (6 spaces) for the multi-line peer block
peers_indented = "\n".join(("      " + l if l else l) for l in peers.splitlines())
text = text.replace("      REPLACEME_WG_PEERS_BLOCK", peers_indented)
sys.stdout.write(text)
PY
[[ "$WG_HUB_PUBKEY" == REPLACEME_* ]] && \
  log "NOTE: WG_HUB_PUBKEY is a placeholder — set it (pk-hetzner-4 pubkey) so the mesh actually connects."

# ---- 3. upload cloud-init snippet -------------------------------------------
log "Uploading cloud-init snippet → $PVE_HOST:/var/lib/vz/snippets/$SNIPPET_NAME"
ssh_pve 'mkdir -p /var/lib/vz/snippets'
scp -F "$SSH_CONFIG" "$RENDERED" "$PVE_HOST:/var/lib/vz/snippets/$SNIPPET_NAME" >/dev/null
ssh_pve "chmod 600 /var/lib/vz/snippets/$SNIPPET_NAME"

# ---- 4. create the VM on the Proxmox node -----------------------------------
log "Creating VM $VMID on $PVE_HOST"
ssh_pve "$(cat <<REMOTE
set -euo pipefail

if qm status $VMID &>/dev/null; then
  if [[ "$FORCE" == "1" ]]; then
    echo ">> VM $VMID exists; FORCE=1 → stopping + destroying"
    qm stop $VMID || true
    qm destroy $VMID --purge
  else
    echo "ERROR: VM $VMID already exists. Re-run with FORCE=1 to recreate." >&2
    exit 1
  fi
fi

# Download the Debian cloud image once (cached).
mkdir -p "$IMAGE_CACHE"
if [[ ! -s "$IMAGE_CACHE/$IMAGE_FILE" ]]; then
  echo ">> downloading $IMAGE_URL"
  curl -fSL "$IMAGE_URL" -o "$IMAGE_CACHE/$IMAGE_FILE"
fi

echo ">> qm create"
qm create $VMID \
  --name $VM_NAME \
  --memory $MEM_MB \
  --cores $CORES \
  --cpu host \
  --net0 virtio,bridge=$BRIDGE \
  --scsihw virtio-scsi-single \
  --ostype l26 \
  --agent enabled=1

echo ">> import disk"
qm importdisk $VMID "$IMAGE_CACHE/$IMAGE_FILE" $STORAGE
qm set $VMID --scsi0 $STORAGE:vm-$VMID-disk-0
qm set $VMID --ide2 $STORAGE:cloudinit
qm set $VMID --boot order=scsi0
qm set $VMID --serial0 socket --vga serial0

echo ">> cloud-init network + custom user-data"
qm set $VMID --ipconfig0 ip=$VM_IP/$VM_CIDR,gw=$VM_GW
qm set $VMID --nameserver "$VM_DNS"
qm set $VMID --cicustom "user=$SNIPPET_STORAGE:snippets/$SNIPPET_NAME"

echo ">> resize disk to $DISK_SIZE"
qm disk resize $VMID scsi0 $DISK_SIZE

echo ">> start"
qm start $VMID
echo ">> VM $VMID started. cloud-init runs on first boot (toolchain install takes a few minutes)."
REMOTE
)"
# ---- 5. next steps ----------------------------------------------------------
cat <<EOF

$(log "Done. The dev VM is booting at $VM_IP (alias: dev-vm / dev-vm/gekko).")

Next:
  1. Wait for cloud-init to finish (watch: ssh -F $SSH_CONFIG dev "qm terminal $VMID").
  2. Verify access:    ssh -F $SSH_CONFIG dev-vm "docker version && k3d version"
  3. Finish WireGuard: add dev-vm's pubkey ($(cat "$WG_PUB" 2>/dev/null)) as a peer
     on pk-hetzner-4 and set WG_HUB_PUBKEY in wg-mesh.conf if it was a placeholder.
  4. Bring up the dev cluster:
       task dev:cluster:create SSH_TARGET=gekko@dev-vm \\
         SSH_KEY=~/Bachelorprojekt/environments/.secrets/.ssh/gekko_ed25519
EOF
