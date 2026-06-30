---
title: "traefik-hostport-clientip — Implementation Plan"
ticket_id: T001341
domains: [infra]
status: active
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# traefik-hostport-clientip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kube-system/traefik` deliver the real external client IP to
backend services (Pocket ID's per-IP rate limiter, in particular) by removing
the k3s ServiceLB (`klipper-lb`) re-origination hop T001328 didn't account for.

**Architecture:** Add the one missing key (`service.spec.type: ClusterIP`) to
the already-committed `prod/traefik-values.yaml`, so Traefik's own
already-committed `ports.*.hostPort` bind becomes the sole public entry point
on the 3 fleet public nodes instead of competing with `klipper-lb` for the
same host ports.

**Tech Stack:** Kubernetes (k3s Addon `HelmChart`/`HelmChartConfig` CRDs,
fleet cluster), Helm values (YAML), BATS (`tests/spec/fleet-operations.bats`),
`yq`.

## Global Constraints

- `kube-system/traefik` is shared by both brands (`workspace` +
  `workspace-korczewski`) — no per-brand variant.
- `kube-system/traefik` is a k3s Addon-managed `HelmChart`, reconciled by
  k3s' own `helm-controller` from `HelmChart.spec.valuesContent` merged with
  `HelmChartConfig.spec.valuesContent`. Live changes MUST go through
  `kubectl patch helmchartconfig traefik -n kube-system` — a bare `helm
  upgrade traefik traefik/traefik --set ...` gets silently overwritten on
  the controller's next reconcile.
- No live cluster in CI — BATS coverage is manifest-structure only
  (`prod/traefik-values.yaml`); live behavior is verified manually in Task 4.
- Branch: `fix/t001341-traefik-hostport-clientip`. Worktree:
  `/home/patrick/Bachelorprojekt/tmp/wt-t001341-metallb`.

---

## File Structure

| File | Change |
|------|--------|
| `prod/traefik-values.yaml` | Modify — add `service.spec.type: ClusterIP` |
| `tests/spec/fleet-operations.bats` | Already modified (this planning session) — 3 new `@test` blocks |
| `openspec/changes/traefik-hostport-clientip/{proposal,design,specs,tasks}.md` | New — this change |

---

## 1. Verify the existing failing test (RED)

**Files:**
- Test (already written this session): `tests/spec/fleet-operations.bats`

**Interfaces:**
- Consumes: `yq` CLI (already a test-suite dependency, used by the
  neighboring T001328 tests in the same file).
- Produces: nothing new — this task only confirms the RED state the
  brainstorming/planning session already put in place.

- [ ] 1.1 Confirm the new test exists and is red

The brainstorming session for this ticket already added this block to
`tests/spec/fleet-operations.bats` (directly after the T001328 tests):

```bash
@test "prod/traefik-values.yaml sets service.spec.type: ClusterIP (removes klipper-lb)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.service.spec.type' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "ClusterIP" ]
}
```

Run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
```
Expected: FAIL on `prod/traefik-values.yaml sets service.spec.type:
ClusterIP (removes klipper-lb)` — `service.spec.type` is not yet set in
`prod/traefik-values.yaml`. (A pre-existing, unrelated failure — `fleet-*
sealed secrets contain all non-legacy keys...` — is known sealed-secrets-key
drift in `fleet-mentolder.yaml`, documented under T001328, not part of this
ticket's scope; ignore it.)

- [ ] 1.2 Confirm the two regression-guard tests are already green

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats 2>&1 | grep -E "^(ok|not ok) (7|8) "
```
Expected: `ok 7 prod/traefik-values.yaml exposes Traefik directly via
hostPort 80/443` and `ok 8 prod/traefik-values.yaml uses
maxUnavailable=1/maxSurge=0 (hostPort can't share a port)` — both already
pass, since `ports.*.hostPort`/`updateStrategy` were already committed in
`prod/traefik-values.yaml` during T001328 (just never applied live).

---

## 2. Fix: add `service.spec.type: ClusterIP`

**Files:**
- Modify: `prod/traefik-values.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: the `service.spec.type` key the Task 1 test asserts on.

- [ ] 2.1 Add `service.spec.type: ClusterIP` to the `service.spec` block

In `prod/traefik-values.yaml`, the file currently ends with:

```yaml
service:
  spec:
    externalTrafficPolicy: Local
```

Change it to:

```yaml
# T001341: removes k3s' ServiceLB (klipper-lb) for this Service entirely —
# k3s' ServiceLB controller only manages Services of type: LoadBalancer.
# Without this, klipper-lb's svclb-traefik DaemonSet keeps claiming
# hostPort 80/443 on the same 3 nodes Traefik's own pods now also bind
# directly (see ports.web/websecure.hostPort above), and the new Traefik
# pods would stay Pending ("didn't have free ports for the requested pod
# ports"). externalTrafficPolicy has no effect once type is ClusterIP —
# left in place as a harmless no-op rather than removed in this PR.
service:
  spec:
    type: ClusterIP
    externalTrafficPolicy: Local
```

- [ ] 2.2 Run the test to verify it passes

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
```
Expected: PASS on `prod/traefik-values.yaml sets service.spec.type:
ClusterIP (removes klipper-lb)` (test 6). Tests 2-5, 7, 8 remain PASS. Test 1
(sealed-secrets drift) remains the pre-existing unrelated failure from Task 1.1.

- [ ] 2.3 Commit

```bash
git add prod/traefik-values.yaml tests/spec/fleet-operations.bats
git commit -m "fix(infra): remove klipper-lb for kube-system/traefik via service.spec.type [T001341]"
```

---

## 3. Local verification + CI gates

- [ ] 3.1 Validate the YAML parses and the full file is well-formed

```bash
yq eval '.' prod/traefik-values.yaml > /dev/null
echo "exit: $?"
```
Expected: `exit: 0`.

- [ ] 3.2 Run the three mandatory verify gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: all three exit 0. `task test:changed` re-runs
`tests/spec/fleet-operations.bats` among the changed-file-scoped suite (same
results as Task 2.2, test 1's pre-existing unrelated failure aside).

---

## 4. Manual production rollout (NOT part of the automated merge/deploy path)

**This is the actual fix for the live bug** — merging this PR does not
change cluster behavior automatically, since `kube-system/traefik` is a k3s
Addon (`HelmChart`/`HelmChartConfig`), not Kustomize/GitOps-managed. Tasks
1-3 only prepare and test the committed manifest; this task applies it live.

**Blast Radius:** Cluster-wide, affects ingress for BOTH brands (mentolder +
korczewski) and every service behind Traefik — not just Pocket ID. Run
during a quiet traffic window. Have the rollback command ready before
starting.

**Sequencing is mandatory (see design.md Decision 3):** `service.spec.type`
and `ports.*.hostPort`/`updateStrategy` are applied together, in one patch —
NOT staged across two manually-verified steps like T001328's rollout was.
Splitting them creates a window where neither `klipper-lb` nor Traefik's own
hostPort bind covers all 3 nodes (outage), or where the new Traefik pods are
scheduler-rejected (`Pending`) because `klipper-lb` still holds the hostPorts.

- [ ] 4.1 Record current state for rollback reference

```bash
kubectl --context fleet -n kube-system get helmchartconfig traefik -o yaml > /tmp/helmchartconfig-traefik-before-t001341.yaml
kubectl --context fleet -n kube-system get pods -l app.kubernetes.io/name=traefik -o wide
kubectl --context fleet -n kube-system get pods -l svccontroller.k3s.cattle.io/svcname=traefik -o wide
```

- [ ] 4.2 Apply the combined patch

```bash
kubectl --context fleet -n kube-system patch helmchartconfig traefik --type merge -p '{
  "spec": {
    "valuesContent": "metrics:\n  prometheus:\n    entryPoint: metrics\n    addRoutersLabels: true\nports:\n  metrics:\n    port: 9101\n    expose:\n      default: false\n    exposedPort: 9101\n    protocol: TCP\n  web:\n    hostPort: 80\n  websecure:\n    hostPort: 443\nupdateStrategy:\n  type: RollingUpdate\n  rollingUpdate:\n    maxUnavailable: 1\n    maxSurge: 0\ndeployment:\n  kind: DaemonSet\naffinity:\n  nodeAffinity:\n    requiredDuringSchedulingIgnoredDuringExecution:\n      nodeSelectorTerms:\n        - matchExpressions:\n            - key: kubernetes.io/hostname\n              operator: In\n              values:\n                - pk-hetzner-4\n                - pk-hetzner-6\n                - pk-hetzner-8\nservice:\n  spec:\n    type: ClusterIP\n    externalTrafficPolicy: Local\n"
  }
}'
```

- [ ] 4.3 Confirm `klipper-lb` is gone

```bash
kubectl --context fleet -n kube-system get pods -l svccontroller.k3s.cattle.io/svcname=traefik
```
Expected: no resources found (the `svclb-traefik` DaemonSet and its pods are
deleted by k3s' ServiceLB controller once the Service is no longer
`type: LoadBalancer`).

- [ ] 4.4 Watch the Traefik DaemonSet roll, node by node

```bash
kubectl --context fleet -n kube-system get pods -l app.kubernetes.io/name=traefik -o wide -w
```
Watch until the first node's pod reaches `Running`/`1/1 Ready`, then proceed
to 4.5 **before** the remaining nodes finish rolling.

- [ ] 4.5 Verify the first rolled node directly (real client IP, reachable)

```bash
FIRST_NODE_IP="<public IP of whichever node rolled first — one of 204.168.244.104, 37.27.251.38, 62.238.23.79>"
curl -sI --resolve auth.korczewski.de:443:"$FIRST_NODE_IP" https://auth.korczewski.de/.well-known/openid-configuration | head -1
curl -sI --resolve auth.mentolder.de:443:"$FIRST_NODE_IP" https://auth.mentolder.de/.well-known/openid-configuration | head -1
curl -s -A "T001341-verify-$(date +%s)" --resolve auth.korczewski.de:443:"$FIRST_NODE_IP" https://auth.korczewski.de/ -o /dev/null
kubectl --context fleet -n workspace-korczewski logs deploy/pocket-id --tail=20 | grep -oE 'ip=[0-9.]+' | sort -u
```
Expected: both `curl -I` calls return `HTTP/2 200` (or another non-5xx); the
`pocket-id` log grep shows the real external IP your curl call originated
from — **not** a `10.42.0.0/16` address. If anything looks wrong, go
immediately to Task 4.7 (rollback) instead of continuing to 4.6.

- [ ] 4.6 Allow the rollout to finish, then repeat verification for all 3 nodes

```bash
kubectl --context fleet -n kube-system get pods -l app.kubernetes.io/name=traefik -o wide
for ip in 204.168.244.104 37.27.251.38 62.238.23.79; do
  echo "=== $ip ==="
  curl -sI --resolve auth.korczewski.de:443:"$ip" https://auth.korczewski.de/.well-known/openid-configuration | head -1
done
kubectl --context fleet -n workspace-korczewski logs deploy/pocket-id --tail=50 | grep -oE 'ip=[0-9.]+' | sort -u
```
Expected: all 3 public IPs return a healthy response; no `10.42.0.0/16`
addresses in the recent Pocket ID logs for real-client requests.

- [ ] 4.7 Rollback (any time, if a public endpoint becomes unreachable or a
      node's Traefik pod stays `Pending`)

```bash
kubectl --context fleet -n kube-system patch helmchartconfig traefik --type merge -p '{
  "spec": {
    "valuesContent": "metrics:\n  prometheus:\n    entryPoint: metrics\n    addRoutersLabels: true\nports:\n  metrics:\n    port: 9101\n    expose:\n      default: false\n    exposedPort: 9101\n    protocol: TCP\ndeployment:\n  kind: DaemonSet\naffinity:\n  nodeAffinity:\n    requiredDuringSchedulingIgnoredDuringExecution:\n      nodeSelectorTerms:\n        - matchExpressions:\n            - key: kubernetes.io/hostname\n              operator: In\n              values:\n                - pk-hetzner-4\n                - pk-hetzner-6\n                - pk-hetzner-8\nservice:\n  spec:\n    externalTrafficPolicy: Local\n"
  }
}'
```
This restores the exact `valuesContent` that was live before Task 4.2 (no
`ports.web/websecure.hostPort`, no `updateStrategy`, no `service.spec.type`
override) — `klipper-lb`'s `svclb-traefik` DaemonSet is recreated
automatically by k3s once the Service is `type: LoadBalancer` again
(the chart default).

- [ ] 4.8 Record the outcome on the ticket

Append a comment to T001341 (via `ticket.sh` or the `ticket-mcp`
`add_comment` tool) noting: rollout timestamp, which of Task 4.6/4.7 was the
outcome, and the `ip=` values observed in the Pocket ID logs.

- [ ] Task 4.5 verified (first node)
- [ ] Task 4.6 verified (all 3 nodes) OR Task 4.7 executed (rollback)
