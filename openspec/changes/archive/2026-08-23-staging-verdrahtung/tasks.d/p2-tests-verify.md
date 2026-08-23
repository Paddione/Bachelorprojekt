# Partial p2 — Guards: Flux-Wiring- und CronJob-Ziel-Tests

## Scope

BATS-Guards gegen Regression des Staging-GitOps-Wirings: ohne ks-staging/Renderer-Blöcke
bleibt workspace-staging verwaist (Ursache von T014538), und ein falscher
WEBSITE_NAMESPACE-Wert feuert die Staging-CronJobs gegen die Prod-Website.

## Task List

- [ ] **2.1 `tests/spec/fleet-operations/staging-flux-wiring.bats` — NEU.** Guard-Suite
      mit sechs Tests; kustomize/envsubst-abhängige Tests bekommen den
      Verfügbarkeits-Guard (`command -v kustomize … || skip`) in der Rotphase:

      1. `flux declares ks-staging targeting ./staging` — Datei existiert, enthält
         `name: flux-staging`, `path: ./staging`, `prune: true`,
         `kind: OCIRepository` + `name: fleet-manifests`, dependsOn
         `flux-infra-controllers`.
      2. `flux declares ks-website-staging targeting ./website-staging` — analog.
      3. `ks-sealed-secrets declares the staging document` — enthält
         `name: flux-sealed-secrets-staging`, `path: ./sealed-secrets/staging`.
      4. `renderer emits staging and website-staging trees with gate coverage` —
         `scripts/flux-render-artifact.sh` enthält `render_component prod-fleet/staging`,
         `render_component prod-fleet/website-staging`,
         `env-resolve.sh staging`, die Sealed-Secrets-Kopie nach
         `out/sealed-secrets/staging/` sowie `"${OUT_DIR}/staging"` und
         `"${OUT_DIR}/website-staging"` in der Validation-Gate-Liste.
      5. `staging env profile carries offline digest placeholders` —
         `environments/staging.yaml` definiert `WEBSITE_IMAGE_DIGEST` und
         `BRETT_IMAGE_DIGEST` im Placeholder-Muster der Fleet-Brand-Profile.
      6. `rendered staging cronjobs target the staging website namespace`
         (Verhaltenstest): `source scripts/env-resolve.sh staging` +
         `kustomize build prod-fleet/staging --load-restrictor=LoadRestrictionsNone`;
        Assertionen: kein Treffer auf `website.website.svc.cluster.local`, und der
         WEBSITE_NAMESPACE-env-Wert löst zu `website-staging` auf.

- [ ] **2.2 GREEN-Nachweis führen.** Suite gegen den implementierten Stand laufen
      lassen — alle sechs Tests grün (Verhaltenstest 6 beweist zugleich das
      Akzeptanzkriterium-Vorbild „CronJobs zielen auf die Staging-Website“).

- [ ] **2.3 Finale Verifikation — drei Pflicht-Gates:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Failing-Test-Step (RED → GREEN)

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/staging-flux-wiring.bats
# expected: FAIL vor der Verdrahtung (Tests 1–5: ks-/Renderer-/Env-Artefakte fehlen;
#           Test 6: Overlay rendert, aber Assertions laufen ins Leere bzw. greifen das
#           Prod-Ziel). GREEN nach Partial p1.
```
