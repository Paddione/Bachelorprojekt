---
title: "rustdesk-on-demand — Implementation Plan"
ticket_id: T015170
domains: [infra, security, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rustdesk-on-demand — Implementation Plan

_Ticket: T015170 (Phase 1: Serverseite; Geräte-Wake ist explizit out of scope)_

On-Demand-Lifecycle für den RustDesk-Relay-Stack: task-verwalteter Betrieb außerhalb
Flux, Härtungsrollout der T014553-Manifeste, Wake per scale-up, Wind-down nach TTL
per Sleeper-Job. Kontext und verifizierte Ist-Fakten: `proposal.md`; Anforderungen:
`specs/rustdesk-server.md` (Delta auf SSOT `rustdesk-server`).

## File Structure

```
taskfiles/Taskfile.rustdesk.yml            # p1: rustdesk:deploy/wake/sleep/status
Taskfile.yml                               # p1: includes:-Block rustdesk (4 Zeilen)
k3d/rustdesk-stack/on-demand.yaml          # p2: SA+Role+RoleBinding+Sleeper-Job
tests/spec/rustdesk-server.bats            # p3: Assertions Lifecycle/Sleeper/Isolation
```

Alle Ziel-Dateien sind nicht gebaselinet (`residual_budget Taskfile.yml` leer =
ungated; neue Dateien starten bei null).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-taskfile.md | impl | taskfiles/Taskfile.rustdesk.yml, Taskfile.yml | |
| p2 | tasks.d/p2-sleeper.md | impl | k3d/rustdesk-stack/on-demand.yaml | |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/rustdesk-server.bats | p1,p2 |

Partials sind disjunkt (D1); p3 trägt den RED-Failing-Test gegen den Stand vor p1–p2.
`hbbs.yaml`/`hbbr.yaml` bleiben unverändert — die Härtung aus T014553 ist bereits im
Repo; der Rollout passiert durch das `apply` im deploy/wake-Task.

## Design-Entscheidungen

- **Kein Flux:** Stack bleibt manuell via task verwaltet (Reconcile würde Scale-to-0
  zurücknudeln); Präzedenz coturn/janus.
- **Sleeper als Job statt CronJob+Idle-Detection:** v1 mit festem TTL (30 min,
  `sleep 1800 && kubectl scale ... --replicas=0`), Idempotenz durch delete+apply des
  Jobs im wake-Task (Job-Spec ist immutabel). Idle-Detection ist v2.
- **on-demand.yaml nie in Kustomize:** Die Datei liegt neben dem Stack, wird aber
  ausschließlich vom wake-Task angewendet — ein `kustomize build k3d/rustdesk-stack`
  darf sie nicht liefern (Guard-Test in p3).
- **Session-Toleranz:** Wind-down bricht keine laufende Session (Rendezvous nur beim
  Connect); nach Ablauf des TTL genügt Re-Wake.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED), Partial p3:** die neuen BATS-Assertions laufen gegen
      den Branch-Stand vor der Implementierung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: FAIL (red — Taskfile-Rustdesk und Sleeper-Manifest existieren noch nicht)
```

- [ ] **Fix-Steps (GREEN):** p1–p2 setzen die Umsetzung um; danach läuft die Spec
      grün und die Builds validieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
task workspace:validate
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
