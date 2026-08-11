## ADDED Requirements

### Requirement: Schema is authoritative over the dev secrets file

`environments/schema.yaml` SHALL be the single authoritative list of secret key names.
`k3d/secrets.yaml` (Secret `workspace-secrets`) SHALL carry dev placeholder values for the
subset of those keys that a local k3d stack can use, and SHALL NOT carry any key that the
schema does not declare. On conflict the schema wins: a key that exists only in
`k3d/secrets.yaml` is removed there (or added to the schema if a live consumer needs it),
never tolerated silently.

#### Scenario: Key present in dev secrets but absent from schema

- **GIVEN** `k3d/secrets.yaml` declares a key under `workspace-secrets` that
  `environments/schema.yaml` does not list in `secrets`
- **WHEN** `tests/unit/secrets-sync.bats` runs
- **THEN** the run fails and names the offending key
- **AND** the resolution is either removing the key from `k3d/secrets.yaml` or declaring it in
  `environments/schema.yaml` — the test is not relaxed by an allowlist

### Requirement: Deliberate dev absence is annotated, not allowlisted

The system SHALL support a per-secret annotation `dev_absent: true` plus a non-empty
`dev_absent_reason: "<text>"` in `environments/schema.yaml` for keys that intentionally have no
counterpart in `k3d/secrets.yaml` (external provider credentials, `flux-system`-only keys,
host-generated key material, and secrets whose service is not part of the k3d base). A secret
with `required: true` SHALL NOT be annotated `dev_absent`. The schema↔dev comparison SHALL skip
annotated keys instead of relying on a hard-coded allowlist inside the test.

#### Scenario: Annotated key is skipped

- **GIVEN** a secret in `environments/schema.yaml` carries `dev_absent: true` and a non-empty
  `dev_absent_reason`
- **WHEN** the schema↔dev comparison runs
- **THEN** the key is not reported as missing from `k3d/secrets.yaml`

#### Scenario: Annotation without a reason is rejected

- **GIVEN** a secret carries `dev_absent: true` but no `dev_absent_reason` (or an empty one)
- **WHEN** `tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats` runs
- **THEN** the run fails and names the offending key

#### Scenario: Required secret cannot be annotated away

- **GIVEN** a secret carries both `required: true` and `dev_absent: true`
- **WHEN** the guard runs
- **THEN** the run fails and names the offending key

### Requirement: Stale dev_absent annotations are detected

The guard SHALL fail when a key annotated `dev_absent: true` is nevertheless present in
`k3d/secrets.yaml` under `workspace-secrets`, so the annotation cannot outlive its reason.

#### Scenario: Annotation contradicts the dev file

- **GIVEN** `FOO_TOKEN` carries `dev_absent: true` and also appears under `workspace-secrets`
  in `k3d/secrets.yaml`
- **WHEN** the guard runs
- **THEN** the run fails and reports `FOO_TOKEN` as a stale annotation

### Requirement: Keycloak-era OIDC key names stay retired

The Keycloak-era key names `BRAINSTORM_OIDC_SECRET`, `CLAUDE_CODE_OIDC_SECRET`,
`COMFY_OIDC_SECRET`, `DOCS_OIDC_SECRET`, `MAIL_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`,
`RECOVERY_OIDC_SECRET`, `TRAEFIK_OIDC_SECRET`, `VAULTWARDEN_OIDC_SECRET` and
`WEBSITE_OIDC_SECRET` SHALL NOT appear under `workspace-secrets` in `k3d/secrets.yaml`. Their
Pocket ID successors are the `POCKET_ID_<SERVICE>_SECRET` names declared in the schema.

#### Scenario: A retired name is reintroduced

- **GIVEN** `k3d/secrets.yaml` reintroduces `DOCS_OIDC_SECRET` under `workspace-secrets`
- **WHEN** the guard runs
- **THEN** the run fails and names the key

### Requirement: Pocket ID client secrets consumed by the seed Job are declared

Every `POCKET_ID_<SERVICE>_SECRET` key referenced by a `secretKeyRef` in
`k3d/pocket-id-client-seed.yaml` SHALL be declared in `environments/schema.yaml`. This closes
the gap where `POCKET_ID_CLAUDE_CODE_SECRET` was consumed by the seed Job and shipped in the
fleet sealed secrets while being absent from the authoritative schema.

#### Scenario: Seed Job references an undeclared key

- **GIVEN** `k3d/pocket-id-client-seed.yaml` references `POCKET_ID_CLAUDE_CODE_SECRET`
- **WHEN** the guard runs
- **THEN** the run passes only if `environments/schema.yaml` declares that key
