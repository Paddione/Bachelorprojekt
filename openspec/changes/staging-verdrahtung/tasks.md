---
title: "staging-verdrahtung — Implementation Plan"
ticket_id: T015004
domains: [infra, gitops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# staging-verdrahtung — Implementation Plan

_Ticket: T015004_

## File Structure

```
environments/staging.yaml                             — MODIFY: Offline-Digest-Placeholder (Spiegel fleet-mentolder.yaml:23–26)
prod-fleet/website-staging/kustomization.yaml         — NEU: Website-Overlay für website-staging (Prior-Art website-mentolder)
prod-fleet/website-staging/website-patch.yaml         — NEU: Image-Pin ghcr.io/paddione/${WEBSITE_IMAGE}@${WEBSITE_IMAGE_DIGEST}
prod-fleet/website-staging/website-ingress-web.yaml   — NEU: Ingress web.staging.korczewski.de, TLS ${TLS_SECRET_NAME}, Middleware-Präfixe ${WEBSITE_NAMESPACE}/${WORKSPACE_NAMESPACE}
prod-fleet/website-staging/website-security-headers.yaml — NEU: website-scoped Security-Headers (kein noindex), Namespace website-staging
scripts/flux-render-artifact.sh                       — MODIFY: Render-Blöcke staging + website-staging, Sealed-Secrets-Kopie, Validation-Gate-Einträge
flux/clusters/fleet/ks-staging.yaml                   — NEU: Kustomization flux-staging, path ./staging, dependsOn flux-infra-controllers, prune true
flux/clusters/fleet/ks-website-staging.yaml           — NEU: Kustomization flux-website-staging, path ./website-staging, prune true
flux/clusters/fleet/ks-sealed-secrets.yaml            — MODIFY: drittes Dokument flux-sealed-secrets-staging, path ./sealed-secrets/staging, prune false
CLAUDE.md                                             — MODIFY: Flux-Abschnitt um Staging-Stack ergänzen
tests/spec/fleet-operations/staging-flux-wiring.bats  — NEU: Guards (Flux-Wiring, Renderer, Digest-Placeholder, CronJob-Ziel)
```

## Befund (Evidence)

- `flux/clusters/fleet/` kennt kein ks-staging; `scripts/flux-render-artifact.sh`
  rendert keinen Staging-Baum (`workspace-staging` ist GitOps-verwaist, T015004).
- `prod-fleet/staging/` baut sauber mit `env-resolve.sh staging`: Probe 2026-08-23,
  alle Nicht-Runtime-Vars lösen auf; Reste sind ausschließlich `$${VAR}`-Runtime-Vars
  aus Skriptblöcken (vom Renderer-Vertrag T002306 ausgenommen).
- Die App-CronJobs referenzieren `http://website.${WEBSITE_NAMESPACE}.svc.cluster.local`
  (k3d/cronjob-scheduled-publish.yaml:39, admin-actions-cronjobs.yaml:139,
  notify-unread-cronjob.yaml:37); das Interim-Suspend wurde per kubectl gesetzt und wird
  vom GitOps-Apply automatisch zurückgenommen, weil kein Manifest ein `suspend:`-Feld trägt.
- `environments/sealed-secrets/staging.yaml` existiert und ist auf
  `workspace-staging`/`website-staging`/`monitoring` gesealed.
- `prod-fleet/website-mentolder/website-ingress-web.yaml` zeigt die zwei Adaptionspunkte
  für den Staging-Klon: `secretName` → `${TLS_SECRET_NAME}`, Traefik-Middleware-Präfixe
  → `workspace-${WORKSPACE_NAMESPACE}-…@kubernetescrd` bzw.
  `${WEBSITE_NAMESPACE}-…@kubernetescrd`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | tasks.d/p1-infra-wiring.md | impl | environments/staging.yaml, prod-fleet/website-staging/kustomization.yaml, prod-fleet/website-staging/website-patch.yaml, prod-fleet/website-staging/website-ingress-web.yaml, prod-fleet/website-staging/website-security-headers.yaml, scripts/flux-render-artifact.sh, flux/clusters/fleet/ks-staging.yaml, flux/clusters/fleet/ks-website-staging.yaml, flux/clusters/fleet/ks-sealed-secrets.yaml, CLAUDE.md | |
| 2 | tasks.d/p2-tests-verify.md | tests | tests/spec/fleet-operations/staging-flux-wiring.bats | 1 |

## Verify

- [ ] **Final Verification.** Drei Pflicht-Gates nach beiden Partials:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `task workspace:validate` → kustomize Dry-Run grün (Staging-Overlay im Verbund).
