## ADDED Requirements

### Requirement: Build-Artefakte werden in eine zweite Registry gespiegelt

The system SHALL push every container image that it publishes to `ghcr.io` to a
second registry (`registry.gitlab.com`) under the same tags, within the same
workflow run that built it. The mirror SHALL reuse the artifact already built —
it SHALL NOT rebuild the image for the second registry.

#### Scenario: Build-Workflow pusht in beide Registries

- **GIVEN** a build workflow under `.github/workflows/` that pushes an image to `ghcr.io`
- **WHEN** the workflow's push step is inspected
- **THEN** its tag list contains at least one `registry.gitlab.com/` reference alongside the `ghcr.io/` references
- **AND** the workflow authenticates against `registry.gitlab.com` via `docker/login-action` using the `GITLAB_REGISTRY_TOKEN` secret

#### Scenario: Kein zweiter Build für die zweite Registry

- **GIVEN** a build workflow that publishes to both registries
- **WHEN** its build steps are counted
- **THEN** the image is built exactly once and both registries receive the same digest

### Requirement: Das signierte OCI-Artefakt wird mitsamt Signatur gespiegelt

The system SHALL mirror the `fleet-manifests` OCI artifact to
`registry.gitlab.com` using `cosign copy`, so that the cosign signature tags are
copied together with the artifact manifest. The mirror step SHALL run after the
signing step, and the workflow SHALL NOT use `crane copy` for this artifact
because it would leave the mirrored copy unsigned.

#### Scenario: Spiegel-Schritt folgt auf das Signieren

- **GIVEN** `.github/workflows/render-fleet-artifact.yml`
- **WHEN** the step order is inspected
- **THEN** a `cosign copy` step targeting `registry.gitlab.com` appears after the `cosign sign` step

#### Scenario: Die verify-Policy bleibt unverändert

- **GIVEN** `flux/clusters/fleet/oci-source.yaml`
- **WHEN** its `verify.matchOIDCIdentity` list is inspected
- **THEN** it accepts exactly one issuer, `token.actions.githubusercontent.com`
- **AND** no GitLab OIDC issuer is present

### Requirement: Die GitLab-Quelle liegt bereit, aber suspendiert

The system SHALL declare a second `OCIRepository` named `fleet-manifests-gitlab`
pointing at the GitLab registry with `suspend: true`, carrying the same cosign
`verify` block as the primary source. Switching to it SHALL be a manual runbook
step; no controller or automation SHALL switch sources on its own.

#### Scenario: Zweite Quelle ist deklariert und suspendiert

- **GIVEN** the Flux sources under `flux/clusters/fleet/`
- **WHEN** the `fleet-manifests-gitlab` OCIRepository is inspected
- **THEN** it carries `suspend: true`
- **AND** its `verify` block matches the primary source's issuer and subject

#### Scenario: Runbook beschreibt beide Richtungen

- **GIVEN** `docs/runbooks/gitlab-runner.md`
- **WHEN** the registry-failover section is inspected
- **THEN** it documents both switching to the GitLab source and switching back to ghcr.io
- **AND** it states that no new artifacts are produced while GitHub is unavailable
