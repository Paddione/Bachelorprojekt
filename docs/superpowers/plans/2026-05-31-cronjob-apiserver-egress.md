---
title: CronJob API-server egress + drift fixes Implementation Plan
ticket_id: T000368
domains: [infra, ops, test]
status: active
pr_number: null
---

# CronJob API-server egress + drift fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the nightly (03:00 UTC) failures of the `pvc-backup` (T000368) and `tests-results-retention` (T000369) CronJobs on both fleet brands by closing a NetworkPolicy egress gap and removing two pieces of post-consolidation manifest drift.

**Root cause (already diagnosed — do NOT re-investigate the cluster):** `wg-fleet` is healthy. The failures come from the `default-deny-egress` NetworkPolicy in `workspace`/`workspace-korczewski`: no policy permits egress to the Kubernetes API server, so in-cluster `kubectl` calls fail with `dial tcp 10.43.0.1:443: connection refused`. **Proven empirically:** kube-router evaluates egress against the *post-DNAT* endpoint — the apiserver is hostNetwork, so its endpoints are the CP **node IPs `10.20.0.0/24:6443`**, not the ClusterIP. Allowing only `10.43.0.0/16:443` does NOT work (kubectl still fails); adding `10.20.0.0/24:6443` → 12/12 reachable + `kubectl get --raw /version` OK.

Two compounding bugs in the same blast radius:
- `pvc-backup` orchestrator hardcodes `NS=workspace` in its container args. kustomize namespace-remapping does not rewrite string literals, so on korczewski (ns `workspace-korczewski`) the SA operates in `workspace` and hits RBAC `Forbidden`.
- `pvc-backup` mounter `nodeAffinity` excludes decommissioned node names (`k3s-1/2/3`, `k3w-1/2/3`) that no longer exist on fleet (dead no-op drift).
- `tests-results-retention` requires `nodeAffinity` `node-location=hetzner`; no fleet node carries that label → unschedulable on all 6 nodes.

**Architecture:** All fixes are in the shared `k3d/` base (consumed by both prod overlays via the namespace directive), so a single change fixes both brands. The new `allow-apiserver-egress` NetworkPolicy mirrors the existing namespace-wide allow policies (`allow-dns-egress`, `allow-internet-egress`) — podSelector `{}`, tightly scoped to the apiserver ports/CIDRs. API access is RBAC-gated, so a namespace-wide egress allow is low-risk and is consistent with `allow-cronjobs-to-website-egress` (which also uses `podSelector: {}` because short-lived CronJob pods have no stable label).

**Tech Stack:** Kustomize, kubectl, BATS (`tests/unit/manifests.bats`).

**Spec/diagnosis source:** memory `reference_workspace_apiserver_egress_gap`. **Tickets:** T000368 (major), T000369 (trivial).

---

## Failing tests (already written & RED — `tests/unit/manifests.bats`)

- [ ] `network-policies grant egress to the Kubernetes apiserver (T000368)` — asserts a NetworkPolicy egresses to `10.20.0.0/24:6443` **and** `10.43.0.0/16:443`.
- [ ] `pvc-backup derives namespace at runtime, not hardcoded NS=workspace (T000368)`
- [ ] `pvc-backup mounter nodeAffinity has no decommissioned node names (T000368)`
- [ ] `tests-results-retention has no stale node-location affinity (T000369)`

These 4 tests are committed alongside this plan and currently fail (proven red). Each task below turns one or more green.

## Task 1 — Add `allow-apiserver-egress` NetworkPolicy (T000368)

- [ ] In `k3d/network-policies.yaml`, append a new `NetworkPolicy` named `allow-apiserver-egress`:
  - `podSelector: {}`, `policyTypes: [Egress]`
  - egress rule 1: `to: [{ipBlock: {cidr: 10.20.0.0/24}}]`, `ports: [{port: 6443, protocol: TCP}]` — fleet CP node IPs (post-DNAT apiserver endpoints). Comment why the node CIDR (not ClusterIP) is the operative allow.
  - egress rule 2: `to: [{ipBlock: {cidr: 10.43.0.0/16}}]`, `ports: [{port: 443, protocol: TCP}]` — ClusterIP (defense-in-depth / clusters matching pre-DNAT).
