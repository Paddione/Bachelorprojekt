# pocket-id-oidc-wiring


<!-- merged from change delta pocket-id-oidc-wiring.md on 2026-06-22 -->

## Purpose

### Requirement: Pocket ID OIDC clients are deploy-seeded

The system SHALL register and reconcile all OIDC clients in Pocket ID
automatically during `task workspace:deploy`, without manual UI steps, so that
every OIDC-protected endpoint authenticates after a single deploy.

#### Scenario: Seed Job upserts every client with a non-empty secret

- **GIVEN** Pocket ID is running and `workspace-secrets`/`website-secrets`
  contain the `POCKET_ID_*_SECRET` values
- **WHEN** the `pocket-id-client-seed` Job runs after a deploy
- **THEN** each client whose secret env is set is created (or PUT-updated if it
  already exists) in Pocket ID, and clients with an empty/absent secret are
  skipped without failing the Job.

## Requirements

### Requirement: Dev secret manifests carry the Pocket ID keys

The dev `workspace-secrets` and `website-secrets` manifests SHALL declare the
`POCKET_ID_*` keys so no OIDC-dependent pod enters `CreateContainerConfigError`.

#### Scenario: Pods start in a fresh k3d cluster

- **GIVEN** a fresh k3d cluster deployed from the `k3d/` base
- **WHEN** the OIDC-dependent pods (oauth2-proxy-*, website, brett, pocket-id) start
- **THEN** all required `POCKET_ID_*` secret keys resolve and the pods reach Ready.
