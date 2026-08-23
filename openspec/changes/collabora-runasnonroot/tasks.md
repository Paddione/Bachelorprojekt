---
title: "collabora-runasnonroot — Implementation Plan"
ticket_id: T014549
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# collabora-runasnonroot — Implementation Plan

_Ticket: T014549 · SA-GR-06 Rest-Scope (collabora)_

## File Structure

```
k3d/office-stack/collabora.yaml          # modified: runAsNonRoot: true im Container-securityContext
tests/spec/collabora-integration.bats    # modified: Guard-Test (ersetzt den Stub)
```

## Tasks

### 1. RED — Guard-Test schreiben und scheitern sehen

Ersetze den Stub in `tests/spec/collabora-integration.bats` durch einen
echten Test, der den Ist-Zustand prüft und deshalb ROT ist:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/collabora-integration.bats
# expected: FAIL (red — collabora.yaml hat noch kein runAsNonRoot)
```

Der Test parst `k3d/office-stack/collabora.yaml` mit python3+yaml (Verfügbarkeits-Guard
`command -v python3` inklusive) und assertiert:

1. Deployment `collabora`: Container `collabora` hat `securityContext.runAsNonRoot: true`.
2. Container `collabora` hat einen `securityContext` mit dem Capabilities-Bounding-Set
   (`SYS_ADMIN`, `MKNOD`, `SETUID`, `SETGID`) — Bestandsschutz gegen Regression.
3. `allowPrivilegeEscalation` ist NICHT auf `false` gesetzt (dokumentierte
   Setcap-Ausnahme, siehe design.md D2) — als bewusste Negativ-Assertion.

### 2. GREEN — Manifest harden

Ergänze im Container `collabora` (nicht pod-level — das Namespace-PSA ist
privileged und der Pod trägt keinen pod-level securityContext) in
`k3d/office-stack/collabora.yaml` beim bestehenden `securityContext:`-Block:

```yaml
securityContext:
  runAsNonRoot: true        # NEU — Image läuft per Design als non-root `cool`
  capabilities:
    add: ["SYS_ADMIN", "MKNOD", "SETUID", "SETGID"]
  appArmorProfile:
    type: Unconfined
  seccompProfile:
    type: Unconfined
```

Kein `allowPrivilegeEscalation: false` (design.md D2). Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/collabora-integration.bats
# expected: PASS (green)
task workspace:validate
# expected: Kustomize dry-run grün
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard-Test in `tests/spec/collabora-integration.bats`
      ergänzen und auf dem Ausgangsbranch scheitern lassen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/collabora-integration.bats
# expected: FAIL (red — runAsNonRoot fehlt noch im Manifest)
```

- [ ] **Fix-Step (GREEN).** `runAsNonRoot: true` in `k3d/office-stack/collabora.yaml`
      ergänzen; Test muss anschließend passieren.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
