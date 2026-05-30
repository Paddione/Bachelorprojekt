---
domains: [infra]
status: done
---

> **DONE 2026-05-30.** VM 9001 `k3s-1` provisioned on pve (10.0.0.7), IP 10.0.3.1,
> Docker+k3d+kubectl+gekko user, `ssh gekko@k3s-1` works. Beyond this plan's scope,
> the dev k3d cluster + dev stack + MCP monolith were brought up and k3s-1 was also
> joined to prod mentolder as a k3s agent (wg-mesh) so oauth2-proxy-dev/whisper
> schedule. See memory [[project-k3s1-nvme-fault]] and PR #1206.

# k3s-1 dev-stack VM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an Ubuntu 24.04 VM `k3s-1` on standalone Proxmox `pve` (10.0.0.7), reusing MAC `BC:24:11:A4:40:F8` → DHCP reservation `10.0.3.1`, preloaded with Docker + k3d + kubectl and the `gekko` user, so `task dev:cluster:create` works unchanged.

**Architecture:** Host-side: download the Ubuntu noble cloud image, import it as a disk into a new VM, attach a hand-built NoCloud cloud-init seed ISO (`genisoimage`, since `cloud-localds`/`virt-customize` are absent), boot. Guest-side: cloud-init sets hostname/user/keys, installs Docker/k3d/kubectl, grows rootfs. This produces a *host ready for* the dev k3d cluster — cluster creation itself stays with `task dev:cluster:create`.

**Tech Stack:** Proxmox VE 9.2.2 (`qm`, `qemu-img`, `genisoimage`), Ubuntu 24.04 cloud image, cloud-init NoCloud datasource, Docker CE, k3d, kubectl.

**Execution context:** All host commands run over SSH as `root@10.0.0.7`. Helper to prepend to every host command:

```bash
export SSHPASS='170591pk'
PVE() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 root@10.0.0.7 "$@"; }
PVECP() { sshpass -e scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$@"; }
```

**Constants:**
- VMID: `9001`, name `k3s-1`
- MAC: `BC:24:11:A4:40:F8`
- Storage: `local-lvm` (disks), `local` (ISO + image, path `/var/lib/vz`)
- Image URL: `https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img`
- gekko pubkey: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513`

---

### Task 1: Download the Ubuntu 24.04 cloud image to the host

**Files:**
- Create on host: `/var/lib/vz/template/iso/noble-server-cloudimg-amd64.img`

- [ ] **Step 1: Verify no VMID 9001 collision and the storage is present**

Run:
```bash
PVE 'qm status 9001 2>&1 | grep -q "does not exist" && echo "9001 FREE" || qm status 9001; pvesm status | grep -E "local|local-lvm"'
```
Expected: `9001 FREE`, and both `local` and `local-lvm` listed `active`.

- [ ] **Step 2: Download the cloud image**

Run:
```bash
PVE 'cd /var/lib/vz/template/iso && curl -fL -o noble-server-cloudimg-amd64.img https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img'
```
Expected: completes with exit 0.

- [ ] **Step 3: Verify the image is a valid qcow2**

Run:
```bash
PVE 'qemu-img info /var/lib/vz/template/iso/noble-server-cloudimg-amd64.img'
```
Expected: `file format: qcow2`, virtual size ~3.5 GiB.

---

### Task 2: Build the cloud-init NoCloud seed ISO

**Files:**
- Create on host: `/root/k3s1-seed/user-data`, `/root/k3s1-seed/meta-data`
- Create on host: `/var/lib/vz/template/iso/k3s1-seed.iso`

- [ ] **Step 1: Write meta-data**

Run:
```bash
PVE 'mkdir -p /root/k3s1-seed && cat > /root/k3s1-seed/meta-data <<EOF
instance-id: k3s-1-20260530
local-hostname: k3s-1
EOF'
```
Expected: exit 0.

- [ ] **Step 2: Write user-data**

Run (note: the heredoc is quoted `<<'EOF'` so nothing expands host-side):
```bash
PVE 'cat > /root/k3s1-seed/user-data <<'\''EOF'\''
#cloud-config
hostname: k3s-1
fqdn: k3s-1
manage_etc_hosts: true

users:
  - name: gekko
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    lock_passwd: true
    ssh_authorized_keys:
      - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0 gekko@mentolder-20260513"

package_update: true
package_upgrade: false
packages:
  - qemu-guest-agent
  - curl
  - git
  - ca-certificates
  - gnupg
  - apt-transport-https

write_files:
  - path: /usr/local/sbin/k3s1-bootstrap.sh
    permissions: "0755"
    content: |
      #!/usr/bin/env bash
      set -euxo pipefail
      # Docker CE (official repo)
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      systemctl enable --now docker
      usermod -aG docker gekko || true
      # kubectl (stable)
      KVER=$(curl -fsSL https://dl.k8s.io/release/stable.txt)
      curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KVER}/bin/linux/amd64/kubectl"
      chmod +x /usr/local/bin/kubectl
      # k3d (official installer)
      curl -fsSL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
      touch /var/lib/k3s1-bootstrap.done

