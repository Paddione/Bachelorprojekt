## ADDED Requirements

### Requirement: REQ-AUTHSSO-DBINIT-001 — Deterministic Pocket-ID database role provisioning

The `pocket-id-db-init` Job SHALL provision the `pocket_id` PostgreSQL role and its password
deterministically and idempotently, and SHALL NOT rely on shell- or Kubernetes-expanded `$$`
dollar-quoting inside a container `command`/`args` block.

#### Scenario: Dollar-quoted SQL survives container command expansion

- **GIVEN** the db-init container definition in `k3d/pocket-id.yaml`
- **WHEN** Kubernetes expands the container `command` (where `$$` is the escape for a literal `$`)
- **THEN** no PL/pgSQL dollar-quoted block is corrupted
- **AND** the psql session logs no `syntax error at or near "$"`

#### Scenario: Role password converges to the value in workspace-secrets

- **GIVEN** the `pocket_id` role already exists with an outdated password
- **WHEN** the db-init Job runs
- **THEN** the role password is set to the current `workspace-secrets` value via an idempotent
  `ALTER ROLE … WITH LOGIN PASSWORD`
- **AND** the Pocket-ID application connects without `SQLSTATE 28P01`

### Requirement: REQ-AUTHSSO-DBINIT-002 — Database bootstrap fails loudly

The `pocket-id-db-init` Job SHALL exit non-zero when database or role provisioning fails, and
SHALL NOT print a success marker unless every mandatory statement succeeded.

#### Scenario: SQL error aborts the Job

- **GIVEN** a statement in the database/role provisioning block returns an error
- **WHEN** the db-init container runs
- **THEN** the container exits non-zero
- **AND** the Job is reported as `Failed`, not `Completed`

#### Scenario: Best-effort admin bootstrap stays non-fatal but honest

- **GIVEN** the optional T001853 admin/api-key bootstrap cannot complete
- **WHEN** the db-init container finishes
- **THEN** it prints an explicit `SKIP:` reason instead of the success marker
- **AND** the mandatory database/role provisioning still governs the exit code

### Requirement: REQ-AUTHSSO-DBINIT-003 — API-key bootstrap resolves the real admin user

The admin api-key bootstrap SHALL resolve the target `pocket_id.users` row by lookup instead of a
hardcoded UUID, and SHALL be a no-op when the key is already registered.

#### Scenario: Existing admin user with a different UUID

- **GIVEN** `pocket_id.users` contains an admin row whose id is not
  `a0000000-0000-4000-8000-000000000001`
- **WHEN** the bootstrap inserts the `seed-deploy` api key
- **THEN** the row references the existing admin user's real id
- **AND** no `api_keys_user_id_fkey` foreign key violation occurs

### Requirement: REQ-AUTHSSO-SEED-001 — Seed Job is re-appliable under Flux

The `pocket-id-client-seed` Job SHALL be re-appliable by Flux even when an older Job object with a
different pod template already exists in the target namespace.

#### Scenario: Changed pod template does not block the Kustomization

- **GIVEN** `Job/pocket-id-client-seed` exists in the cluster with an older `spec.template`
- **WHEN** Flux reconciles a revision whose Job manifest differs
- **THEN** the apply succeeds (the Job is replaced rather than patched)
- **AND** the Kustomization does not report `field is immutable`

#### Scenario: A failing seed Job does not silently freeze the brand

- **GIVEN** the seed Job fails after the apply succeeded
- **WHEN** the operator inspects the brand's Kustomization
- **THEN** the failure is attributable to the Job itself, not to a rejected apply
- **AND** the generic freeze/drift behaviour remains the concern of T002207

### Requirement: REQ-AUTHSSO-SEED-002 — No untracked seed scheduling in the cluster

Pocket-ID seeding SHALL only run from objects that exist as manifests under `k3d/`. Hand-applied
`CronJob`/`Job` objects for seeding SHALL NOT exist in any workspace namespace.

#### Scenario: Nightly seed CronJob is either tracked or removed

- **GIVEN** `CronJob/pocket-id-client-seed` runs in `workspace` without a manifest in `k3d/`
- **WHEN** the change is applied
- **THEN** the CronJob either exists as a committed manifest or is removed from the cluster
- **AND** no seed schedule exists that git cannot account for
