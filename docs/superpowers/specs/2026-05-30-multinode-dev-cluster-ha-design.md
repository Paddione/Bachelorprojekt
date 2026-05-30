---
title: Multi-node HA dev cluster on the Proxmox cluster (k3d → real k3s)
date: 2026-05-30
status: draft
domains: [infra]
---

# Multi-node HA dev cluster on the Proxmox cluster

## Goal

Make the `dev.mentolder.de` stack survive the loss of any single physical host,
by moving it off the single-VM nested **k3d** setup on `k3s-1` and onto a real
**3-node k3s cluster** spanning all three Proxmox hosts. Resilience is delivered
at the **Kubernetes layer** (etcd quorum + Longhorn replication), *not* at the
Proxmox VM layer (no shared storage, no VM live-migration/HA).

This was chosen explicitly over (a) Proxmox VM-level HA failover (would require
rebuilding storage as ZFS/Ceph + replication, async, data-loss window — wrong
layer for k8s) and (b) a capacity-only expansion (no failover guarantee).

## Current state (verified 2026-05-30)

**Proxmox cluster** `pve-cluster` — 3 nodes, corosync quorate (2/3):

| Node | LAN IP | vCPU | RAM | OS disk (NVMe) | Spare `sda` SSD | VMs today |
|------|--------|------|-----|----------------|-----------------|-----------|
| `pve`  | 10.0.0.7  | 8 | 15.5 GiB | 238 GB | **954 GB** (FIKWOT, unused, stray exfat) | `k3s-1` (VM 9001: 6 vCPU / 12 GiB / 120 GB) |
| `pve2` | 10.0.0.9  | 4 | 15.5 GiB | 256 GB | **500 GB** (SanDisk, unused) | none — idle |
| `pve3` | 10.0.0.11 | 4 | 15.5 GiB | 256 GB | **250 GB** (Samsung 840, unused) | none — idle |

- Storage is **local-only**: `local` (dir) + `local-lvm` (lvmthin) per node. No
  shared storage, no ZFS, no Ceph. HA not configured (fencing standby).
- `k3s-1` (VM 9001 on `pve`) wears **two hats**: (1) a remote **agent of the
  mentolder cluster** over wg-mesh, and (2) host of the nested **k3d**
  `dev.mentolder.de` stack (website, brett, MCP monolith, dev Postgres, sish).

**Why k3d can't just be scaled:** k3d is Docker-in-a-single-VM and cannot span
Proxmox nodes. K8s-layer resilience for the dev stack therefore *requires*
replacing the nested k3d with a real multi-node k3s cluster. This is a migration,
not a toggle.

**How the dev stack is exposed today** (the coupling that drives the design):

```
*.dev.mentolder.de (public DNS, 443)
  → PROD mentolder Traefik (public IP 46.225.125.59)        ← the ONLY public entrypoint
  → oauth2-proxy-dev (on k3s-1, hostNetwork, OIDC /dev-access gate)
  → http://127.0.0.1:18080  (k3d loadbalancer on the k3s-1 host)   ← the coupling that breaks
  → k3d Traefik → website / brett / mcp / sish
```

The Proxmox cluster sits on a **private LAN with no public ingress**; the dev
stack is public *only* because it is proxied through the prod mentolder Traefik.

## Target architecture

```
Proxmox cluster — corosync quorum, LAN 10.0.0.0/24
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ pve  (.7) 8c/15.5G  │ pve2 (.9) 4c/15.5G  │ pve3 (.11) 4c/15.5G │
│ VM k3s-1 (KEEP)     │                     │                     │
│   mentolder agent   │                     │                     │
│   shrunk → ~3 GB    │                     │                     │
│ ─────────────────── │                     │                     │
│ VM devc-1 (NEW)     │ VM devc-2 (NEW)     │ VM devc-3 (NEW)     │
│  k3s server + etcd  │  k3s server + etcd  │  k3s server + etcd  │
│  ~8 GB / 4 vCPU     │  ~10 GB / 4 vCPU    │  ~10 GB / 4 vCPU    │
│  +data disk ← sda   │  +data disk ← sda   │  +data disk ← sda   │
│   954 GB            │   500 GB            │   250 GB            │
└─────────────────────┴─────────────────────┴─────────────────────┘
        \                    |                     /
     kube-vip floating VIP (10.0.0.20) → API + ingress
     embedded etcd: 3 members, quorum 2/3 → survives any 1 host
     Longhorn: 3 replicas → PVC data survives any 1 host
     Traefik via VIP → dev.mentolder.de
```

