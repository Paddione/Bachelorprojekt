---
title: k3s-1 dev-stack VM on Proxmox pve (10.0.0.7)
date: 2026-05-30
status: draft
domains: [infra]
---

# k3s-1 dev-stack VM — Design

## Goal

Provision a fresh Ubuntu VM named `k3s-1` on the newly-rebuilt Proxmox node
`pve` (`10.0.0.7`) so it can resume its role as the **central dev-stack host**
for `dev.mentolder.de`. The VM must be a drop-in replacement for the old
`k3s-1` — same hostname, same LAN address — so that the existing
`task dev:cluster:create` flow (`ssh gekko@k3s-1 → k3d cluster create …`)
works unchanged.

This task delivers a **host ready to receive the dev k3d cluster**. It does NOT
create the k3d cluster itself — that remains the job of `task dev:cluster:create`,
which owns the load-bearing port mappings (`127.0.0.1:18080`, `0.0.0.0:2222`,
`127.0.0.1:15432`).

## Verified host facts (recon 2026-05-30)

- **Host:** `pve`, `10.0.0.7/8`, gateway `10.0.0.1`, bridge `vmbr0` (ports `nic0`).
- **Proxmox:** `pve-manager/9.2.2`, kernel `7.0.2-6-pve`.
- **Standalone** — no corosync / not part of any Proxmox cluster (matches the
  "leave standalone" decision; no `pvecm`).
- **CPU:** Intel i7-6700K — 4 cores / **8 threads**.
- **RAM:** **15 GiB total** (~13 GiB free). A 32 GB VM is physically impossible;
  the originally-floated "Large" spec was revised down.
- **Storage:** boot NVMe (FIKWOT 238 GB) → `local` dir (62 GB free) +
  `local-lvm` lvm-thin pool (**140 GB free**). NVMe shows **no I/O errors** in
  `dmesg` — the earlier PCIe/NVMe fault appears resolved by the reseat.
- **Unused 1 TB SATA disk** (`/dev/sda`, exfat, effectively empty — only a
  `System Volume Information` folder). **Left untouched** (lean/no-wipe choice).
- **Tooling:** `qm`, `qemu-img`, `genisoimage` present. `cloud-localds`,
  `virt-customize`, `cloud-init` **NOT** installed on the host → the cloud-init
  seed ISO is built manually with `genisoimage -volid cidata`.
- **Internet:** reachable (HTTP 200 from cloud-images.ubuntu.com).
- **No existing VMs**; no used VMIDs.

## Decisions (locked with user)

| Question | Decision |
|---|---|
| Proxmox clustering | **Standalone** — no `pvecm`. |
| VM size | **6 vCPU / 12 GB RAM / 120 GB disk** (lean, no-wipe). |
| Disk location | `local-lvm` thin pool (no 1 TB disk wiring). |
| Networking | **Reuse MAC `BC:24:11:A4:40:F8`** + DHCP → router reservation hands it **`10.0.3.1`** (the old k3s-1 address). |
| OS | **Ubuntu 24.04 LTS** (`noble` server cloud image). |
| Cluster creation | Out of scope — left to `task dev:cluster:create`. |

`10.0.3.1` confirmed free (no ping response) prior to build.

## VM definition

| Setting | Value |
|---|---|
| VMID / name | `9001` / `k3s-1` |
| CPU | 6 vCPU, type `host` (leaves 2 threads for Proxmox) |
| RAM | 12288 MB, ballooning off |
| Disk | 120 GB on `local-lvm`, `scsi0` via `virtio-scsi-single`, `discard=on`, `ssd=1` |
| Network | `virtio`, bridge `vmbr0`, **MAC `BC:24:11:A4:40:F8`** |
| Firmware | UEFI (OVMF) + EFI disk on `local-lvm` |
| Cloud-init drive | `ide2` = NoCloud seed ISO (`cidata`) on `local` |
| Guest agent | `agent=1` (enables `qm guest exec` from host) |
| Autostart | `onboot=1` |

## Guest provisioning (cloud-init NoCloud)

`user-data` + `meta-data` are hand-authored and packed into a `cidata` ISO with
`genisoimage`, attached as `ide2`. Cloud-init in the Ubuntu image consumes it on
first boot and:

- **Hostname:** `k3s-1`
- **Network:** DHCP on the single NIC (the reserved MAC yields `10.0.3.1`).
  No static config — the router reservation is the source of truth.
- **User `gekko`** (matches `DEV_SSH_USER` in `environments/mentolder.yaml`):
  passwordless sudo, shell `/bin/bash`, with `GEKKO_SSH_PUBLIC_KEY`
  (`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH43aUqN4w9u7DIt3gUREOJY4pmVIWvIbqFsG/fPSlV0`)
  in `authorized_keys`. Added to the `docker` group.
- **Packages:** `qemu-guest-agent`, `curl`, `git`, `ca-certificates`, plus Docker
  (official Docker apt repo, `docker-ce` + `docker-ce-cli` + `containerd.io`).
- **k3d** via the official install script; **kubectl** via the official binary.
  Both on PATH for `gekko`.
- **Rootfs grown** to fill the 120 GB disk (cloud-init `growpart` + resize, default
  for the Ubuntu cloud image).
- `qemu-guest-agent` + `docker` enabled and started.

## Out of scope (YAGNI)

- k3d cluster creation, dev DB refresh, oauth2-proxy-dev, sealed secrets — all
  downstream of `task dev:cluster:create` / `task dev:deploy`.
- Wiring the 1 TB SATA disk into Proxmox.
- Proxmox clustering.

## Client-side follow-up (flag, don't silently do)

`task dev:cluster:create` resolves the literal hostname **`k3s-1`** via
`ssh gekko@k3s-1`. After the VM is up, `k3s-1 → 10.0.3.1` must resolve from the
operator's WSL host. The runbook step will print the exact `/etc/hosts` line:

```
10.0.3.1   k3s-1
```

(Or a router/DNS entry if preferred.) No repo config change is needed —
`environments/mentolder.yaml` already has `DEV_NODE: "k3s-1"` and
`DEV_SSH_USER: "gekko"`.

## Verification

1. `qm status 9001` → `running`; `qm guest exec 9001 -- hostname` → `k3s-1` (agent up).
2. `10.0.3.1` answers ping; `ssh gekko@10.0.3.1` succeeds with the gekko key.
3. On the guest: `docker run --rm hello-world`, `k3d version`, `kubectl version --client`.
4. Rootfs ≈ 120 GB (`df -h /`).
5. Reboot test: `qm reset 9001`, confirm it returns on `10.0.3.1` (reservation +
   `onboot=1` hold).
