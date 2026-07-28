---
title: "k3d-kustomization-T002349 — Implementation Plan"
ticket_id: T002349
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3d-kustomization-T002349 — Implementation Plan

_Ticket: T002349_

## File Structure

```
CHANGED:
  k3d/default/kustomization.yaml     — set includeSelectors: false
NEW:
  tests/spec/k3d-kustomization-T002349.bats — dry-run test
```

## Tasks

### 1. Failing-Test (RED)

BATS-Test der nachweist, dass `kubectl apply --dry-run=client -k k3d/default` an immutable selector scheitert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/k3d-kustomization-T002349.bats
# expected: FAIL
```

### 2. includeSelectors entfernen (GREEN)

Setze `includeSelectors: false` in `k3d/default/kustomization.yaml`. Verifiziere dass dry-run durchkommt.

### 3. Apply-Weg verifizieren

```bash
kubectl apply --dry-run=client -k k3d/default --context fleet
kubectl apply -k k3d/default --context fleet   # live apply
```

### 4. CI-Gates

```bash
task test:changed
task workspace:validate
```
