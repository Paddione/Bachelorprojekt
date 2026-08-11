---
title: "fix-sdlc-imagepullpolicy — Implementation Plan"
ticket_id: T003740
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-sdlc-imagepullpolicy — Implementation Plan

_Ticket: T003740 — Lokaler SDLC-Stack laeuft 44 h hinter main_

## File Structure

```
k3d/sdlc-stack/sdlc-console.yaml   # imagePullPolicy: Always
taskfiles/Taskfile.sdlc.yml        # task sdlc:refresh
tests/spec/sdlc-cockpit/imagepullpolicy-always.bats  # Guard-Test
```

## Tasks

### P1: imagePullPolicy auf Always setzen

**Datei:** `k3d/sdlc-stack/sdlc-console.yaml`

`imagePullPolicy: IfNotPresent` → `imagePullPolicy: Always`. Bei `:latest`-Images ist das die
uebliche Wahl — der Kubelet zieht bei jedem Pod-Start den aktuellen Registry-Stand. Ohne diese
Aenderung bleibt der lokale Stack auf dem ersten gepullten Layer stehen, solange dieser lokal
vorhanden ist.

### P2: task sdlc:refresh dokumentieren

**Datei:** `taskfiles/Taskfile.sdlc.yml`

Task `sdlc:refresh` hinzufuegen: `kubectl rollout restart deploy/sdlc-console` + Watch auf Ready.
Expliziter Handgriff als dokumentierte Alternative zum automatischen Pull.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** imagePullPolicy ist IfNotPresent im Manifest.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/imagepullpolicy-always.bats
# expected: FAIL (rot — Manifest hat noch IfNotPresent)
```

- [ ] **Fix-Step (GREEN).** imagePullPolicy aendern, Pod neu starten. Digest muss matchen.

```bash
kubectl --context k3d-mentolder-dev -n workspace rollout restart deploy/sdlc-console
kubectl --context k3d-mentolder-dev -n workspace rollout status deploy/sdlc-console
kubectl --context k3d-mentolder-dev -n workspace get pod -l app=sdlc-console \
  -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'
# expected: imageID == Registry-Digest (GREEN)
```

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
