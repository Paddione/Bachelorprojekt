# Spec Delta: env-seal-empty-value-keys

## ADDED Requirements

### Requirement: env-seal extra_namespaces honours schema `required` flag

The `scripts/env-seal.sh seal_extra_namespace_secrets` function MUST honour the
schema's `required` flag for every key in `extra_namespaces`:

- If the schema entry has `required: true` (or the `required` flag is missing —
  fail-closed default) AND the plaintext value in `environments/.secrets/<env>.yaml`
  is empty or missing, the seal command MUST exit with a non-zero status and emit
  a clear `ERROR:` message identifying the key and the affected `(namespace, secret)`
  pair. The corresponding SealedSecret MUST NOT be written (incomplete state).

- If the schema entry has `required: false` AND the plaintext value is empty or
  missing, the key MUST still be written into the Secret manifest with an empty
  string value (`""`). The resulting SealedSecret MUST include the key so that
  Kubernetes `envFrom.secretKeyRef` resolves the key to an empty string at runtime
  (deterministically valid state, no `CreateContainerConfigError`).

- If the `required` flag in the schema has a value other than a recognised boolean
  (`true`/`false`/`yes`/`no`), the seal command MUST exit with a non-zero status
  and emit a clear `ERROR:` message — fail-closed on invalid schema.

#### Scenario: optional key with empty value is included in the SealedSecret

- **GIVEN** a schema entry `MY_OPTIONAL_KEY` with `required: false` and
  `extra_namespaces: [{namespace: website-test, secret: website-secrets}]`
- **AND** a plaintext secrets file where `MY_OPTIONAL_KEY: ""` (empty)
- **WHEN** `bash scripts/env-seal.sh --env <env> --env-dir <dir>` is run
- **THEN** the produced `sealed-secrets/<env>.yaml` MUST contain a SealedSecret
  with `metadata.namespace: website-test` and `metadata.name: website-secrets`
- **AND** the `spec.encryptedData` of that SealedSecret MUST include `MY_OPTIONAL_KEY`

#### Scenario: required key with empty value fails the seal command

- **GIVEN** a schema entry `MY_REQUIRED_KEY` with `required: true` and
  `extra_namespaces: [{namespace: website-test, secret: website-secrets}]`
- **AND** a plaintext secrets file where `MY_REQUIRED_KEY: ""` (empty)
- **WHEN** `bash scripts/env-seal.sh --env <env> --env-dir <dir>` is run
- **THEN** the seal command MUST exit with a non-zero status
- **AND** a message matching `ERROR:.*required key.*MY_REQUIRED_KEY` MUST appear
  on stderr

#### Scenario: required key with non-empty value is sealed successfully (regression)

- **GIVEN** a schema entry `MY_KEY` with `required: true` and
  `extra_namespaces: [{namespace: website-test, secret: website-secrets}]`
- **AND** a plaintext secrets file where `MY_KEY: "value-here"`
- **WHEN** `bash scripts/env-seal.sh --env <env> --env-dir <dir>` is run
- **THEN** the seal command MUST exit with status 0
- **AND** the produced `sealed-secrets/<env>.yaml` MUST contain a SealedSecret
  with `metadata.namespace: website-test` and `spec.encryptedData` including `MY_KEY`

### Requirement: Backwards-compatible re-seal (mentolder identity, korczewski additive only)

Re-sealing any existing environment with the new `seal_extra_namespace_secrets`
implementation MUST produce a sealed-secrets file that is either byte-identical
or strictly additive compared to the previously committed
`environments/sealed-secrets/<env>.yaml`. No keys may be removed by the new
implementation.

#### Scenario: mentolder re-seal is byte-identical

- **GIVEN** the currently committed `environments/sealed-secrets/mentolder.yaml`
  has been produced by the previous env-seal implementation
- **WHEN** `task env:seal ENV=mentolder` is run with the new implementation
- **THEN** `git diff environments/sealed-secrets/mentolder.yaml` MUST show
  zero changed lines

#### Scenario: korczewski re-seal is additive only

- **GIVEN** the currently committed `environments/sealed-secrets/korczewski.yaml`
  has been produced by the previous env-seal implementation
- **AND** the schema declares 5 optional+empty keys for `website-korczewski/website-secrets`
  (`DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEY_HASH`, `SEPA_CREDITOR_ID`,
  `SEPA_CREDITOR_NAME`, `SEPA_CREDITOR_IBAN`)
- **WHEN** `task env:seal ENV=korczewski` is run with the new implementation
- **THEN** `git diff environments/sealed-secrets/korczewski.yaml` MUST show only
  additions to `spec.encryptedData` for those 5 keys
- **AND** MUST NOT show any removals or modifications of previously-present keys

### Requirement: Test coverage for the empty-value-key bug

A BATS test file `tests/spec/env-seal-empty-value-keys.bats` MUST exist with
at minimum three test cases that exercise the new behaviour:

1. Optional+empty key → SealedSecret for the `extra_namespace` target IS
   written (currently fails — this is the regression test for G-CD01).
2. Required+empty key → seal exits with non-zero status and a clear error
   message that mentions `required` or the key name.
3. Happy path (all required keys with non-empty values) → seal exits 0 and
   the output contains the expected keys.

The tests MUST stub `kubeseal` via `PATH` override so they do not require a
real kubeseal binary or a live cluster. The tests MUST NOT modify any
production file (`environments/sealed-secrets/*`, real secrets, etc.).
