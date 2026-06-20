# secret-rotation

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

### Requirement: Schema-driven secret generation

The system SHALL generate all secrets for an environment from `environments/schema.yaml` via `env:generate ENV=<name>`, writing the result to `environments/.secrets/<env>.yaml` (chmod 600, gitignored), and SHALL refuse to overwrite an existing file without explicit deletion.

#### Scenario: Fresh generate for a new environment

- **GIVEN** no `environments/.secrets/mentolder.yaml` exists
- **WHEN** `task env:generate ENV=mentolder` runs
- **THEN** a new file is written with randomly generated values for every `generate: true` secret and prompted/copied values for `generate: false` entries; file permissions are 600

#### Scenario: Existing secrets file is protected

- **GIVEN** `environments/.secrets/mentolder.yaml` already exists
- **WHEN** `task env:generate ENV=mentolder` is run again
- **THEN** it aborts with an error and does NOT overwrite the existing secrets

#### Scenario: Required secret with no source in non-interactive context

- **GIVEN** a required `generate: false` secret has no value in the env file and no TTY is available
- **WHEN** `env-generate.sh` runs
- **THEN** it exits non-zero with an explicit error naming the missing key

---

### Requirement: Dev-placeholder detection blocks sealing

The system SHALL scan `environments/.secrets/<env>.yaml` for dev-prefix values, `_dev_placeholder` / `_placeholder` suffixes, stub literals (`not-configured`, `MANAGED_EXTERNALLY`), and empty values for `required: true` secrets before calling `kubeseal`, and SHALL refuse to seal unless `--force` is passed.

#### Scenario: Dev value detected in prod secrets file

- **GIVEN** `environments/.secrets/mentolder.yaml` contains `KEYCLOAK_DB_PASSWORD: "devkeycloakdb"`
- **WHEN** `task env:seal ENV=mentolder` runs without `--force`
- **THEN** it exits non-zero, listing the offending keys, and writes no `environments/sealed-secrets/mentolder.yaml`

#### Scenario: Duplicate keys block sealing unconditionally

- **GIVEN** the secrets file contains the same key twice
- **WHEN** `env-seal.sh` runs
- **THEN** it exits non-zero regardless of `--force` (duplicate keys are a structural error with no valid override)

---

### Requirement: Sealing-certificate drift detection

The system SHALL, before sealing, compare the fingerprint of the cached `environments/certs/<env>.pem` against the live cluster's sealing certificate when the cluster is reachable, and SHALL abort with a drift diagnosis on mismatch unless `--reuse-cert` is passed; when the cluster is unreachable it SHALL emit a warning and continue with the cached cert.

#### Scenario: Cached cert drifted from live controller

- **GIVEN** a cached `environments/certs/mentolder.pem` whose SHA-256 differs from the live fleet cluster sealing cert
- **WHEN** `task env:seal ENV=mentolder` runs without `--reuse-cert`
- **THEN** it aborts with "Sealing cert drift" and prompts to run `task env:fetch-cert ENV=mentolder`

#### Scenario: Cluster unreachable during sealing

- **GIVEN** the fleet cluster is not reachable from the workstation
- **WHEN** `env-seal.sh` reuses the cached cert
- **THEN** it emits "Cert-Fingerprint NICHT verifiziert" to stderr and proceeds to seal against the cached cert

---

### Requirement: SealedSecret covers all schema-required keys

The system SHALL verify that `environments/sealed-secrets/<env>.yaml` contains an `encryptedData` entry for every `required: true` secret and every `sealed: true` setup_var from `environments/schema.yaml`, and SHALL fail `env:validate ENV=<env>` when any required key is absent from the sealed file.

#### Scenario: Required key missing from sealed-secrets file

- **GIVEN** `environments/sealed-secrets/mentolder.yaml` is missing `SHARED_DB_PASSWORD`
- **WHEN** `task env:validate ENV=mentolder` runs
- **THEN** it exits non-zero reporting "Sealed secret missing required key: SHARED_DB_PASSWORD"

#### Scenario: All keys present

- **GIVEN** the sealed-secrets file covers all schema-required keys
- **WHEN** `task env:validate ENV=mentolder` runs
- **THEN** it exits zero

---

### Requirement: Prod overlay strips dev-placeholder Secret before apply

