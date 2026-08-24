---
title: "wsl-exit-brett-dev-tmp — Implementation Plan"
ticket_id: T016424
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-brett-dev-tmp — Implementation Plan

_Ticket: T016424_

## File Structure

```
k3d/dev-stack/brett-dev.yaml          # tmp-emptyDir-Mount ergänzen (Muster oauth2-proxy-dev.yaml)
tests/spec/dev-stack-tmp-mounts.bats  # NEU: uid!=0 ⇒ /tmp emptyDir für alle dev-stack-Deployments
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test anlegen, der für jedes
      Deployment in `k3d/dev-stack/*.yaml` mit `runAsUser != 0` einen
      `emptyDir`-Mount auf `/tmp` verifiziert. Der Test muss am aktuellen
      Stand FAILen, weil `brett-dev.yaml` den Mount nicht hat.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-stack-tmp-mounts.bats
# expected: FAIL (red — brett-dev.yaml lacks the tmp emptyDir mount)
```

- [ ] **Fix-Step (GREEN).** In `k3d/dev-stack/brett-dev.yaml` das
      Volume-Muster aus `k3d/dev-stack/oauth2-proxy-dev.yaml` übernehmen:
      `emptyDir: {}` als Volume, gemountet auf `/tmp`. Falls der
      npm-Cache-Pfad des Images zusätzlich schreibbar sein muss, zweiten
      Mount im selben Zug ergänzen. Test läuft grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-stack-tmp-mounts.bats
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Live-Check (nach Merge).** flux-dev reconciled; Pod in
      `ns workspace-dev` auf `Running`, Restarts bleiben bei 0:

```bash
kubectl get pods -n workspace-dev -l app=brett 2>/dev/null || kubectl get pods -n workspace-dev | grep brett
```