### Components

- **3 new VMs, one per Proxmox host, all k3s _servers_ with embedded etcd.**
  3-member quorum (2/3) → loss of any single physical host keeps the control
  plane alive. This is the HA core.
- **kube-vip floating VIP** (`10.0.0.20`) for both the API server and ingress, so
  no single VM is the entrypoint; the VIP floats to a survivor.
- **Longhorn** on the spare SSDs, 3 replicas. On host loss, a pod reschedules onto
  a survivor where Longhorn already holds a replica of its data.
- **`k3s-1` stays on `pve` but shrinks** to the mentolder-agent role (~3 GB) once
  the dev workload migrates off it — freeing the RAM that lets `devc-1` co-reside
  on `pve`.

### Accepted consequences

1. The dev stack **fully leaves `k3s-1`**; `k3s-1` keeps only the mentolder-agent
   hat. (Required: `pve`'s 15.5 GiB cannot host both a 12 GiB `k3s-1` and a new
   server VM simultaneously.)
2. Asymmetric SSDs cap 3-replica volumes at **~230 GB** (the smallest node) —
   ample for a dev stack. `pve`'s 954 GB and `pve2`'s 500 GB absorb extra
   replicas, single-replica scratch, and Longhorn backups.
3. The dev cluster becomes **persistent infrastructure** — we lose k3d's
   "blow-away-and-recreate in 60s" convenience in exchange for HA.

## Section 1 — VMs & sizing

Three VMs cloned from a cloud-init Debian/Ubuntu template (`qm clone`), one per
Proxmox host, joined into one k3s HA cluster:

| VM | Host | vCPU | RAM | Root (NVMe `local-lvm`) | Data (`local-data`/SSD) | Role |
|----|------|------|-----|------------------|------------------|------|
| `devc-1` | pve  | 4 | 8 GB  | 40 GB | 900 GB → `/var/lib/longhorn` | k3s server + etcd |
| `devc-2` | pve2 | 4 | 10 GB | 40 GB | 470 GB → `/var/lib/longhorn` | k3s server + etcd |
| `devc-3` | pve3 | 4 | 10 GB | 40 GB | 230 GB → `/var/lib/longhorn` | k3s server + etcd |

`devc-1` is sized smaller because it shares `pve` with the (shrunken) `k3s-1`.
All VMs get a NIC on `vmbr0` (LAN 10.0.0.0/24); the kube-vip VIP is a spare LAN
address `10.0.0.20`.

## Section 2 — Proxmox storage prep (the `sda` SSDs)

Each `devc` VM gets a dedicated data disk carved from its host's spare SSD,
mounted at `/var/lib/longhorn`, keeping Longhorn replicas off the OS NVMe.

Per-node prep (identical on all three):

1. **Wipe `sda`**: `wipefs -a /dev/sda` + `sgdisk --zap-all /dev/sda` (pve's has a
   stray exfat `sda1`).
2. **LVM-thin pool on the SSD**: `pvcreate /dev/sda` → `vgcreate vg-data /dev/sda`
   → `lvcreate -l 100%FREE -T vg-data/data-thin`.
3. **Register one Proxmox storage ID** `local-data` (type `lvmthin`, vg `vg-data`,
   thinpool `data-thin`) available on `pve,pve2,pve3`. Same ID on every node, each
   backed by its own physical SSD (standard Proxmox local-but-same-named pattern).

VM disk layout: root on `local-lvm` (NVMe, ~40 GB), data on `local-data` (SSD,
sized per the table above). Inside each VM the data disk is a single `ext4`
mounted at `/var/lib/longhorn` via cloud-init/fstab before Longhorn installs.

