---
title: "pocket-id-seed-label-isolation — Implementation Plan"
ticket_id: T014938
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-seed-label-isolation — Implementation Plan

_Ticket: T014938_

## File Structure

```
k3d/pocket-id-client-seed.yaml                                  # FIX: Pod-Template-Label app: pocket-id → pocket-id-client-seed (Zeile ~70)
tests/spec/pocket-id-seed-label-isolation/client-seed-service-endpoint-isolation.bats  # RED-Test, bereits im Stage-Commit enthalten
openspec/changes/pocket-id-seed-label-isolation/design.md       # Brainstorming-Ergebnis (Root Cause, Entscheidungen)
openspec/changes/pocket-id-seed-label-isolation/proposal.md     # WHY/WAS mit Live-Evidence
```

Disjunkte Partials (D1): 1 Partial — `p1-seed-label` (`k3d/pocket-id-client-seed.yaml`).
Der RED-Test liegt bereits im Stage-Commit vor und ist gegen den ungefixten Stand
verifiziert rot (`not ok 1 ... matcht den Service-Selector`).

## Partial P1 — p1-seed-label

- [ ] **P1.1 Label ändern.** In `k3d/pocket-id-client-seed.yaml` im
      Pod-Template (`spec.template.metadata.labels`) `app: pocket-id`
      durch `app: pocket-id-client-seed` ersetzen. Das Label am Job-Objekt
      selbst (`metadata.labels`, Zeile ~64) bleibt unverändert.

- [ ] **P1.2 Struktur-Verifikation (GREEN).** Der RED-Test aus dem
      Stage-Commit muss jetzt grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-seed-label-isolation/
# expected: FAIL (red — vor P1.1; der Test liegt dem Stage-Commit bei und ist dort rot verifiziert)
```

## Verify (final)

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich (Live-Cluster, nach nächstem Deploy): `kubectl get endpoints pocket-id`
darf nur noch die Deployment-Pods enthalten — nicht mehr den Seed-Job-Pod.
