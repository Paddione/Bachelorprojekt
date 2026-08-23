## ADDED Requirements

### Requirement: Staging Stack Is Wired Into Flux

The system SHALL render and reconcile the staging environment through FluxCD: the
renderer SHALL emit `out/staging/staging.yaml` (from `prod-fleet/staging`),
`out/website-staging/website-staging.yaml` (from `prod-fleet/website-staging`) and
`out/sealed-secrets/staging/` (from `environments/sealed-secrets/staging.yaml`) into the
fleet OCI artifact, the validation gate SHALL cover both new trees, and
`flux/clusters/fleet/` SHALL declare `flux-staging` (path `./staging`, prune enabled),
`flux-website-staging` (path `./website-staging`, prune enabled) and
`flux-sealed-secrets-staging` (path `./sealed-secrets/staging`, prune disabled), each
sourcing the `fleet-manifests` OCIRepository. The staging env profile SHALL carry the
documented offline image-digest placeholders so an offline render fails closed exactly
like the brand profiles.

#### Scenario: Flux declares the staging Kustomizations

- **GIVEN** the repo is in its expected state
- **WHEN** `flux/clusters/fleet/ks-staging.yaml`, `ks-website-staging.yaml` and
  `ks-sealed-secrets.yaml` are inspected
- **THEN** `flux-staging` targets path `./staging` with `prune: true` and depends on
  `flux-infra-controllers`
- **AND** `flux-website-staging` targets path `./website-staging` with `prune: true`
- **AND** `ks-sealed-secrets.yaml` contains a third document named
  `flux-sealed-secrets-staging` targeting path `./sealed-secrets/staging`
- **AND** all three source the OCIRepository `fleet-manifests`

#### Scenario: Renderer emits the staging trees

- **GIVEN** `scripts/flux-render-artifact.sh` is inspected
- **WHEN** the render steps and validation gate are checked
- **THEN** a step renders `prod-fleet/staging` to `out/staging/staging.yaml` after
  sourcing `env-resolve.sh staging`
- **AND** a step renders `prod-fleet/website-staging` to
  `out/website-staging/website-staging.yaml`
- **AND** `environments/sealed-secrets/staging.yaml` is copied to
  `out/sealed-secrets/staging/`
- **AND** the validation gate loop includes `${OUT_DIR}/staging` and
  `${OUT_DIR}/website-staging`

#### Scenario: Staging profile carries the offline digest placeholders

- **GIVEN** `environments/fleet-mentolder.yaml` documents placeholder digests as the
  offline fallback
- **WHEN** `environments/staging.yaml` is inspected
- **THEN** it defines `WEBSITE_IMAGE_DIGEST` and `BRETT_IMAGE_DIGEST` with the same
  documented placeholder pattern used by the fleet brand profiles

### Requirement: Rendered Staging CronJobs Target the Staging Website

The rendered staging manifest SHALL point every app CronJob at the staging website:
the `WEBSITE_NAMESPACE` environment value in the rendered
`out/staging/staging.yaml` SHALL be `website-staging`, so scheduled-publish,
admin-actions-cleanup, notify-unread and tests-results-retention curl
`website.website-staging.svc.cluster.local` and never fire against the production
website namespace.

#### Scenario: CronJobs resolve the staging website namespace

- **GIVEN** the staging overlay is built (`kustomize build prod-fleet/staging`)
- **WHEN** the `WEBSITE_NAMESPACE` container-env values of the CronJob manifests are
  inspected
- **THEN** they resolve to `website-staging`
- **AND** no rendered CronJob command references `website.website.svc.cluster.local`

#### Scenario: Website staging overlay deploys into website-staging

- **GIVEN** `prod-fleet/website-staging/kustomization.yaml` is built
- **WHEN** the namespace fields of the rendered resources are inspected
- **THEN** they resolve to `website-staging`
