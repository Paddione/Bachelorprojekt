---
title: "ops-pods-not-ready"
ticket_id: "T002097"
domains: [infra, security]
status: "plan_staged"
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ops-pods-not-ready — Implementation Plan

## File Structure

- `environments/.secrets/korczewski.yaml` (existing, +1 line) — add missing `POCKET_ID_TERMINAL_SECRET` key
- `environments/.secrets/fleet-korczewski.yaml` (existing, +1 line) — add missing `POCKET_ID_TERMINAL_SECRET` key
- `environments/sealed-secrets/korczewski.yaml` (existing, regenerated) — resealed after key add
- `environments/sealed-secrets/fleet-korczewski.yaml` (existing, regenerated) — resealed after key add
- `k3d/livekit-egress.yaml` (new file) — adopts the untracked live `livekit-egress` Deployment + Service into git, with `strategy.type: Recreate`
- `k3d/kustomization.yaml` (existing, +1 line) — register `livekit-egress.yaml` as a base resource
- `tests/spec/health-goals.bats` (existing, already amended in the plan-stage commit — RED tests G-OPS01a/b)

## Context

Health-Goal G-OPS01 (Prio B, `.claude/lib/goals.md`) counts pods in `workspace` +
`workspace-korczewski` on the `fleet` context whose phase isn't Running/Succeeded or
whose containers aren't ready. Live re-measurement on 2026-07-23 found the documented
baseline (3→2) stale; full root-cause analysis is in
`openspec/changes/ops-pods-not-ready/design.md`. Two in-scope root causes:

1. `workspace-korczewski/oauth2-proxy-terminal` — `CreateContainerConfigError`,
   `POCKET_ID_TERMINAL_SECRET` missing from the korczewski secrets files.
2. `workspace/livekit-egress` — stuck `ContainerCreating` for 4 days, `RollingUpdate`
   strategy racing a ReadWriteOnce PVC across two nodes; Deployment untracked in git.

`oauth2-proxy-brett` CrashLoopBackOff (both brands) is explicitly OUT OF SCOPE — see
design.md "Explizit außer Scope". Do not touch `k3d/oauth2-proxy-brett.yaml`.

## Task 1: Failing tests (already RED — verify, do not modify)

`tests/spec/health-goals.bats` already contains three new `@test` blocks
(`G-OPS01a` ×2, `G-OPS01b`) added in the plan-stage commit. Confirm they are still red
before starting implementation:

```bash
bats tests/spec/health-goals.bats --filter "G-OPS01"
```

expected: FAIL — all three tests fail:
- `G-OPS01a: korczewski secrets file has every workspace-secrets key oauth2-proxy-terminal requires` → missing `POCKET_ID_TERMINAL_SECRET`
- `G-OPS01a: fleet-korczewski secrets file has every workspace-secrets key oauth2-proxy-terminal requires` → missing `POCKET_ID_TERMINAL_SECRET`
- `G-OPS01b: livekit-egress is tracked as a Kustomize manifest with a Recreate rollout strategy` → `k3d/livekit-egress.yaml` does not exist

## Task 2: Add the missing POCKET_ID_TERMINAL_SECRET to korczewski secrets

Add the key to both korczewski secrets files, generating a fresh random value (do NOT
reuse the mentolder value — cross-brand secret reuse is a security anti-pattern; see
`.claude/agents/bachelorprojekt-security.md` for the convention). Insert it in the
"Pocket ID secrets (T001068)" block, next to the other `POCKET_ID_*_SECRET` entries,
matching the existing key ordering/format in each file:

```bash
NEW_SECRET=$(openssl rand -base64 24 | tr -d '=+/' | head -c 32)
```

Edit `environments/.secrets/korczewski.yaml` — after the `POCKET_ID_RUSTDESK_WEB_SECRET`
line, add:
```yaml
POCKET_ID_TERMINAL_SECRET: "<NEW_SECRET>"
```

Edit `environments/.secrets/fleet-korczewski.yaml` — same key, same format, in the
matching "Pocket ID secrets" block of that file (confirm exact insertion point by
reading the file first; it may have a slightly different surrounding key order than
`korczewski.yaml`).

Verify:
```bash
bats tests/spec/health-goals.bats --filter "G-OPS01a"
```
Both G-OPS01a tests now pass (green).

## Task 3: Reseal korczewski secrets

Regenerate the SealedSecret manifests from the updated plaintext secrets file:

