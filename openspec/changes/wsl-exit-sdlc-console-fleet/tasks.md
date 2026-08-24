---
title: "wsl-exit-sdlc-console-fleet — Implementation Plan"
ticket_id: T016429
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans:
  - wsl-exit-internal-endpoints
---

# wsl-exit-sdlc-console-fleet — Implementation Plan

_Ticket: T016429_

## File Structure

```
k3d/dev-stack/sdlc-console.yaml            # NEU (Umzug aus k3d/sdlc-stack/, angepasst an workspace-dev)
prod-fleet/dev/kustomization.yaml          # sdlc-console in die Reconciliation-Kette
k3d/sdlc-stack/llm-proxy-host.yaml         # ENTFERNEN (Hack)
k3d/sdlc-stack/sdlc-console.yaml           # ENTFERNEN nach Umzug
tests/spec/fleet-operations/sdlc-console-fleet.bats  # NEU
```

## Tasks

- [ ] **Reconciliation-Kette lesen.** `flux/clusters/fleet/ks-dev.yaml`
      analysieren: reconciled prod-fleet/dev → welche Kustomize-Basis? Das
      bestimmt, ob das Manifest unter k3d/dev-stack/ oder einem Fleet-
      Verzeichnis liegt.
- [ ] **Deployment umziehen.** Image ghcr.io/paddione/website-sdlc (:latest
      konventionsgemäß), BUILD_TARGET=sdlc; DB-Zugang über shared-db-Endpoint
      (T016430); Ressourcen-Limits wie die Dev-Stack-Siblings.
- [ ] **LLM-Route ersetzen.** Statt llm-proxy-host: Service auf FreeToken via
      wg/NAT-Route (Hostnamen aus Domain-Registry, P0-Spike-Gate verweisen);
      readinessProbe darf vom LLM-Endpoint NICHT abhängen (fail-closed-
      Degradiert).
- [ ] **Rückbau.** k3d/sdlc-stack/-Manifeste entfernen; prüfen ob sonstige
      Referenzen existieren (grep über k3d/ + flux/).
- [ ] **BATS-Test.** Assertions: kein Manifest enthält mehr manuelle Endpoints
      auf eine Bridge-IP; console-Deployment referenziert Registry-Domain für
      den LLM-Route-Host; readiness hängt nicht am LLM.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/sdlc-console-fleet.bats
# expected: FAIL (red — console still lives in k3d/sdlc-stack with host hack)
```

- [ ] **Fix-Step (GREEN).** Umzug + Rückbau; Test grün; validate:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/sdlc-console-fleet.bats
task workspace:validate
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
