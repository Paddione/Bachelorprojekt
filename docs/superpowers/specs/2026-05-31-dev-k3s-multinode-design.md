# Design: dev.mentolder.de → 3-node HA k3s cluster

**Date:** 2026-05-31
**Branch:** `feature/dev-k3s-multinode`
**Status:** design

## Problem

The `dev.mentolder.de` stack runs as a **single-node k3d** cluster on one VM
(`mentolder-dev`, 10.0.0.26, on Proxmox node dev3). k3d is k3s-inside-Docker:
the entire cluster lives on one Docker daemon = one VM = one physical host, so
it cannot use CPU/RAM from the other two dev Proxmox nodes, and there is no real
multi-node storage. A latent bug compounds this: `k3d/dev-stack/shared-db-dev.yaml`
declares `storageClassName: longhorn`, but Longhorn is never installed on the
single-node k3d cluster.

Now that the 3-node dev Proxmox cluster (**dev1** 10.0.0.9, **dev2** 10.0.0.11,
**dev3** 10.0.0.25) is formed and quorate, we want a real multi-node Kubernetes
dev cluster that uses all three nodes for CPU/RAM and runs Longhorn with 3-way
replication.

## Decision summary (from brainstorming)

| Decision | Choice |
|---|---|
| k8s layer | **Real k3s multi-node** (not k3d). k3d retained only for laptop-local dev. |
| Control-plane | **3-server HA embedded-etcd** — all three VMs are schedulable servers. |
| Worker placement | **Dedicated VM per Proxmox node** (no agent-on-hypervisor). |
| Pod networking | **Flannel over the LAN** (10.0.0.0/24). No WireGuard for cluster traffic. |
| dev3 VM | **Reuse** the existing 10.0.0.26 VM as the bootstrap (`--cluster-init`) server. |
| VM sizing | **4 vCPU / 8 GB / 80 GB** per VM. |
| Plan scope | **Full migration** (provisioning + bootstrap + Longhorn + task/port rework + docs). |

## Current state (verified 2026-05-31)

Three VMs already exist — one per Proxmox node — and their IPs already match the
target layout:

| Proxmox node | VMID | VM name | IP | k8s state | RAM now |
|---|---|---|---|---|---|
| dev3 (10.0.0.25) | 9002 | `mentolder-dev`   | 10.0.0.26/24 | **k3d** single-node running (server-0 + serverlb) | 6 GB |
| dev1 (10.0.0.9)  | 9003 | `mentolder-dev-2` | 10.0.0.27/8  | empty (Docker + dev tools, no cluster) | 6 GB |
| dev2 (10.0.0.11) | 9004 | `mentolder-dev-3` | 10.0.0.28/8  | empty (Docker + dev tools, no cluster) | 6 GB |

Host capacity (each): 15 GB RAM (~11–13 GB free), local-lvm thin pool 350–855 GB free.
Sizing to 8 GB RAM is comfortably within budget.

Two deltas to correct during provisioning:
- VMs are **6 GB**, target is **8 GB** → bump memory to 8192 on all three.
- Workers use a **`/8` netmask** (`10.0.0.27/8`, `10.0.0.28/8`); dev3 VM is `/24`
  → normalize all three to `/24` to match the LAN and avoid routing ambiguity.

## Target architecture

### Topology

Three k3s **servers** with embedded etcd (HA quorum of 3). k3s servers are
schedulable by default, so each is also a worker — no separate agent VMs.

```
dev1 host (10.0.0.9)   ── VM mentolder-dev-2 (10.0.0.27) ── k3s server + etcd  ┐
dev2 host (10.0.0.11)  ── VM mentolder-dev-3 (10.0.0.28) ── k3s server + etcd  ├─ HA etcd (3)
dev3 host (10.0.0.25)  ── VM mentolder-dev   (10.0.0.26) ── k3s server + etcd  ┘  bootstrap (--cluster-init)
```

- **Bootstrap server:** 10.0.0.26 runs `k3s server --cluster-init` (the reused dev3 VM).
- **Joining servers:** 10.0.0.27 and 10.0.0.28 join with
  `--server https://10.0.0.26:6443 --token <node-token>`.
- All run with `--node-ip=10.0.0.2x`, `--disable=metrics-server` (matching the
  current dev flag), Traefik left **enabled** (built-in k3s ingress, as in dev today).

### Networking

- **Flannel backend over the LAN.** All nodes are on `10.0.0.0/24`, so flannel
  uses the LAN interface directly (`--node-ip`, default flannel-iface = the LAN
  route). No WireGuard for intra-cluster pod traffic.
- **wg-mesh stays on the VMs** only for off-LAN reachability — specifically the
  nightly **prod → dev DB refresh** path (the prod-side `dev-db-refresh` CronJob
  streams `pg_dump` into `shared-db-dev`). This path MUST be preserved; see below.

### Service exposure (the k3d → k3s change)

Today the dev stack is reached via **k3d host-port mappings** baked into
`dev:cluster:create`:

| Purpose | k3d mapping (today) |
|---|---|
| Traefik HTTP | `127.0.0.1:18080 → 80@loadbalancer` |
| sish SSH broker | `0.0.0.0:2222 → 2222@loadbalancer` |
| Postgres (shared-db-dev) | `127.0.0.1:15432 → 30000@loadbalancer` |

With real k3s there is no k3d loadbalancer container. Exposure moves to the
**node IP on the LAN (10.0.0.26)** via k3s's built-in ServiceLB (klipper) /
NodePorts:

