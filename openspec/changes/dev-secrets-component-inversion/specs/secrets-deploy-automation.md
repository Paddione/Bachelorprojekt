# secrets-deploy-automation Delta

## MODIFIED Requirements

### Requirement: Schema is authoritative over the dev secrets file

`environments/schema.yaml` SHALL be the single authoritative list of secret key names.
`components/dev-secrets/workspace-secrets.yaml` (Secret `workspace-secrets`) SHALL carry dev
placeholder values for the subset of those keys that a local k3d stack can use, and SHALL NOT
carry any key that the schema does not declare. On conflict the schema wins: a key that exists
only in the dev secrets file is removed there (or added to the schema if a live consumer needs
it), never tolerated silently.

#### Scenario: Key present in dev secrets but absent from schema

- **GIVEN** `components/dev-secrets/workspace-secrets.yaml` declares a key under
  `workspace-secrets` that `environments/schema.yaml` does not list in `secrets`
- **WHEN** `tests/unit/secrets-sync.bats` runs
- **THEN** the run fails and names the offending key
- **AND** the resolution is either removing the key from the dev secrets file or declaring it
  in `environments/schema.yaml` — the test is not relaxed by an allowlist

## MODIFIED Requirements

### Requirement: Deliberate dev absence is annotated, not allowlisted

The system SHALL support a per-secret annotation `dev_absent: true` plus a non-empty
`dev_absent_reason: "<text>"` in `environments/schema.yaml` for keys that intentionally have no
counterpart in `components/dev-secrets/workspace-secrets.yaml`. A secret with `required: true`
SHALL NOT be annotated `dev_absent`. The schema↔dev comparison SHALL skip annotated keys
instead of relying on a hard-coded allowlist inside the test.

#### Scenario: Annotated key is skipped

- **GIVEN** a secret in `environments/schema.yaml` carries `dev_absent: true` and a non-empty
  `dev_absent_reason`
- **WHEN** the schema↔dev comparison runs
- **THEN** the key is not reported as missing from the dev secrets file

## MODIFIED Requirements

### Requirement: Stale dev_absent annotations are detected

The guard SHALL fail when a key annotated `dev_absent: true` is nevertheless present in
`components/dev-secrets/workspace-secrets.yaml` under `workspace-secrets`, so the annotation
cannot outlive its reason.

#### Scenario: Annotation contradicts the dev file

- **GIVEN** `FOO_TOKEN` carries `dev_absent: true` and also appears under `workspace-secrets`
  in `components/dev-secrets/workspace-secrets.yaml`
- **WHEN** the guard runs
- **THEN** the run fails and reports `FOO_TOKEN` as a stale annotation
