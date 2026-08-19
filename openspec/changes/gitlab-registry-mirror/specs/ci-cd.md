## ADDED Requirements

### Requirement: Build-Artefakte werden in eine zweite Registry gespiegelt

The system SHALL mirror every container image it publishes to `ghcr.io` into a
second registry (`registry.gitlab.com`), within the same workflow run that built
it. The mirror SHALL reuse the artifact already built — it SHALL NOT rebuild the
image for the second registry.

The mirror SHALL run as a **separate, non-blocking step** after the `ghcr.io`
push, never as additional entries in the build step's `tags:` list. The tag list
is atomic: a GitLab tag inside it would tie the primary `ghcr.io` push to
GitLab's availability, so an outage of the secondary registry — or a missing
token — would break the primary path. Redundancy must not lower the availability
of the path it protects.

#### Scenario: Build-Workflow ruft den Spiegel-Schritt auf

- **GIVEN** a build workflow under `.github/workflows/` that uses `docker/build-push-action`
- **WHEN** the workflow's steps are inspected
- **THEN** a step invoking `scripts/mirror-image-to-gitlab.sh` follows the build step
- **AND** that step carries `continue-on-error: true`

#### Scenario: Fehlende Konfiguration faerbt keinen Build rot

- **GIVEN** neither `GITLAB_REGISTRY_PREFIX` nor `GITLAB_REGISTRY_TOKEN` is configured
- **WHEN** the mirror step runs
- **THEN** it reports that the mirror is not configured and exits 0
- **AND** the `ghcr.io` push of the same workflow is unaffected

#### Scenario: Kein zweiter Build für die zweite Registry

- **GIVEN** a build workflow that publishes to both registries
- **WHEN** its build steps are counted
- **THEN** the image is built exactly once and both registries receive the same digest

#### Scenario: Fremd-Images werden nicht gespiegelt

- **GIVEN** `.github/workflows/renovate.yml`, which references the third-party image `ghcr.io/renovatebot/renovate`
- **WHEN** the workflow is inspected
- **THEN** it contains no mirror step, because the repository does not build that image

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