```bash
task env:seal ENV=korczewski
task env:seal ENV=fleet-korczewski
```

This must produce diffs in `environments/sealed-secrets/korczewski.yaml` and
`environments/sealed-secrets/fleet-korczewski.yaml` (new `POCKET_ID_TERMINAL_SECRET`
ciphertext entry). If `task env:seal` requires a sealing cert not present locally, run
`task env:fetch-cert ENV=korczewski` / `ENV=fleet-korczewski` first (see
`docs/superpowers/references/gotchas-footguns.md` → "Cluster reset order").

Verify the SealedSecret files changed and are well-formed YAML:
```bash
git diff --stat environments/sealed-secrets/korczewski.yaml environments/sealed-secrets/fleet-korczewski.yaml
python3 -c "import yaml; yaml.safe_load(open('environments/sealed-secrets/korczewski.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('environments/sealed-secrets/fleet-korczewski.yaml'))"
```

## Task 4: Adopt livekit-egress as a tracked Kustomize manifest

Create `k3d/livekit-egress.yaml` reconstructing the live Deployment + Service from the
cluster's `kubectl.kubernetes.io/last-applied-configuration` (already captured during
investigation — see design.md), with ONE deliberate change: `strategy.type: Recreate`
instead of the implicit `RollingUpdate` default. This is the fix for the RWO-PVC /
cross-node race that has left the pod in `ContainerCreating` for 4 days.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-egress
  namespace: workspace
  labels:
    app: livekit
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: livekit
  template:
    metadata:
      labels:
        app: livekit
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: NotIn
                    values: [k3s-1, k3s-2, k3s-3, k3w-1, k3w-2, k3w-3]
      containers:
        - name: egress
          image: livekit/egress:v1.13.0@sha256:980ff439431df2c773573721ab6da19e15bdc1f049ab7cb80e87470bf174c12f
          env:
            - name: EGRESS_CONFIG_BODY
              value: |
                api_key: $(API_KEY)
                api_secret: $(API_SECRET)
                ws_url: ws://livekit-server:7880
                redis:
                  address: livekit-redis:6379
                health_port: 9090
                log_level: info
            - name: API_KEY
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: LIVEKIT_API_KEY }
            - name: API_SECRET
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: LIVEKIT_API_SECRET }
          resources:
            limits: { cpu: "2", memory: 2Gi }
            requests: { cpu: "0", memory: "0" }
          securityContext:
            allowPrivilegeEscalation: false
          volumeMounts:
            - { name: recordings, mountPath: /recordings }
      volumes:
        - name: recordings
          persistentVolumeClaim:
            claimName: livekit-recordings-pvc
```

Do NOT add a `Service`/other resources beyond what's already live unless a live
`kubectl get svc -n workspace -l app=livekit` lookup at execute-time shows one bound
to `livekit-egress` specifically (egress is typically headless/no Service — confirm
before adding one to avoid introducing a resource that never existed).

Register the new file as a Kustomize base resource in `k3d/kustomization.yaml`
(add `- livekit-egress.yaml` to the `resources:` list, alongside the other
service manifests — keep alphabetical/grouped position consistent with surrounding
entries).

Verify:
```bash
bats tests/spec/health-goals.bats --filter "G-OPS01b"
task workspace:validate
```
G-OPS01b now passes; `workspace:validate` builds both `prod-fleet/mentolder` and
`prod-fleet/korczewski` cleanly with the new resource included.

## Task 5: Final verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Manual live pre/post verification (NOT part of automated CI — no live cluster access
there; run this locally against `fleet` before and after the post-merge deploy):

```bash
python3 -c "
import json,subprocess
n=0
for ns in ('workspace','workspace-korczewski'):
    d=json.loads(subprocess.check_output(['kubectl','get','pods','-n',ns,'--context','fleet','-o','json']))
    for p in d['items']:
        ph=p['status'].get('phase')
        if ph=='Succeeded': continue
        cs=p['status'].get('containerStatuses',[])
        if ph!='Running' or any(not c.get('ready') for c in cs): n+=1
print(n)"
```
Expect the count to drop by 2 relative to the pre-fix live measurement (livekit-egress
+ oauth2-proxy-terminal resolved); `oauth2-proxy-brett` (out of scope) may still count
until the separate uncommitted fix on `chore/cleanup-stale-agent-refs-T002093` lands.