The system SHALL, via the `$patch: delete` directive in `prod/kustomization.yaml`, remove the `workspace-secrets` Secret (and other dev-placeholder secrets) from the kustomize output so that `kubectl apply` never overwrites the controller-managed SealedSecret decryption with dev placeholder values.

#### Scenario: workspace:deploy on prod environment

- **GIVEN** `k3d/secrets.yaml` defines `workspace-secrets` with dev values
- **WHEN** `task workspace:deploy ENV=mentolder` builds and applies the `prod-fleet/mentolder/` overlay
- **THEN** the `workspace-secrets` Secret is absent from the applied manifests; only the SealedSecret-decrypted version lives in the cluster

#### Scenario: Direct base apply (footgun prevention)

- **GIVEN** an operator applies `k3d/kustomization.yaml` directly (without the prod overlay)
- **WHEN** `kubectl apply` runs
- **THEN** only the dev-value Secret is applied — the prod overlay and its `$patch: delete` are not present, highlighting why applying the base directly to prod is prohibited

---

### Requirement: Extra-namespace secret projection

The system SHALL, during sealing, produce one additional SealedSecret document per unique `(namespace, secret)` pair declared in `extra_namespaces` entries of `environments/schema.yaml`, containing only the projected keys (with optional `dest_key` renaming), appended as additional YAML documents in the same `environments/sealed-secrets/<env>.yaml` file.

#### Scenario: SMTP password projected into website and monitoring namespaces

- **GIVEN** `SMTP_PASSWORD` has `extra_namespaces` entries for `website/website-secrets` and `monitoring/alertmanager-smtp`
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** `environments/sealed-secrets/mentolder.yaml` contains three SealedSecret documents: `workspace/workspace-secrets`, `website/website-secrets` (key `SMTP_PASSWORD`), and `monitoring/alertmanager-smtp` (key `SMTP_PASSWORD`)

#### Scenario: Missing source key skipped with warning

- **GIVEN** an `extra_namespaces` entry references a key not present in the secrets file
- **WHEN** sealing runs
- **THEN** the key is skipped with a stderr warning and sealing continues for the remaining keys

---

### Requirement: Post-rotation DB password reconciliation

The system SHALL, after applying a new SealedSecret (whether via `secrets:sync`, `workspace:db:restore`, or `workspace:post-setup`), execute `workspace:sync-db-passwords` to issue `ALTER USER … PASSWORD` for each database role and, for Nextcloud, patch `config.php` in-place before restarting the pod, so that the Postgres role passwords and the running workloads converge with `workspace-secrets`.

#### Scenario: secrets:sync warns about unreconciled workloads

- **GIVEN** `task secrets:sync` has applied a new SealedSecret to the fleet cluster
- **WHEN** it finishes
- **THEN** it prints a warning that workloads and Postgres still hold the old value and references `task secrets:sync:full`

#### Scenario: secrets:sync:full completes full reconciliation

- **GIVEN** a rotated SealedSecret has been applied
- **WHEN** `task secrets:sync:full` runs
- **THEN** it applies the SealedSecret, calls `workspace:sync-db-passwords` for both brands, and restarts all Deployments so no pod retains stale credentials

---

### Requirement: Sealed Secrets controller install order on cluster reset

The system SHALL enforce the bring-up order: controller install (`sealed-secrets:install`) → cert fetch (`env:fetch-cert`) → reseal (`env:seal`) → workspace deploy (`workspace:deploy`), and the `sealed-secrets:install` task SHALL pin the Helm chart version from `environments/versions.yaml` (`sealed_secrets_chart:`) so every cluster runs an identical controller version.

#### Scenario: Controller installed from pinned chart version

- **GIVEN** `environments/versions.yaml` contains `sealed_secrets_chart: 2.18.6`
- **WHEN** `task sealed-secrets:install ENV=fleet` runs
- **THEN** Helm installs exactly `sealed-secrets/sealed-secrets@2.18.6` with `--version 2.18.6` and logs the pinned version

#### Scenario: Fresh cluster reseal after keypair rotation

- **GIVEN** a cluster reset has replaced the Sealed Secrets controller keypair, invalidating all existing SealedSecrets
- **WHEN** the operator runs `env:fetch-cert ENV=<env>` followed by `env:seal ENV=<env>`
- **THEN** a new `environments/sealed-secrets/<env>.yaml` is written sealed against the new controller cert and the old undecryptable file is replaced
