---
title: "fleet — unified cluster consolidation (Phase 1: provision 3 CPs)"
date: 2026-05-30
status: approved
domains: [infra]
supersedes_topology: "two separate clusters (mentolder + korczewski)"
---

# fleet — Unified Cluster Consolidation

## Goal

Consolidate the two currently-separate physical clusters (`mentolder`, `korczewski`)
into **one HA Kubernetes cluster** named `fleet`. The 3 pk-hetzner nodes become the
control plane; mentolder gekko nodes plus the local k3s-1/2/3 and RPi `k3w-*` nodes
later join as workers. This re-attempts the cluster merge that was reverted on
2026-05-09 (PRs #621/#622), this time on the `--flannel-iface=<wg>` overlay fix that
was the original blocker.

This spec covers the **whole consolidation** at a roadmap level, but the **only phase
executed in the current session is Phase 1** — standing up the empty 3-CP control
plane. Everything else (workload hosting, data migration, worker join, decommission)
is documented here but deferred.

## Decisions (locked during brainstorming, 2026-05-30)

| Decision | Choice |
|---|---|
| Topology | Single unified cluster hosting both brands' workloads |
| This session's deliverable | Plan + provision the 3 control-plane nodes only (empty cluster) |
| WireGuard mesh | **Fresh** unified mesh `wg-fleet`, every node re-keyed |
| Data safety | Verify a restorable korczewski backup, THEN wipe |
| Cluster identity | New env `fleet` (own context, realm, sealed-secrets keypair) |
| Provisioning path | SSH in-place re-bootstrap of the existing pk boxes (not hcloud) |
| k3s version | `v1.36.1+k3s1` (pinned in `environments/versions.yaml`) |

## Grounding facts (verified 2026-05-30)

- `pk-hetzner-4/6/8` already run **live korczewski** as 3-CP HA etcd, k3s `v1.35.4+k3s1`,
  Ubuntu 24.04, INTERNAL-IP = wg IPs `10.13.14.1/2/3`, **EXTERNAL-IP `<none>`**.
- `hcloud` CLI is **not installed/configured**; two of three public IPs
  (`204.168.244.104`, `62.238.23.79`) are **not Hetzner Cloud ranges**. These are
  SSH-managed boxes, so provisioning is in-place over SSH, not `hcloud server create`.
- SSH as `patrick` succeeds to all three (`204.168.244.104`, `37.27.251.38`,
  `62.238.23.79`); node-token read needs sudo.
- Existing meshes: mentolder `192.168.100.0/24:51821`, korczewski `10.13.14.0/24:51820`.
- k3s default CIDRs to avoid: pods `10.42.0.0/16`, services `10.43.0.0/16`.
- Home-LAN ranges in use: `10.0.3.0/24`, `10.0.31.0/24`, `10.10.0.0/24` (GPU `10.10.0.3`).

## Phase 1 — Provision the 3 control-plane nodes (THIS SESSION)

### Scope boundary (hard)

Deliver an **empty, healthy 3-CP HA k3s cluster** named `fleet`. **No** workloads,
SealedSecrets, Longhorn, cert-manager, Flux, or data. Done when:

```
kubectl --context fleet get nodes
# 3x Ready  control-plane,etcd  v1.36.1+k3s1
```

### 1. `wg-fleet` mesh

- Subnet `10.20.0.0/24`, listen port `51820`. No overlap with pod/svc CIDRs, existing
  meshes, or home-LAN ranges.
- CP wg IPs: `pk-hetzner-4 = 10.20.0.1`, `pk-hetzner-6 = 10.20.0.2`, `pk-hetzner-8 = 10.20.0.3`.
  Workers (`.10`+) added in the worker-join phase.
- New `fleet:` block added to `wireguard/wg-mesh-nodes.yaml` listing the 3 CPs with
  freshly generated keypairs. Public keys committed; private keys sealed in
  `environments/.secrets/fleet.yaml` under `WG_MESH_PK4/PK6/PK8_FLEET_PRIVATE_KEY`.

### 2. Env identity — `environments/fleet.yaml`

Scaffolded from korczewski's shape:

```yaml
environment: fleet
context: fleet
domain: <resolved in Phase 2 — both brands>
overlay: prod-fleet      # created in Phase 2
workspace_namespace: workspace   # per-brand namespacing decided in Phase 2
```

`environments/.secrets/fleet.yaml` (gitignored) holds:
- `K3S_FLEET_TOKEN` — randomly generated k3s cluster token (closes the "untracked
  token" audit gap; tracked, sealed, never inline in a node).
- The 3 CP WireGuard private keys.

### 3. SSH in-place re-bootstrap (per node, as `patrick` + sudo)

Order: **pk-4 first (cluster-init)** → wait Ready → **pk-6**, **pk-8** (server-join).

Per node:
1. `k3s-uninstall.sh` (destroys the old korczewski k3s + local data on that node).
2. `apt-get install -y wireguard open-iscsi ufw curl jq`.
3. Write `/etc/wireguard/wg-fleet.conf` from
   `scripts/hetzner/generate-wg-conf.sh --env fleet --node-name <name> --private-key <key>`.
4. `systemctl enable --now wg-quick@wg-fleet`.
5. UFW: allow `22/tcp`; allow `51820/udp`; on `wg-fleet` allow `6443/tcp`,
   `8472/udp` (flannel vxlan), `10250/tcp` (kubelet).
6. Install k3s:
   - **pk-4:** `curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.36.1+k3s1 sh -s - server --cluster-init --flannel-iface=wg-fleet --node-ip=10.20.0.1 --tls-san=10.20.0.1 --token=$K3S_FLEET_TOKEN`
   - **pk-6/pk-8:** identical but `--server https://10.20.0.1:6443` replaces `--cluster-init`, `--node-ip` = `10.20.0.2`/`10.20.0.3`.

Then fetch `/etc/rancher/k3s/k3s.yaml` from pk-4, rewrite `server:` to
`https://10.20.0.1:6443`, merge into `~/.kube/config` as context `fleet`.

> Reachability note: the local kubeconfig server must be reachable over `wg-fleet`
> from the workstation — the workstation either joins `wg-fleet` or uses an SSH tunnel
> to `10.20.0.1:6443`. Resolve at execution time (workstation is `pk-l-1`, already a
> mesh participant on korczewski).

### 4. Backup-verify gate (runs BEFORE any `k3s-uninstall.sh`)

Wiping pk-4 destroys live korczewski. Before touching any node:
- Confirm a fresh, restorable korczewski backup exists on Filen — DB + the 4 Longhorn
  PVCs (`nextcloud-data`, `vaultwarden-data`, `docuseal-data`, `livekit-recordings`),
  via `backup-restore.sh filen-pull`.
- Record snapshot ID / timestamp here before proceeding.
- **No node is touched until this passes.**

## Phase 2+ — Deferred roadmap (documented, NOT executed this session)

1. **`prod-fleet` overlay** hosting both brands — separate namespaces, ingress hosts,
   and Keycloak realms per brand (`mentolder.de` + `korczewski.de`).
2. **Platform installs** on fleet: sealed-secrets controller → `env:fetch-cert` →
   `env:seal` → cert-manager → DNS-01 secret → Longhorn (+ `iscsid` on all nodes).
3. **Data restore** for both brands into the new cluster from Filen backups.
4. **Worker join:** re-key mentolder gekko-hetzner-2/3/4, local k3s-1/2/3, and RPi
   `k3w-1/2/3` onto `wg-fleet` (IPs `.10`+), join as agents
   (`--server https://10.20.0.1:6443 --flannel-iface=wg-fleet`).
5. **DNS cutover** for both brands to the fleet ingress.
6. **Decommission** the old mentolder and korczewski clusters + envs.

### Open downstream question (flagged, not blocking Phase 1)

Hosting both brands in one cluster: how `mentolder.de` and `korczewski.de` data
residency / DSGVO isolation is preserved when DB, storage, and Keycloak are pooled on
shared hardware. Must be resolved before Phase 2 data restore.

## Risks

- **Irreversible teardown** of live korczewski — mitigated by the Phase 1 backup gate.
- **kubeconfig reachability** over a brand-new mesh the workstation isn't on yet —
  resolved at execution (tunnel or join wg-fleet).
- **Reverted-merge precedent** — the 2026-05 merge failed on flannel-over-WireGuard;
  this design pins `--flannel-iface=wg-fleet` on every node, the documented fix.
- **k3s minor bump** v1.35.4 → v1.36.1 happens as part of the rebuild (fresh install,
  not in-place upgrade) — acceptable since etcd is recreated from scratch.

## Out of scope (this spec)

Any workload deployment, secret materialization, storage, certificates, Flux
bootstrap, data migration, worker enrollment, DNS, or decommission. Each gets its own
spec → plan when Phase 1 is verified green.