runcmd:
  - systemctl enable --now qemu-guest-agent
  - bash /usr/local/sbin/k3s1-bootstrap.sh

growpart:
  mode: auto
  devices: ["/"]
resize_rootfs: true
EOF'
```
Expected: exit 0.

- [ ] **Step 3: Sanity-check the user-data is valid YAML and has the key**

Run:
```bash
PVE 'grep -c "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG" /root/k3s1-seed/user-data && python3 -c "import yaml,sys; yaml.safe_load(open(\"/root/k3s1-seed/user-data\").read().split(chr(10),1)[1])" && echo YAML_OK'
```
Expected: `1` then `YAML_OK`. (Strips the `#cloud-config` first line before YAML parse.)

- [ ] **Step 4: Build the cidata ISO**

Run:
```bash
PVE 'genisoimage -output /var/lib/vz/template/iso/k3s1-seed.iso -volid cidata -joliet -rock /root/k3s1-seed/user-data /root/k3s1-seed/meta-data && ls -la /var/lib/vz/template/iso/k3s1-seed.iso'
```
Expected: ISO created, size ~360 KB, exit 0.

---

### Task 3: Create the VM and import the disk

**Files:**
- Create on host: VM config `/etc/pve/qemu-server/9001.conf`

- [ ] **Step 1: Create the bare VM (UEFI, guest agent, MAC-pinned NIC)**

Run:
```bash
PVE 'qm create 9001 \
  --name k3s-1 \
  --cores 6 --cpu host --sockets 1 \
  --memory 12288 --balloon 0 \
  --machine q35 --bios ovmf \
  --scsihw virtio-scsi-single \
  --net0 virtio,bridge=vmbr0,macaddr=BC:24:11:A4:40:F8 \
  --agent enabled=1 \
  --ostype l26 \
  --onboot 1'
```
Expected: exit 0, no errors.

- [ ] **Step 2: Add the EFI disk**

Run:
```bash
PVE 'qm set 9001 --efidisk0 local-lvm:1,efitype=4m,pre-enrolled-keys=0'
```
Expected: `update VM 9001: -efidisk0 ...` success.

- [ ] **Step 3: Import the cloud image as scsi0**

Run:
```bash
PVE 'qm importdisk 9001 /var/lib/vz/template/iso/noble-server-cloudimg-amd64.img local-lvm'
```
Expected: `Successfully imported disk as 'unused0:local-lvm:vm-9001-disk-...'`.

- [ ] **Step 4: Attach the imported disk + enable discard/ssd, set boot order**

Run:
```bash
PVE 'qm set 9001 --scsi0 local-lvm:vm-9001-disk-1,discard=on,ssd=1 && qm set 9001 --boot order=scsi0'
```
Expected: both succeed. (If the imported disk index differs, read it from `qm config 9001 | grep unused0` and substitute.)

- [ ] **Step 5: Resize the disk to 120 GB**

Run:
```bash
PVE 'qm resize 9001 scsi0 120G'
```
Expected: exit 0.

- [ ] **Step 6: Attach the cloud-init seed ISO as ide2**

Run:
```bash
PVE 'qm set 9001 --ide2 local:iso/k3s1-seed.iso,media=cdrom'
```
Expected: success.

- [ ] **Step 7: Verify the assembled config**

Run:
```bash
PVE 'qm config 9001'
```
Expected: shows `scsi0` (120G on local-lvm), `ide2` (k3s1-seed.iso), `net0` with `macaddr=BC:24:11:A4:40:F8`, `agent: enabled=1`, `bios: ovmf`, `onboot: 1`, `memory: 12288`, `cores: 6`.

---

### Task 4: Boot and let cloud-init provision

- [ ] **Step 1: Start the VM**

Run:
```bash
PVE 'qm start 9001 && sleep 3 && qm status 9001'
```
Expected: `status: running`.

- [ ] **Step 2: Wait for the guest agent (cloud-init + reboot can take 2-5 min)**

Run (polls up to ~5 min):
```bash
PVE 'for i in $(seq 1 30); do qm guest exec 9001 -- hostname >/dev/null 2>&1 && { echo AGENT_UP; break; }; sleep 10; done'
```
Expected: `AGENT_UP`. If it never appears, open the console: `qm terminal 9001` or check `/var/log/cloud-init-output.log` via the Proxmox web console.

- [ ] **Step 3: Confirm hostname and that bootstrap finished**

Run:
```bash
PVE 'qm guest exec 9001 -- /bin/bash -lc "hostname; test -f /var/lib/k3s1-bootstrap.done && echo BOOTSTRAP_DONE || echo BOOTSTRAP_PENDING"'
```
Expected: `k3s-1` and `BOOTSTRAP_DONE`. If `PENDING`, wait another 60s and re-run (Docker/k3d install is still going).

