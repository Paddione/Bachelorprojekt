## ADDED Requirements

### Requirement: GHCR Authentication for Private Unlinked Packages

Any workflow that resolves image digests from GHCR packages which are private and not linked to
the repository MUST authenticate with `secrets.GH_PAT` and `github.repository_owner`. The
repository-scoped `GITHUB_TOKEN` cannot read such packages regardless of the declared
`packages:` permission, and `github.actor` is the triggering actor rather than the token owner,
which breaks the login on bot-initiated pushes.

#### Scenario: Renderer resolves a private unlinked package digest

- **GIVEN** `.github/workflows/render-fleet-artifact.yml` invokes `scripts/resolve-image-digest.sh`
  for `ghcr.io/paddione/workspace-brett:latest`
- **WHEN** the workflow's GHCR login step is inspected
- **THEN** its `password` is `secrets.GH_PAT`
- **AND** its `username` is `github.repository_owner`

#### Scenario: Bot-initiated push authenticates as the token owner

- **GIVEN** a push to `main` authored by a bot such as release-please
- **WHEN** the GHCR login step runs
- **THEN** the login uses the repository owner as username rather than the triggering actor
- **AND** the digest resolve step does not fail with `DENIED`
