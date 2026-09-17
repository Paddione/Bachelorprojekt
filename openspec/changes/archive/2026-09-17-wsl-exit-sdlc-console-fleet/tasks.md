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

- [x] **Reconciliation-Kette lesen.** `flux/clusters/fleet/ks-dev.yaml`
      analysieren: reconciled prod-fleet/dev → welche Kustomize-Basis? Das
      bestimmt, ob das Manifest unter k3d/dev-stack/ oder einem Fleet-
      Verzeichnis liegt.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Belegt durch das Ergebnis: `prod-fleet/dev/kustomization.yaml` bindet `../../k3d/dev-stack`,
      und `k3d/dev-stack/sdlc-console.yaml` liegt dort (PR #5257).
- [x] **Deployment umziehen.** Image ghcr.io/paddione/website-sdlc (:latest
      konventionsgemäß), BUILD_TARGET=sdlc; DB-Zugang über shared-db-Endpoint
      (T016430); Ressourcen-Limits wie die Dev-Stack-Siblings.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `k3d/dev-stack/sdlc-console.yaml` liegt auf `main` (PR #5257).
- [x] **LLM-Route ersetzen.** Statt llm-proxy-host: Service auf FreeToken via
      wg/NAT-Route (Hostnamen aus Domain-Registry, P0-Spike-Gate verweisen);
      readinessProbe darf vom LLM-Endpoint NICHT abhängen (fail-closed-
      Degradiert).
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `k3d/sdlc-stack/llm-proxy-host.yaml` ist auf `main` entfernt; das neue Manifest setzt
      `LLM_ENABLED: "false"` fail-closed und zeigt per Service-DNS auf `llm-gateway-embed`/
      `-rerank` statt auf eine Bridge-IP (PR #5257).
- [ ] **Rückbau.** k3d/sdlc-stack/-Manifeste entfernen; prüfen ob sonstige
      Referenzen existieren (grep über k3d/ + flux/).
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):** **OFFEN.**
      `k3d/sdlc-stack/sdlc-console.yaml` und `sdlc-console-rbac.yaml` liegen weiterhin auf `main`
      und werden von `k3d/sdlc-stack/kustomization.yaml:23-24` weiter eingebunden. Der Rückbau
      ist also nur zur Hälfte erfolgt (llm-proxy-host ja, console-Duplikat nein).
- [x] **BATS-Test.** Assertions: kein Manifest enthält mehr manuelle Endpoints
      auf eine Bridge-IP; console-Deployment referenziert Registry-Domain für
      den LLM-Route-Host; readiness hängt nicht am LLM.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `tests/spec/fleet-operations/sdlc-console-fleet.bats` liegt auf `main` (PR #5257).

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).**
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Test-Datei auf `main`; PR #5257 folgte dem RED→GREEN-Schritt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/sdlc-console-fleet.bats
# expected: FAIL (red — console still lives in k3d/sdlc-stack with host hack)
```

- [ ] **Fix-Step (GREEN).** Umzug + Rückbau; Test grün; validate:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):** **OFFEN,** solange der Rückbau-Task oben offen ist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/sdlc-console-fleet.bats
task workspace:validate
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):** **OFFEN,** solange der Rückbau-Task oben offen ist.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
