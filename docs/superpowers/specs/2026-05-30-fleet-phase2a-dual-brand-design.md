---
title: "fleet Phase 2a — both brands on the 3 pk nodes (platform layer + dual-brand restore)"
date: 2026-05-30
status: approved
domains: [infra]
ticket: T000337
follows: docs/superpowers/specs/2026-05-30-fleet-unified-cluster-design.md
---

# fleet Phase 2a — Both Brands on the 3 pk Nodes

## Goal

Make the empty `fleet` cluster (3-CP HA on `pk-hetzner-4/6/8`, stood up in Phase 1)
**host both brands** — `mentolder` and `korczewski` — each as a self-contained stack in
its own namespace, with data restored from Filen and brand isolation proven by tests, all
on `*.korczewski.de` **test hostnames**.

This is the first executable slice of the full cutover. It deliberately stops short of:
- **DNS cutover** of the real domains (Phase 2b),
- **worker-node absorption** of mentolder's gekko/k3s/RPi nodes + arm64 taints (Phase 2c),
- **decommission** of the old clusters and the `dev.mentolder.de` migration (Phase 2c).

Done when fleet serves both brands on test hosts, data verified, isolation test green —
**without touching either live cluster**.

## Context & grounding facts (verified 2026-05-30)

- Phase 1 left an **empty** healthy 3-CP fleet: `wg-fleet 10.20.0.0/24:51820`, k3s
  `v1.36.1+k3s1`, fresh sealed-secrets keypair, `environments/fleet.yaml` scaffold +
  `environments/.secrets/fleet.yaml` (3 WG keys + k3s token). **korczewski was wiped in
  Phase 1** (its old pk nodes are now fleet CPs) → korczewski is **restore-only**.
- **mentolder is still live** on `gekko-hetzner-2/3/4` + `k3s-1/2/3` + `k3w-1/2/3` (arm64).
  Those nodes are NOT touched in 2a.
- The deploy pipeline is `kustomize build $overlay | envsubst "$ENVSUBST_VARS" | kubectl
  apply --server-side --force-conflicts`, driven by per-env `env_vars` in
  `environments/<env>.yaml`. **`envsubst` substitutes one global env_var set per render
  pass** → two brands ⇒ two separate render+apply passes (a single composite overlay is
  impossible under this model).
