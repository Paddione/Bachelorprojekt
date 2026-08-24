---
title: "wsl-exit-fleet-factory — Implementation Plan"
ticket_id: T016422
domains: [infra]
status: completed
file_locks:
  - k3d/dev-stack/brett-dev.yaml
  - k3d/dev-stack/factory-runner.yaml
  - k3d/dev-stack/sdlc-console.yaml
  - k3d/dev-stack/internal-mcp-ingress.yaml
  - k3d/dev-stack/kustomization.yaml
  - k3d/configmap-domains.yaml
  - docs/adr/ADR-007-wsl-exit-fleet-native.md
  - docs/adr/ADR-006-sdlc-isolation-dev-host.md
  - .gitattributes
  - tests/spec/software-factory/wsl-exit-fleet-factory.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-fleet-factory — Implementation Plan

_Ticket: T016422 · Design: design.md (D1–D8) · Spec-Delta: specs/software-factory.md_

Ziel: WSL-Stilllegung ermöglichen — Factory-Dispatcher fleet-nativ (single-replica
Runner), sdlc-console ohne WSL-Bridge-Endpunkte, bge-Paar ohne Portforwards
konsumierbar, brett-CrashLoop behoben, ADR-006 superseded.

## File Structure

```
k3d/
├── configmap-domains.yaml                      # P4: DEV_BGE_*_HOST Einträge
└── dev-stack/
    ├── brett-dev.yaml                          # P1: tmp emptyDir (CrashLoop-Fix)
    ├── factory-runner.yaml                     # P2: NEU — Runner+PVC+CronJob+RBAC
    ├── sdlc-console.yaml                       # P3: NEU — fleet-adaptiert
    ├── internal-mcp-ingress.yaml               # P4: NEU — Cross-Ns IngressRoutes
    └── kustomization.yaml                      # P5: 3 neue Ressourcen
docs/adr/
├── ADR-006-sdlc-isolation-dev-host.md          # P6: SUPERSEDED-Zeile
└── ADR-007-wsl-exit-fleet-native.md            # P6: NEU — Supersession+Runbook
.gitattributes                                  # P6: LF-Guard für *.sh/*.bats
tests/spec/software-factory/
└── wsl-exit-fleet-factory.bats                 # P7: NEU — Manifest-Guards
```

## Partials (Ausführungsreihenfolge)

| # | Datei | Rolle | target_files |
|---|-------|-------|--------------|
| P1 | tasks.d/p1-brett-tmp-fix.md | Fix flux-dev-Blocker | k3d/dev-stack/brett-dev.yaml |
| P2 | tasks.d/p2-factory-runner-manifest.md | Feature Runner | k3d/dev-stack/factory-runner.yaml |
| P3 | tasks.d/p3-sdlc-console-fleet.md | Feature Console | k3d/dev-stack/sdlc-console.yaml |
| P4 | tasks.d/p4-internal-mcp-endpoints.md | Feature Endpoints | k3d/dev-stack/internal-mcp-ingress.yaml, k3d/configmap-domains.yaml |
| P5 | tasks.d/p5-fleet-wiring.md | Wiring | k3d/dev-stack/kustomization.yaml |
| P6 | tasks.d/p6-docs-adr-supersession.md | Docs/ADR | docs/adr/ADR-007…md, ADR-006…md, .gitattributes |
| P7 | tasks.d/p7-tests.md | tests | tests/spec/software-factory/wsl-exit-fleet-factory.bats |

Partials sind datei-disjunkt (plan-lint D1); P5 hängt absichtlich NACH P2–P4.
Operator-Aktionen (hetzner-2 Rejoin, WSL-Docker-Cleanup, kubeseal, Cutover)
sind im ADR-007-Anhang dokumentiert und kein Agenten-Task.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Manifest-Guards aus P7 gegen den
      Ausgangszustand laufen lassen — die neuen Manifeste existieren noch nicht,
      der brett-tmp-Fix fehlt noch:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-fleet-factory.bats
# expected: FAIL (red — brett hat kein tmp emptyDir, factory-runner.yaml fehlt)
```

- [ ] **Fix-Step (GREEN).** Partials P1–P6 in Reihenfolge umsetzen; danach muss
      derselbe BATS-Lauf grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-fleet-factory.bats
```

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Live-Gate nach Merge (Operator, nicht CI): flux-dev meldet
`ReconciliationSucceeded`, brett-Pod Ready, danach Freigabe des Cutover-Anhangs
in ADR-007.