- [ ] Verify: `kubectl kustomize k3d/ | grep -A12 allow-apiserver-egress` shows both CIDRs/ports.
- [ ] Test `network-policies grant egress to the Kubernetes apiserver` goes green.

## Task 2 — Derive pvc-backup namespace at runtime (T000368)

- [ ] In `k3d/pvc-backup-cronjob.yaml` orchestrator script, replace `NS=workspace` with:
  `NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)`
- [ ] Confirm no other hardcoded `workspace` namespace literal remains in the orchestrator/mounter args (the mounter `apply` uses `-n "$NS"` via the orchestrator; clones/jobs are created with `-n "$NS"`). The metadata `namespace: workspace` on the CronJob object itself stays (kustomize remaps it per overlay).
- [ ] Test `pvc-backup derives namespace at runtime` goes green.

## Task 3 — Remove stale mounter nodeAffinity (T000368)

- [ ] In `k3d/pvc-backup-cronjob.yaml`, the mounter Job's `nodeAffinity` `NotIn [k3s-1,k3s-2,k3s-3,k3w-1,k3w-2,k3w-3]` references dead nodes. The mounter is already co-located with the nextcloud pod via `podAffinity` (required, topology hostname), which is what makes nextcloud's local-path volume shareable. Remove the dead `nodeAffinity` block (keep `podAffinity`) — the podAffinity is sufficient and the NotIn list was a no-op on fleet.
- [ ] Verify the mounter still renders with the nextcloud `podAffinity` intact: `kubectl kustomize k3d/ | grep -B2 -A6 'app: nextcloud'`.
- [ ] Test `pvc-backup mounter nodeAffinity has no decommissioned node names` goes green.

## Task 4 — Remove stale tests-results-retention nodeAffinity (T000369)

- [ ] In `k3d/tests-retention-cronjob.yaml`, remove the `affinity.nodeAffinity` block requiring `node-location In [hetzner]`. The prune job only `kubectl exec`s into the website pod and is placement-independent. It will rely on the new `allow-apiserver-egress` policy (Task 1) to reach the API for the exec.
- [ ] Test `tests-results-retention has no stale node-location affinity` goes green.

## Task 5 — Verify & validate

- [ ] `./tests/runner.sh local manifests` — all green (incl. the 4 new tests).
- [ ] `task test:all` — green (offline CI parity).
- [ ] `task workspace:validate` — manifests valid.
- [ ] `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — regenerate + commit if changed (4 new test IDs).

## Deploy (post-merge, via dev-flow-execute)

- [ ] `task feature:deploy` (fans out `k3d/`+overlay changes to both fleet brands) — files touched are `k3d/**`.
- [ ] Post-deploy verification (live):
  - Confirm `allow-apiserver-egress` exists in both namespaces: `kubectl --context fleet -n workspace get netpol allow-apiserver-egress` (and `-n workspace-korczewski`).
  - Manually trigger a backup run and confirm the orchestrator reaches the API on a gekko-hosted pod:
    `kubectl --context fleet -n workspace create job --from=cronjob/pvc-backup pvc-backup-manual-verify` → check it gets past "Creating clone PVCs" (no `connection refused`).
  - For korczewski, confirm no `Forbidden ... namespace "workspace"` in the orchestrator log (namespace now runtime-derived).
  - Unsuspend/confirm `tests-results-retention` schedules (no longer `Unschedulable`).
  - Clean up the manual verify job afterward.

## Notes / out of scope

- **No host/wireguard changes.** `wg-fleet` is healthy; the original T000368 "ClusterIP unreachable" framing pointed at networking but the cause is the netpol egress gap. Update T000368 with the corrected root cause on close.
- Dev k3d (single-node) is unaffected by the node-CIDR allow (harmless unused rule there).
