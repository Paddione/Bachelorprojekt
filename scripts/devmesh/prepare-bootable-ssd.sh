#!/usr/bin/env bash
# scripts/devmesh/prepare-bootable-ssd.sh — Prepare bootable Ubuntu 24.04 SSD for gpu-cluster3
#
# Usage:
#   K3S_TOKEN=<server-join-token> bash scripts/devmesh/prepare-bootable-ssd.sh [target-device|target-dir]
#
# K3S_TOKEN kommt nie ins Repo [T900177]. Auf einem Server-Node:
#   sudo cat /var/lib/rancher/k3s/server/token

set -euo pipefail

: "${K3S_TOKEN:?K3S_TOKEN muss gesetzt sein (Server-Join-Token, siehe Kopfkommentar)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRATCH="$REPO_ROOT/scratch"
mkdir -p "$SCRATCH"

IMG_QCOW2="$SCRATCH/ubuntu-24.04-server-cloudimg-amd64.img"
IMG_RAW="$SCRATCH/ubuntu-24.04-bootable.raw"
CIDATA_ISO="$SCRATCH/cidata.iso"
CIDATA_DIR="$SCRATCH/cidata"

echo "=========================================================="
echo "💿 Preparing Bootable Ubuntu 24.04 Image for gpu-cluster3"
echo "=========================================================="

# 1. Download official Ubuntu 24.04 cloud image if missing
if [[ ! -f "$IMG_QCOW2" ]]; then
  echo "Downloading official Ubuntu 24.04 server cloud image..."
  curl -L -o "$IMG_QCOW2" https://cloud-images.ubuntu.com/releases/noble/release/ubuntu-24.04-server-cloudimg-amd64.img
fi

# 2. Convert QCOW2 to RAW disk image
if [[ ! -f "$IMG_RAW" ]]; then
  echo "Converting QCOW2 image to bootable RAW disk image..."
  qemu-img convert -f qcow2 -O raw "$IMG_QCOW2" "$IMG_RAW"
fi

# 3. Create Cloud-Init Seed (CIDATA)
mkdir -p "$CIDATA_DIR"
cat << 'META_EOF' > "$CIDATA_DIR/meta-data"
instance-id: gpu-cluster3
local-hostname: gpu-cluster3
META_EOF

cat << 'USER_EOF' > "$CIDATA_DIR/user-data"
#cloud-config
hostname: gpu-cluster3
manage_etc_hosts: true

users:
  - name: gpu
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo, kvm
    shell: /bin/bash
    lock_passwd: false
    passwd: "$6$rounds=4096$saltedpassword$6/5f.Gz9vYpY6t7Jk6o8.k7H7o.H7.7H7.7H7.7"
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFN75CnuOz7YXaJipTFxWMVDgm35heu64JKN1QL+Z84+ patrick@korczewski.de
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO6lVCVvkRXvhrQEqq7XoKSjjUlGMdzEfRBvEn4pgCk6
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL6lprjaleEg1vtahF3F37jLoQoWrEvl6HxaOrBqg3vf gekko@nextcloud
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM0v5tWJfsMAFno233JIC2Ovrc032XuZYKZfzxzUchDP claude-wsl@PK-Desktop
  - name: patrick
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo, kvm
    shell: /bin/bash
    lock_passwd: false
    passwd: "$6$rounds=4096$saltedpassword$6/5f.Gz9vYpY6t7Jk6o8.k7H7o.H7.7H7.7H7.7"
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFN75CnuOz7YXaJipTFxWMVDgm35heu64JKN1QL+Z84+ patrick@korczewski.de
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO6lVCVvkRXvhrQEqq7XoKSjjUlGMdzEfRBvEn4pgCk6

packages:
  - ufw
  - curl
  - iptables
  - ca-certificates

runcmd:
  - ufw allow from 10.0.0.0/8 to any port 22 proto tcp
  - ufw allow from 100.64.0.0/10 to any port 22 proto tcp
  - ufw allow from 10.0.0.0/8 to any port 6443 proto tcp
  - ufw allow from 100.64.0.0/10 to any port 6443 proto tcp
  - ufw allow from 10.0.0.0/8 to any port 2379:2380 proto tcp
  - ufw allow from 10.0.0.0/8 to any port 10250 proto tcp
  - ufw allow from 10.0.0.0/8 to any port 51820 proto udp
  - ufw --force enable
  - curl -sfL https://get.k3s.io | K3S_TOKEN='__K3S_TOKEN__' sh -s - server --server https://10.1.0.101:6443 --node-ip 10.10.10.4 --flannel-backend=wireguard-native --tls-san 10.1.0.101 --tls-san 10.10.10.2 --tls-san 10.10.10.3 --tls-san 10.10.10.4 --tls-san gpu-cluster3 --etcd-snapshot-schedule-cron='0 */6 * * *' --etcd-snapshot-retention=20 --cluster-cidr=10.52.0.0/16 --service-cidr=10.53.0.0/16 --cluster-dns=10.53.0.10 --node-label storage=true
USER_EOF
sed -i "s|__K3S_TOKEN__|${K3S_TOKEN}|" "$CIDATA_DIR/user-data"

echo "Building CIDATA ISO..."
xorriso -as mkisofs -V CIDATA -J -r -o "$CIDATA_ISO" "$CIDATA_DIR"

# Copy output files to USB drive D:\ if mounted
if [[ -d "/mnt/d" ]]; then
  echo "Copying bootable files to D:\ (/mnt/d)..."
  cp -v "$CIDATA_ISO" /mnt/d/
  cp -v "$IMG_RAW" /mnt/d/ubuntu-24.04-bootable.raw
fi

echo "=========================================================="
echo "✅ Image preparation complete!"
echo "   RAW Image: $IMG_RAW"
echo "   CIDATA ISO: $CIDATA_ISO"
echo "=========================================================="