**Deliberately not shared storage.** VM disks stay node-local; VMs are never
live-migrated. Resilience comes only from Longhorn (in-k8s replication) + etcd
quorum. No Ceph, no ZFS, no rebuild of the existing `local`/`local-lvm`.

## Section 3 — Dev-stack migration & cutover

### 3a. Ingress bridge (minimal blast radius)

Keep the entire public + TLS + OIDC layer **as-is** (prod mentolder Traefik, the
`workspace-dev-wildcard-tls` cert, oauth2-proxy-dev's `/dev-access` gate). Change
only the backend target:

> `oauth2-proxy-dev --upstream`: `http://127.0.0.1:18080` → `http://10.0.0.20:80`

The OIDC gate stops reaching into a local k3d port and instead forwards to the new
cluster's kube-vip ingress VIP over the private LAN.

**Networking requirement:** `k3s-1` (which hosts oauth2-proxy-dev) must have a
route to the VIP. Satisfied by giving the `devc` VMs LAN addresses on `vmbr0` and
ensuring `k3s-1` has a LAN leg (it is a VM on `pve`, already on that bridge).

`oauth2-proxy-dev` keeps `hostNetwork: true` + `nodeSelector: k3s-1` and stays in
the **prod** cluster — only its upstream URL changes.

### 3b. Storage & stateful migration

- **`shared-db-dev` PVC: `local-path` → `longhorn`.** Postgres stays 1 replica
  (RWO); its Longhorn volume is 3-way replicated so the pod can reschedule onto a
  survivor with its data.
- **`dev-db-refresh` CronJob** (lives in *prod*, pinned to `k3s-1`, reads live from
  prod `shared-db`): only its **write target** changes — `PGHOST=127.0.0.1:15432`
  → the dev cluster's Postgres via a NodePort exposed on the VIP. Schedule, source,
  and the prod-side netpol are unchanged.
- MCP monolith, website, brett: stateless (emptyDir/none) — move cleanly; only
  `storageClassName` references and the deploy context change.

### 3c. Taskfile / lifecycle rework

- `dev:cluster:create` (today `k3d cluster create` on `k3s-1`) → **replaced** by a
  VM-provisioning + k3s-HA-install flow (`qm clone` from a cloud-init template +
  k3s server join + kube-vip + Longhorn install). The dev cluster becomes
  persistent infra.
- `dev:_materialise-secrets`, `dev:apply`, `dev:db:refresh`, `dev:firewall:open` →
  **carry over** with endpoint swaps: `CTX_DEV` → the new kubeconfig context; the
  `15432`/`18080` NodePort/host-port targets → the VIP. No sealed-secrets
  controller in the dev cluster (secrets remain materialised as plain Secrets from
  `environments/.secrets/mentolder.yaml`, as today).
- One **consolidated sish broker** lives in the new dev cluster (see 3f); the
  `:2222` SSH bind + ufw allowlist (`DEV_SSH_ALLOWLIST`) moves to the kube-vip VIP.

### 3d. Cutover sequence (parallel build → flip → reclaim)

Built to never disrupt the running k3d until the new cluster is proven, and to
respect the `pve` RAM constraint (cannot run 12 GB `k3s-1` + 8 GB `devc-1` at once):

0. **Build a cloud-init VM template** (Debian/Ubuntu) on the Proxmox cluster — none
   exists today. All `devc` VMs are `qm clone`d from it. Prerequisite for step 1.
1. **Build `devc-2` (pve2) + `devc-3` (pve3)** first — start as a 1→2 server etcd
   cluster. Idle nodes, zero disruption. Install Longhorn + kube-vip.
2. **Deploy the dev-stack** to the new cluster (longhorn storageClass), materialise
   secrets, run one db-refresh, **smoke-test internally via the VIP** (bypassing the
   public chain).
3. **Flip:** repoint `oauth2-proxy-dev --upstream` → VIP; repoint the db-refresh
   CronJob → VIP NodePort; add the `brainstorm.mentolder.de` SAN + ingress and
   repoint `Taskfile.brainstorm.yml` at the VIP, then retire the standalone prod
   `brainstorm-sish` broker (3f). Verify `dev.mentolder.de` (and a brainstorm
   tunnel) end-to-end through the public chain.
4. **Decommission k3d** on `k3s-1`; **shrink `k3s-1`** to ~3 GB (mentolder-agent
   only). Frees `pve` RAM.
5. **Add `devc-1` (pve)** as the 3rd etcd member → **full 3-node HA quorum**.

Until step 5 the dev cluster is functional but not yet HA — a transient,
acceptable window.

### 3e. Security hardening (folds in the background-review finding)

`mcp-auth-proxy-dev` is redeployed during the move; harden it then:

- Strip the `token` query arg from Traefik/nginx **access-log** formats.
- Emit `Referrer-Policy: no-referrer` on auth-proxy + MCP responses.
- Put `CLUSTER_TOKEN`/`DEV_MCP_TOKEN` on a **rotation schedule**.
- Evaluate **dropping the `?token=` query-param fallback** entirely (header-only
  `Authorization: Bearer`) if claude.ai web auth still works without it.

### 3f. brainstorm consolidation

`brainstorm.mentolder.de` is **not** a deployable app — it is a reverse-SSH tunnel
(`task brainstorm:publish -- <port>`) that publishes the operator's *local*
visual-companion server at a public HTTPS URL. The tunnel (sish) is therefore
intrinsic; it cannot be replaced by a CNAME + plain Ingress (an Ingress needs a
backend, and the backend is the laptop). Today this broker runs **standalone on
the prod cluster** (`gekko-hetzner-2`, NodePort `32223`, `Taskfile.brainstorm.yml`).

As part of this move it is **consolidated onto the new dev cluster**:

- The dev cluster runs **one** sish broker serving both ad-hoc `*.dev.mentolder.de`
  tunnels *and* the brainstorm tunnel; SSH bind moves to the VIP.
- Add `brainstorm.mentolder.de` as a **SAN** on the dev wildcard cert
  (`workspace-dev-wildcard-tls`) and an **ingress rule** for that host, so the
  operator's `brainstorm.mentolder.de → dev.mentolder.de` CNAME resolves and
  validates over HTTPS.
- **Retire** the standalone prod `brainstorm-sish` (`k3d/brainstorm-sish.yaml`) and
  its `gekko-hetzner-2` pinning / ufw rule.
- Repoint `Taskfile.brainstorm.yml` (`publish`, `firewall:open`, `status`) at the
  **dev-cluster VIP** instead of `gekko-hetzner-2`. The operator workflow is
  unchanged: still `task brainstorm:publish -- <port>`.

## Failure model (what we get)

| Failure | Outcome |
|---------|---------|
| Any 1 Proxmox host dies | etcd keeps quorum (2/3); VIP floats; pods reschedule onto survivors; Longhorn serves their data from a surviving replica. Dev stack stays up. |
| 2 hosts die | etcd loses quorum → control plane read-only/down; surviving pods keep running but cannot reschedule. (Expected for a 3-node cluster.) |
| `pve` host dies | `k3s-1` (mentolder agent) also goes down — that affects the **mentolder** cluster's dev-only pods, independent of this dev cluster's HA. Out of scope here. |

## Out of scope

- Proxmox VM-level HA / shared storage / ZFS / Ceph.
- HA for the `k3s-1` mentolder-agent role (separate concern).
- Public ingress directly into the Proxmox cluster (stays proxied via prod Traefik).
- HA Postgres (streaming replication) — dev Postgres remains single-replica on a
  replicated Longhorn volume.

## Resolved decisions

1. **VIP `10.0.0.20`** — confirmed free on the LAN and outside the DHCP range.
2. **VM template** — none exists today, so **building a cloud-init template is the
   first step of the plan** (see cutover step 0).
3. **sish / brainstorm** — not retired. brainstorm is deployed "in-cluster" in the
   only way physically possible: a consolidated sish broker on the dev cluster, with
   `brainstorm.mentolder.de` as a cert SAN + ingress, and the standalone prod broker
   retired (see 3f).
