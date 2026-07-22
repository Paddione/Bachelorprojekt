## MODIFIED Requirements

### Requirement: discover-versions.sh ermittelt Tool-Versionen ohne Flux

The system SHALL discover current versions for k3s, sealed-secrets Helm chart,
cert-manager, and longhorn Helm chart via GitHub API and Helm search, and SHALL
write them to `versions.yaml` when `--update` is passed. Because the fleet cluster
now runs a pull-based GitOps reconciler (Flux Operator), the previous prohibition
on tracking a `flux:` key is REMOVED: the system MAY additionally track a Flux
distribution / flux-operator chart version, but MUST NOT fail when that key is
absent (the four core keys remain mandatory).

#### Scenario: Dry-Run gibt alle Pflicht-Versionen aus

- **GIVEN** mocked `curl` and `helm` commands returning fixture values
- **WHEN** `bash scripts/discover-versions.sh` runs without `--update`
- **THEN** the output contains `k3s:`, `sealed_secrets_chart:`, `cert_manager:`,
  and `longhorn_chart:`
- **AND** no `versions.yaml` file is written

#### Scenario: --update schreibt versions.yaml mit allen vier Pflicht-Keys

- **GIVEN** `--update --versions-file <path>` are passed with mocked commands
- **WHEN** `bash scripts/discover-versions.sh --update` runs
- **THEN** the file exists and contains all four mandatory keys (`k3s:`,
  `sealed_secrets_chart:`, `cert_manager:`, `longhorn_chart:`)
- **AND** the presence or absence of an optional `flux:` key does NOT cause a
  non-zero exit

## ADDED Requirements

### Requirement: Pull-based Reconciliation ist der Standard-Deploy-Pfad auf fleet

The system SHALL reconcile the fleet cluster's desired state from an OCI artifact
via a Flux Operator `FluxInstance` and a `Kustomization` dependency chain
(sealed-secrets → platform → per-brand and per-website overlays), rather than by a
push-based `kubectl apply`. The `FluxInstance` SHALL declare `spec.distribution`
(registry and version) and `spec.sync` pointing at the private OCI artifact
(`kind: OCIRepository`, the artifact URL, `ref`, and `path: clusters/fleet`) with a
`pullSecret` of type `kubernetes.io/dockerconfigjson`. Every `Kustomization` SHALL
set `spec.prune` explicitly; brand and website Kustomizations SHALL use
`prune: true` with `wait: true`, while the sealed-secrets Kustomization SHALL use
`prune: false` so Secrets are never garbage-collected.

#### Scenario: Reconcile-Kette wird Ready

- **GIVEN** the FluxInstance and Kustomization CRs are applied on fleet
- **WHEN** the reconciler pulls the OCI artifact
- **THEN** `flux-sealed-secrets`, `flux-platform`, and the brand/website
  Kustomizations all reach `Ready=True`
- **AND** `flux-platform` reconciles only after `flux-sealed-secrets` is ready
  (dependsOn ordering)

#### Scenario: Drift wird zurückgedreht

- **GIVEN** a resource managed by a `prune: true` Kustomization is edited manually
  with `kubectl edit`
- **WHEN** the next reconcile interval elapses
- **THEN** the manual change is reverted to the artifact state (self-healing)

### Requirement: workspace:deploy ist Break-Glass und deprecated

The system SHALL keep `task workspace:deploy ENV=<brand>` functional as a
break-glass push path, but SHALL mark it deprecated and SHALL document that an
operator MUST first suspend the affected Kustomization (`flux suspend kustomization
<name>`) before a manual push, otherwise drift correction reverts the change.

#### Scenario: Deprecation-Hinweis ist sichtbar

- **GIVEN** the `workspace:deploy` task body
- **WHEN** an operator reads it
- **THEN** it contains a deprecation note referencing `flux suspend kustomization`
  as the required precondition for a manual break-glass deploy

### Requirement: Das OCI-Artefakt enthält keine Klartext-Secrets

The system SHALL render the fleet overlays into the OCI artifact using the existing
`kustomize build | sed | envsubst | sed` pipeline with a substitution allowlist that
EXCLUDES every variable declared under the `secrets:` block of
`environments/schema.yaml`. Secret material SHALL reach the cluster only via the
committed SealedSecrets copied into the artifact's `sealed-secrets/` path, never as a
substituted literal in a rendered manifest.

#### Scenario: Render lässt Secret-Platzhalter unsubstituiert

- **GIVEN** a schema variable declared under `secrets:` (e.g. `STUDIO_DB_URL`) that
  also appears in the envsubst list
- **WHEN** `scripts/flux-render-artifact.sh out/` runs
- **THEN** no rendered manifest under `out/` contains the plaintext secret value
- **AND** the secret is delivered exclusively through a SealedSecret under
  `out/sealed-secrets/`