- Each brand overlay sets `namespace: <brand-ns>` and pulls in `../prod`, which carries
  **cluster-scoped singletons**: `IngressClass` (traefik), `ClusterIssuer`
  (letsencrypt-prod), shared `ClusterRole`/`Binding`s. The k3d base also defines
  `Namespace` objects + several ClusterRoles. Applying *both* brand overlays to one cluster
  collides on exactly these — this is what sank the reverted 2026-05 merge (PRs #621/#622).
- `prod/llm-gpu.yaml` is just `Service` + `Endpoints` pointing at external `${LLM_HOST_IP}`
  — **namespaced**, so each brand already gets its own LLM gateway. LLM is per-brand, NOT a
  platform singleton.
- `scripts/backup-restore.sh` defaults `NS=workspace` and mostly honors `--namespace`, but
  several spots hardcode `-n workspace` / `workspace-secrets` (the known ns-hardcode gap).
- pk nodes are 3× 8-CPU (per the korczewski overlay comment). Data is small
  (~246 MB Nextcloud), so capacity for 2× stacks on 3 nodes is plausible but must be checked.

## Decisions (locked during brainstorming, 2026-05-30)

| Decision | Choice |
|---|---|
| Spec scope | **Phase 2a only** (platform + dual-brand overlay + restore + isolation). 2b/2c are separate specs. |
| Brand isolation | **Separate namespaces, one shared-db pod per brand** (physical isolation; reuses existing overlays). |
| Overlay architecture | **Approach 1** — `prod-fleet/platform/` owns singletons once; existing brand overlays reused + a `fleet-omit-singletons` component; new `fleet-<brand>.yaml` env files. |
| Test hostnames | Both brands under korczewski.de: korczewski=`*.fleet.korczewski.de`, mentolder=`*.fleet-m.korczewski.de` (avoids mentolder.de DNS dependency until 2b). |
| Keycloak | Separate KC instance + realm **per brand** (automatic from per-namespace overlays). |
| LLM/GPU | Per-brand gateway Services → shared external GPU host; reuse existing `LLM_HOST_IP`. wg-fleet GPU join deferrable. |
| Live clusters | **Untouched** during 2a. |

## Architecture

### 1. Platform layer — `prod-fleet/platform/` (applied once)

Cluster-scoped, brand-agnostic, applied a single time to the fleet cluster:

- `IngressClass` (traefik), `ClusterIssuer` letsencrypt-prod (DNS-01), shared
  `ClusterRole`/`ClusterRoleBinding`s (tls-sync, claude-code-agent, etc.).
- Two wildcard `Certificate`s: `*.fleet.korczewski.de` and `*.fleet-m.korczewski.de`.
- Install-once via existing tasks, in mandated order:
  `sealed-secrets:install` → `env:fetch-cert` → cert-manager (`cert:install`) → DNS-01
  secret (`cert:secret`) → Longhorn (+ `iscsid`/`open-iscsi` on all 3 pk nodes).

### 2. Per-brand workloads (reuse existing overlays, retargeted to `context=fleet`)

| Brand | Namespaces | Test hosts |
|---|---|---|
| mentolder | `workspace` (+ `website`) | `*.fleet-m.korczewski.de` |
| korczewski | `workspace-korczewski` (+ `website-korczewski`) | `*.fleet.korczewski.de` |

- Each reuses its **existing** `prod-mentolder/` / `prod-korczewski/` overlay for the
  namespaced workload.
- Each gains a new kustomize **component** `prod-fleet/components/fleet-omit-singletons/`
  that `$patch: delete`s the cluster-scoped objects (ClusterIssuer, IngressClass, shared
  ClusterRoles/Bindings) and the base `Namespace` resources, so **only the platform layer
  owns them**. This is the explicit, symmetric fix for the SharedResourceWarning that
  doomed the reverted merge.
- Each brand keeps its **own** shared-db pod + PVC, Keycloak instance + realm, and
  llm-gateway Services. No cross-namespace DB access; no shared Postgres process.

### 3. Env identity

- `environments/fleet.yaml` — cluster identity only (context, k3s token, mesh). Already
  scaffolded; `domain` placeholder stays (per-brand domains live in the brand env files).
- **NEW** `environments/fleet-mentolder.yaml` and `environments/fleet-korczewski.yaml` —
  brand `env_vars` copied from the live `mentolder.yaml`/`korczewski.yaml`, with:
  - `context: fleet`
  - node-affinity lists → `pk-hetzner-4/6/8`
  - domains → the 2a test hostnames (`*.fleet[-m].korczewski.de`)
  - dev-stack vars disabled (dev migration is 2c)
- Both brands' plaintext secrets re-sealed against **fleet's** sealing cert →
  `environments/sealed-secrets/fleet-mentolder.yaml` + `fleet-korczewski.yaml`.
  (Phase-1 keypair rotation means old sealed files won't decrypt — re-seal is mandatory.)

### 4. Data restore (both brands, from Filen)

- `scripts/backup-restore.sh filen-pull <timestamp>` pulls each brand's latest bundle into
  `backup-pvc`.
- **Fix the ns-hardcode gap** in `backup-restore.sh`: every `-n workspace` /
  `workspace-secrets` reference must respect `--namespace`, so korczewski restores into
  `workspace-korczewski`. A BATS test covers the parameterization.
- Per-brand sequence: deploy stack (creates empty PVCs/DBs) → scale apps to 0 → restore DB
  (`psql` from dump) + restore the 4 Longhorn PVCs (nextcloud/vaultwarden/docuseal/
  livekit-recordings) via the mounter-pod pattern → scale apps up → **verify**.
- **Verification:** DB row counts non-zero for key tables; Nextcloud file listing shows
  restored files; Vaultwarden/DocuSeal reachable.

### 5. Backup infra on fleet

- `pvc-backup` CronJob deployed per brand (via `patch-backup-config`), re-pointed at the
  fleet cluster, Filen credentials sealed for fleet. A manual trigger must produce a green
  Filen upload for both brands.

### 6. Isolation tests (DSGVO proof; formal audit deferred)

- **NetworkPolicy negative test:** a pod in `workspace-korczewski` cannot reach a
  `workspace` (mentolder) Service (e.g. `shared-db` or `keycloak`) — connection refused/timed
  out. The reverse also holds.
- Keycloak realms independent: a token from one brand's realm is rejected by the other.
- These run as new test IDs in the `tests/` framework (SA-class, services project).

### 7. Deploy orchestration

- **NEW** `task fleet:deploy` (in `Taskfile.yml`) fans out:
  1. `prod-fleet/platform/` applied once (after the platform install tasks).
  2. brand **mentolder**: source `fleet-mentolder.yaml` → build `prod-mentolder` + omit
     component → envsubst → `kubectl apply --context fleet`.
  3. brand **korczewski**: same with `fleet-korczewski.yaml` → `prod-korczewski`.
- Honors the `ENV != dev` context-mismatch guard; aborts if the active context ≠ fleet.

## Acceptance criteria (DoD)

- [ ] Both brands' workloads `Running` on fleet (3 pk nodes).
- [ ] `web.fleet.korczewski.de` AND `web.fleet-m.korczewski.de` load over real TLS.
- [ ] Keycloak SSO login works for both brands on the test hosts.
- [ ] Both brands' data restored + verified (DB rows + Nextcloud files visible).
- [ ] `pvc-backup` CronJob green on fleet (Filen upload succeeds) for both brands.
- [ ] Isolation netpol test green (cross-namespace block, both directions).
- [ ] `task fleet:deploy` is idempotent (second run is a no-op / clean re-apply).
- [ ] `backup-restore.sh --namespace` parameterization covered by a BATS test.

## Out of scope (this spec)

DNS cutover of real domains (2b); worker-node absorption + arm64 taints + dev.mentolder.de
migration + decommission (2c); OpenClaw; application code changes (Website/Brett/arena —
deploy only); formal DSGVO audit/documentation.

## Risks & mitigations

- **Capacity** — 2× full stacks on 3 nodes. Data is tiny but pod count doubles. Mitigation:
  capacity sanity-check (`kubectl top nodes`) after each brand deploy; scale down
  non-essential workloads if pressured.
- **backup-restore.sh ns-hardcode** — korczewski restore fails into the wrong ns if not
  fixed. Mitigation: explicit parameterization task + BATS coverage before the korczewski
  restore step.
- **Sealed-secrets keypair rotation** — old sealed files won't decrypt on fleet.
  Mitigation: re-seal both brands against the fleet cert (mandated ordering).
- **LLM reachability** — `LLM_HOST_IP` is a tailscale IP; verify fleet nodes reach it,
  else `LLM_ENABLED=false` temporarily for 2a (korczewski bge-m3 indexing degraded but not
  blocking). wg-fleet GPU join is a later refinement.
- **flannel-over-wg** — already proven healthy in Phase 1 with `--flannel-iface=wg-fleet`;
  adding workloads should not regress it. Abort criterion: pod-to-pod across nodes fails.

## Assets still to procure (carried into the plan)

- [ ] Confirmed restorable Filen snapshot timestamps for **both** brands (DB + 4 PVCs each).
- [ ] Verify fleet nodes can reach `LLM_HOST_IP` (tailscale) before enabling LLM.
- [ ] Capacity check: 3 pk nodes hosting both stacks through the 2a window.
