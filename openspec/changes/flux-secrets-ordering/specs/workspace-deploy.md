## ADDED Requirements

### Requirement: Brand and staging Kustomizations reconcile after their Sealed Secrets

The system SHALL declare an explicit `dependsOn` ordering from each brand and
staging application Kustomization to its matching Sealed Secrets Kustomization,
so that Secret keys exist in the cluster before any workload referencing them is
applied.

- `flux-mentolder` SHALL declare `dependsOn: [flux-infra-controllers, flux-sealed-secrets-mentolder]`
- `flux-korczewski` SHALL declare `dependsOn: [flux-infra-controllers, flux-sealed-secrets-korczewski]`
- `flux-staging` SHALL declare `dependsOn: [flux-infra-controllers, flux-sealed-secrets-staging]`

#### Scenario: Secret key added alongside workload in one push

- **GIVEN** a commit adds a new `secretKeyRef` to a brand workload AND the
  matching key to `environments/sealed-secrets/fleet-<brand>.yaml`
- **WHEN** Flux reconciles the pushed `fleet-manifests` artifact
- **THEN** the `flux-sealed-secrets-<brand>` Kustomization reaches `Ready=True`
  before the brand application Kustomization starts applying, and the workload
  never observes a missing-key race

#### Scenario: No cross-brand or infra blocking introduced

- **GIVEN** the updated `dependsOn` lists
- **WHEN** `flux-sealed-secrets-korczewski` is unhealthy or slow
- **THEN** only `flux-korczewski` waits; `flux-mentolder`, `flux-staging` and
  `flux-infra-controllers` reconcile independently (no edge from brand stacks to
  foreign secret Kustomizations, no edge from infra to secrets)