| Purpose | k3s exposure (target) |
|---|---|
| Traefik HTTP | `10.0.0.26:80` (klipper LoadBalancer on the node) |
| sish SSH broker | NodePort on `10.0.0.26` (e.g. 32222), firewall-gated as today |
| Postgres | NodePort `30000` on `10.0.0.26` (unchanged port number) |

`dev:*` tasks that hardcode `127.0.0.1:1xxxx` (notably `dev:db:refresh` →
`PGHOST=127.0.0.1 PGPORT=15432`, and `dev:tunnel`) are updated to target the node
IP `10.0.0.26` on the LAN, with an optional SSH-tunnel helper for laptop access
from off-LAN. The UFW rules in the worker cloud-init mirror the dev-vm rules
(18080/15432 LAN-only, 2222 per-CIDR via `dev:firewall:open`).

### Storage — Longhorn

- Install **Longhorn** via the existing-but-unused
  `k3d/dev-cluster/longhorn-helmchart.yaml` (`defaultReplicaCount: 3`). `open-iscsi`
  is already in the dev-vm cloud-init and is added to the worker cloud-init.
- This **fixes the latent storageClass bug**: `shared-db-dev.yaml` already asks for
  `storageClassName: longhorn`; after install it is real and 3-replicated across
  the three nodes. Other dev-stack PVCs stay on `local-path` unless they need HA.

## Components & build sequence

1. **Worker cloud-init + provisioning**
   - `prod/cloud-init-dev-worker.yaml`: clone of `cloud-init-dev-vm.yaml` (users,
     wg-mesh, UFW, sysctl, `open-iscsi`, dev tools). No k3d-specific bits required.
   - `scripts/provision-dev-worker.sh`: mirror of `provision-dev-vm.sh` for dev1/dev2.
   - Since the VMs already exist, provisioning is **idempotent reconcile**: bump
     RAM 6→8 GB, grow disk to 80 GB, normalize netmask to `/24`, ensure
     `open-iscsi`/sysctl present. (Re-create only if reconcile is impractical.)

2. **k3s HA bootstrap** — new task path (e.g. `dev:cluster:create` gains a k3s mode,
   or a parallel `dev:k3s:*` namespace):
   - Tear down the k3d cluster on 10.0.0.26 (`k3d cluster delete mentolder-dev`).
   - Install `k3s server --cluster-init` on 10.0.0.26; capture node-token.
   - Install `k3s server --server https://10.0.0.26:6443` on 10.0.0.27 & 10.0.0.28.
   - Fetch kubeconfig, rewrite server URL to `https://10.0.0.26:6443`, merge into
     `~/.kube/config` (context `mentolder-dev`).

3. **Longhorn install** — apply `longhorn-helmchart.yaml`; wait for the
   `longhorn` storageClass; verify 3 healthy nodes.

4. **Deploy dev-stack** — `k3d/dev-stack/` overlay is unchanged
   (namespace `workspace-dev`, sish, MCP, website/brett, wildcard ingress).
   Secrets materialization (`dev:_materialise-secrets`) unchanged.

5. **Task & exposure rework** — update `dev:*` tasks for node-IP exposure and the
   k3s (not k3d) lifecycle; keep `k3d`-based laptop-local path working.

6. **Docs & memory** — update the dev-stack section of `CLAUDE.md`, the
   `dev k3d cluster access` and `k3s-1` memories, and the SSH bundle (add
   `dev-vm-2`/`dev-vm-3` aliases for 10.0.0.27/.28).

## What stays the same

- `k3d/dev-stack/` kustomize overlay and `workspace-dev` namespace.
- Secrets materialization, the `dev-db-refresh` semantics (prod→dev), the
  `dev:firewall:open` allowlist task, the sish tunnel UX.
- The `k3d` binary and a k3d-based path for **laptop-local** development.

## Constraints & risks

- **Preserve prod→dev DB refresh.** The prod-side CronJob must still reach
  `shared-db-dev` (now NodePort 30000 on 10.0.0.26 over LAN/wg). Verify after cutover.
- **etcd on 3 nodes needs odd quorum** — 3 is correct; losing one node keeps quorum.
- **No CP HA load balancer.** Joining servers point at the fixed bootstrap IP
  `10.0.0.26:6443`. If `.26` is down, `kubectl`/joins need a healthy endpoint; for a
  dev cluster this is acceptable (could later add a VIP). Documented, not solved here.
- **MTU:** LAN flannel avoids the wg MTU penalty; ensure flannel uses the LAN iface,
  not a wg interface, on each node.
- **Memory-corruption history** affected the *old* k3s-1 VM (VMID 9001 on pve
  10.0.0.7), a different host. The new VMs are on dev1/dev2/dev3; no action needed,
  but watch for instability after bring-up.

## Testing / acceptance

- BATS unit/manifest tests (`task test:all`) stay green; manifest validation for
  any new/changed YAML.
- After bring-up: `kubectl get nodes` shows 3 `Ready` servers; `kubectl get
  storageclass` shows `longhorn`; a test PVC binds with 3 healthy replicas.
- `web.dev.mentolder.de` / `brett.dev.mentolder.de` reachable via the wildcard
  ingress; sish tunnel publishes a service; Postgres reachable on `10.0.0.26:30000`.
- Pod scheduling observed across all three nodes (anti-affinity or manual check).
