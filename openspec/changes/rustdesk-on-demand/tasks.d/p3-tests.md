---
title: "p3-tests"
ticket_id: T015170
domains: [test, infra]
status: active
---

# Partial p3 — Tests für den On-Demand-Lifecycle

Sichert Lifecycle-Taskfile, Sleeper-Manifest und Kustomize-Isolation im
bestehenden Spec-Bats ab (gleiche Sammeldatei wie T014553-p5 — plankonforme
Fortsetzung, keine neuen Dateien). Gegen den Stand vor p1–p2 sind alle neuen
Assertions rot.

### Task 1: RED-Assertions in rustdesk-server.bats

**Files:** `tests/spec/rustdesk-server.bats`

Neue Tests im bestehenden Setup-Stil (`REPO_ROOT` aus `setup()`):

- `rustdesk-on-demand: taskfile ist registriert und trägt die Lifecycle-Targets` —
  `taskfiles/Taskfile.rustdesk.yml` existiert; `Taskfile.yml` enthält den
  Include-Eintrag `rustdesk:`; das Taskfile deklariert die vier Targets
  `deploy:`, `wake:`, `sleep:`, `status:`.
- `rustdesk-on-demand: sleeper manifest deklariert TTL-Downscale mit minimaler RBAC` —
  grep auf `k3d/rustdesk-stack/on-demand.yaml`: `kind: Job` mit Name
  `rustdesk-sleeper`, `sleep 1800`, `--replicas=0`, dazu ServiceAccount/Role/
  RoleBinding; die Role listet ausschließlich `deployments/scale`
  (get/update/patch) und `deployments` (get) — Negativ-Anker: kein `verbs`-Block
  mit `delete` oder `"*"`.
- `rustdesk-on-demand: on-demand.yaml bleibt außerhalb des Kustomize-Builds` —
  Positiv-Anker: `kustomize build "$STACK"` läuft erfolgreich; Negativ-Aussage:
  der Build-Output enthält null Treffer auf `rustdesk-sleeper` (der Job darf
  nie über Flux/Kustomize rollieren).

Rot-Nachweis vor der Implementierung (p1/p2 noch nicht angewendet):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: FAIL (red — Taskfile-Rustdesk und on-demand.yaml existieren noch nicht)
```

### Task 2: Inventar & Gates

Nach allen Test-Änderungen:

```bash
task test:inventory
```

`components/website/src/data/test-inventory.json` gehört zum Commit dazu, falls
der Lauf sie ändert.