- [ ] **Step 4: Confirm the VM took the reserved IP**

Run:
```bash
PVE 'for i in $(seq 1 12); do ping -c1 -W1 10.0.3.1 >/dev/null 2>&1 && { echo "10.0.3.1 UP"; break; }; sleep 5; done; ip neigh | grep -i bc:24:11:a4:40:f8'
```
Expected: `10.0.3.1 UP` and the neighbor entry shows `10.0.3.1 ... bc:24:11:a4:40:f8 ... REACHABLE/STALE`.

---

### Task 5: Verify the host is ready for the dev cluster

- [ ] **Step 1: SSH in as gekko from the laptop (WSL) using the gekko key**

Run (from the WSL host, not via PVE):
```bash
ssh -i ~/.ssh/gekko_id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=15 gekko@10.0.3.1 'echo SSH_OK; hostname'
```
Expected: `SSH_OK` and `k3s-1`.

> If `~/.ssh/gekko_id_ed25519` is absent locally, run the same check via the host instead:
> `PVE 'qm guest exec 9001 -- /bin/bash -lc "grep -c ssh-ed25519 /home/gekko/.ssh/authorized_keys"'` → expect `1`.

- [ ] **Step 2: Verify Docker, k3d, kubectl as gekko**

Run:
```bash
ssh -i ~/.ssh/gekko_id_ed25519 gekko@10.0.3.1 'docker run --rm hello-world | grep -q "Hello from Docker" && echo DOCKER_OK; k3d version; kubectl version --client --output=yaml | grep gitVersion'
```
Expected: `DOCKER_OK`, a `k3d version vX.Y.Z`, and a kubectl `gitVersion`. (If `docker` needs the new group, the bootstrap already added gekko to `docker`; a fresh SSH session picks it up.)

- [ ] **Step 3: Verify rootfs grew to ~120 GB**

Run:
```bash
ssh -i ~/.ssh/gekko_id_ed25519 gekko@10.0.3.1 'df -h / | tail -1'
```
Expected: size column ~117-120G.

- [ ] **Step 4: Reboot persistence test**

Run:
```bash
PVE 'qm reset 9001'; sleep 60
PVE 'for i in $(seq 1 18); do ping -c1 -W1 10.0.3.1 >/dev/null 2>&1 && { echo "10.0.3.1 BACK"; break; }; sleep 10; done'
```
Expected: `10.0.3.1 BACK` (onboot=1 + DHCP reservation hold).

- [ ] **Step 5: Detach the seed ISO (cloud-init has done its job)**

Run:
```bash
PVE 'qm set 9001 --ide2 none,media=cdrom'
```
Expected: success. (Prevents cloud-init from re-running NoCloud config on future boots.)

---

### Task 6: Hand-off — make `k3s-1` resolvable and document

**Files:**
- Modify (operator's WSL host, manual): `/etc/hosts`

- [ ] **Step 1: Print the exact /etc/hosts line for the operator**

The repo's `task dev:cluster:create` resolves the literal hostname `k3s-1`
(`DEV_NODE: "k3s-1"`, `DEV_SSH_USER: "gekko"` in `environments/mentolder.yaml`).
Add to the WSL host's `/etc/hosts` (suggest via `! sudo` in-session):
```
10.0.3.1   k3s-1
```

- [ ] **Step 2: Confirm name resolution + SSH by hostname**

Run (from WSL after the hosts edit):
```bash
ssh -i ~/.ssh/gekko_id_ed25519 gekko@k3s-1 'echo NAME_OK'
```
Expected: `NAME_OK`.

- [ ] **Step 3: State what's next (do NOT run here)**

The host is ready. Bringing up the dev k3d cluster is a separate, deliberate step:
```bash
task dev:cluster:create ENV=mentolder
```
That command owns the load-bearing port mappings (`127.0.0.1:18080`, `0.0.0.0:2222`, `127.0.0.1:15432`) and is intentionally out of scope for this plan.

---

## Self-Review notes

- **Spec coverage:** Task 1 (image) ✓, Task 2 (cloud-init via genisoimage — covers the missing `cloud-localds`) ✓, Task 3 (6vCPU/12GB/120GB on local-lvm, MAC pin, UEFI, agent, onboot) ✓, Task 4 (boot + reserved IP 10.0.3.1) ✓, Task 5 (gekko user+key, docker/k3d/kubectl, rootfs, reboot) ✓, Task 6 (k3s-1 hostname resolution hand-off; cluster creation explicitly out of scope) ✓. Standalone (no pvecm) honored — no clustering task. 1 TB disk left untouched ✓.
- **No placeholders:** all commands concrete; the one conditional (imported disk index in Task 3 Step 4) includes the exact fallback command.
- **Consistency:** VMID 9001, MAC `BC:24:11:A4:40:F8`, IP `10.0.3.1`, storage `local-lvm`/`local` used identically throughout.
