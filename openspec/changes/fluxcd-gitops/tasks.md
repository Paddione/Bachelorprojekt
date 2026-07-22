---
title: "fluxcd-gitops — Implementation Plan"
ticket_id: T002083
domains: [infra, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fluxcd-gitops — Implementation Plan

_Ticket: T002083 · Spec: `openspec/changes/fluxcd-gitops/design.md` · Intel: `openspec/changes/fluxcd-gitops/intel.json`_

Pull-based GitOps für den fleet-Cluster: Flux Operator + FluxInstance mit OCI-Artefakt-Sync
(`oci://ghcr.io/paddione/fleet-manifests`), SealedSecrets bleiben, Drift-Correction + Receiver-Webhook.
Der Plan ist in drei disjunkte Partials zerlegt (T002074); Ausführungsreihenfolge p3 (RED-Tests) →
p1 (Flux-Infra) → p2 (CI-Workflows), Details je Partial-Datei.

## Partials

| id | file | role | target_files |
|----|------|------|--------------|
| p1 | tasks.d/p1-flux-infra.md | impl | flux/clusters/fleet/, scripts/flux-render-artifact.sh, Taskfile.yml, scripts/env-resolve.sh, k3d/brett.yaml, environments/schema.yaml, environments/fleet-mentolder.yaml, environments/fleet-korczewski.yaml, openspec/changes/fluxcd-gitops/specs/workspace-deploy.md, openspec/changes/fluxcd-gitops/specs/ci-cd.md |
| p2 | tasks.d/p2-ci-workflows.md | impl | .github/workflows/render-fleet-artifact.yml, .github/workflows/post-merge.yml, .github/workflows/build-website.yml, .github/workflows/build-brett.yml, .github/workflows/deploy-sealed-secrets.yml |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/workspace-deploy.bats, tests/spec/ci-cd.bats, website/src/data/test-inventory.json |

## File Structure

```
flux/clusters/fleet/                          NEU — FluxInstance, Kustomization-CRs, Receiver,
                                              IngressRoute flux-webhook, ghcr-auth SealedSecret
scripts/flux-render-artifact.sh               NEU — Render-Pipeline (kustomize|sed|envsubst|sed) → out/
Taskfile.yml                                  Neue Tasks flux:render/flux:bootstrap/flux:push;
                                              workspace:deploy → Break-Glass-Hinweis
scripts/env-resolve.sh                        CI-tauglicher Resolve (Budget siehe Pre-flight)
k3d/brett.yaml                                image-Tag → ${BRETT_IMAGE} (Vorbild WEBSITE_IMAGE)
environments/schema.yaml                      Var BRETT_IMAGE (Default latest)
environments/fleet-mentolder.yaml             BRETT_IMAGE-Startwert
environments/fleet-korczewski.yaml            BRETT_IMAGE-Startwert
.github/workflows/render-fleet-artifact.yml   NEU — render + flux push artifact + Receiver-Ping
.github/workflows/post-merge.yml              deploy-manifests-Job → Artefakt-Render statt kubectl
.github/workflows/build-website.yml           set image/Overlay-Apply → Re-Render-Trigger (SHA-Tag)
.github/workflows/build-brett.yml             rollout restart → Re-Render-Trigger
.github/workflows/deploy-sealed-secrets.yml   ENTFERNT — Flux reconciled sealed-secrets/-Pfad
openspec/changes/fluxcd-gitops/specs/workspace-deploy.md   Delta: pull-based-Requirements
openspec/changes/fluxcd-gitops/specs/ci-cd.md              Delta: Flux-Verbot umkehren
tests/spec/workspace-deploy.bats              BATS: Render-Skript + Flux-Manifeste
tests/spec/ci-cd.bats                         BATS: Workflow-Umbau-Invarianten
website/src/data/test-inventory.json          Regenerat (task test:inventory)
```

## Pre-flight: S1-Budgets

| file | ist | budget |
|------|-----|--------|
| `scripts/env-resolve.sh` | 115 | 385 |

`scripts/flux-render-artifact.sh` ist neu (Limit 500, Ziel deutlich darunter). `Taskfile.yml`,
Workflows und Markdown sind S1-ungated. Keine Datei mit Budget ≤ 0 betroffen.

## Verify (final)

- [ ] **Finale Verifikation.** Die drei mandatory CI-Gates plus Manifest- und OpenSpec-Validierung:

```bash
task workspace:validate
bash scripts/openspec.sh validate
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Nach Test-Änderungen: aktualisiertes `website/src/data/test-inventory.json` committen.
- [ ] `flux schema validate` über `flux/clusters/fleet/` (CLI lokal vorhanden, v2.8.8).
