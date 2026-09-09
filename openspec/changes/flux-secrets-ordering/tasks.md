---
title: "flux-secrets-ordering — Implementation Plan"
ticket_id: T900014
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# flux-secrets-ordering — Implementation Plan

_Ticket: T900014_

Scope: NUR Brand/Staging-App-Stacks (`flux-mentolder`, `flux-korczewski`,
`flux-staging`). Website-Kustomizations sind per User-Entscheid ausgeklammert.
Kein neuer Secret-Key (Penpot ist seit T900030/PR #5433 entfernt), keine neuen
Kustomizations, kein Verhalten ausserhalb der Reconcile-Reihenfolge.

## File Structure

```
flux/clusters/fleet/ks-mentolder.yaml                  # MODIFIED — p1: +dependsOn flux-sealed-secrets-mentolder
flux/clusters/fleet/ks-korczewski.yaml                 # MODIFIED — p1: +dependsOn flux-sealed-secrets-korczewski
flux/clusters/fleet/ks-staging.yaml                    # MODIFIED — p1: +dependsOn flux-sealed-secrets-staging
tests/spec/workspace-deploy/flux-secrets-ordering.bats # NEW — p2: RED-Guard (rot ohne p1, gruen mit p1)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-implement.md | implement | flux/clusters/fleet/ks-mentolder.yaml, flux/clusters/fleet/ks-korczewski.yaml, flux/clusters/fleet/ks-staging.yaml | |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/workspace-deploy/flux-secrets-ordering.bats | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard `tests/spec/workspace-deploy/flux-secrets-ordering.bats`
      faellt gegen den Unveraendert-Stand (Tests 2+3 rot: dependsOn-Kanten fehlen).
      Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy/flux-secrets-ordering.bats
# expected: FAIL (red — flux-mentolder/-korczewski/-staging haengen nur an flux-infra-controllers)
```

- [ ] **Fix-Step (GREEN).** Partial p1 umsetzen; danach ist die Guard-Suite gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy/flux-secrets-ordering.bats
tests/unit/lib/bats-core/bin/bats --filter 'dependsOn|healthChecks|sealed-secrets' tests/spec/workspace-deploy.bats
task workspace:validate
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
