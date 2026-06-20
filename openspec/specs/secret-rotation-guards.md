# secret-rotation-guards


<!-- merged from change delta secret-rotation-guards.md on 2026-06-20 -->

### Requirement: Fail-closed SealedSecret decrypt-wait

The system SHALL wait for the controller-decrypted `workspace-secrets` Secret via a pure, testable helper (`scripts/wait-for-sealed-secret.sh`) that fails closed on timeout, and `workspace:deploy` SHALL abort the deploy when the Secret never appears. The helper SHALL read `${KUBECTL:-kubectl}` so tests can inject a fake, accept `--context/--namespace/--secret/--timeout`, and default to a generous timeout (≥ 60s).

#### Scenario: SealedSecret never decrypts

- **GIVEN** a non-dev deploy where the sealing cert is stale and the SealedSecret never decrypts
- **WHEN** `scripts/wait-for-sealed-secret.sh --secret workspace-secrets --timeout 90` runs
- **THEN** it exits non-zero with a stale-cert diagnosis and `workspace:deploy` aborts instead of reporting green

#### Scenario: Secret present (happy path)

- **GIVEN** a deploy where the controller decrypts the SealedSecret within the timeout
- **WHEN** the helper polls
- **THEN** it exits zero as soon as the Secret is present and the deploy continues

### Requirement: keycloak-sync fail-closed in non-dev

The system SHALL abort `keycloak-sync.sh` with a non-zero exit when, in a non-dev run, Keycloak is not ready, the admin token cannot be obtained, or any client/group sync FAILED. A documented soft-override `KEYCLOAK_SYNC_SOFT=1` SHALL downgrade these hard-fails to warnings. In `ENV=dev` the script SHALL stay soft.

#### Scenario: Non-dev unreadiness aborts the deploy step

- **GIVEN** `ENV=mentolder` and Keycloak is not HTTP-ready (or `FAILED>0` after PUTs)
- **WHEN** `keycloak-sync.sh` runs as part of `workspace:deploy`
- **THEN** it exits non-zero so the deploy fails loudly instead of leaving an OIDC-secret/realm-DB mismatch

#### Scenario: dev and soft-override stay soft

- **GIVEN** `ENV=dev`, or `ENV=mentolder` with `KEYCLOAK_SYNC_SOFT=1`
- **WHEN** Keycloak is unready
- **THEN** the script warns and exits zero (no deploy abort)

### Requirement: env-seal fail-closed on sealing-cert drift

The system SHALL, before reusing a cached `certs/<env>.pem`, compare its fingerprint against the live cluster sealing cert when the cluster is reachable, and SHALL fail closed on drift unless `--reuse-cert` is passed. When the cluster is unreachable it SHALL emit an explicit "not verified" warning rather than failing.

#### Scenario: Reused cert drifted from the live controller

- **GIVEN** a cached `certs/mentolder.pem` whose fingerprint differs from the reachable cluster's sealing cert
- **WHEN** `env-seal.sh --env mentolder` runs without `--reuse-cert`
- **THEN** it aborts with a drift diagnosis (preventing an undecryptable seal)

#### Scenario: Cluster unreachable

- **GIVEN** the cluster is unreachable during sealing
- **WHEN** `env-seal.sh` reuses the cached cert
- **THEN** it warns "Cert-Fingerprint NICHT verifiziert" and continues sealing

### Requirement: Restore re-aligns role passwords

The system SHALL chain `workspace:sync-db-passwords` into `workspace:db:restore` (and `recovery:restore-table`) so a restore re-aligns Postgres role passwords with `workspace-secrets`, and the restore guidance SHALL point at `sync-db-passwords`.

#### Scenario: DB restore followed by automatic re-sync

- **GIVEN** a completed `workspace:db:restore`
- **WHEN** the task finishes
- **THEN** `workspace:sync-db-passwords` runs automatically so newly started pods do not crashloop on auth drift

### Requirement: app-install reseals after secret processing

The system SHALL, after `app-install.sh` writes plaintext app secrets, re-seal the environment so the committed SealedSecret is not stale, and SHALL fail closed in non-dev when the reseal fails (override `APP_INSTALL_SKIP_SEAL=1`). In dev it SHALL continue.

#### Scenario: Non-dev install with a failing reseal

- **GIVEN** `ENV=mentolder` and the reseal step fails (e.g. cert drift)
- **WHEN** `app-install.sh` runs without `APP_INSTALL_SKIP_SEAL=1`
- **THEN** it aborts before deploying so the cluster mirror is never left stale

### Requirement: secrets:sync workload-reconcile awareness

The system SHALL, after `secrets:sync` applies a SealedSecret, emit a reminder that workloads and Postgres still hold the old value, and SHALL provide a `secrets:sync:full` companion that applies, runs `sync-db-passwords`, and rolls the consumer deployments.

#### Scenario: Lightweight apply warns about the landmine

- **GIVEN** `task secrets:sync` has applied the SealedSecret
- **WHEN** it finishes
- **THEN** it prints the un-reconciled-workload reminder and references `secrets:sync:full`

### Requirement: rotate-tokens annotation and fail-loud reminder

The system SHALL stamp a queryable `claude-code/token-version` annotation on the `mcp-auth-proxy` Deployment after rotating MCP tokens, and SHALL emit an unmissable re-setup reminder on stderr.

#### Scenario: Token rotation stamps a version

- **GIVEN** `task claude-code:rotate-tokens ENV=mentolder`
- **WHEN** the rollout completes
- **THEN** the Deployment carries a `claude-code/token-version` annotation and a boxed re-setup notice is printed to stderr

### Requirement: ci-dummy-secrets fail-closed precondition

The system SHALL refuse to write placeholder secret files unless `CI=true` or `ENV ∈ {dev, ""}`, and SHALL additionally refuse when the active kube-context is a prod brand (and not a k3d context). It SHALL write no files on refusal.

#### Scenario: Prod brand without CI refuses

- **GIVEN** `ENV=mentolder` and `CI` unset
- **WHEN** `ci-dummy-secrets.sh` runs
- **THEN** it exits non-zero and writes neither `k3d/secrets.yaml` nor `k3d/backup-secrets.yaml`

#### Scenario: CI and dev proceed

- **GIVEN** `CI=true` (any ENV) or `ENV=dev`
- **WHEN** the script runs
- **THEN** it writes the placeholder files as before

### Requirement: keycloak-sync warns on empty website-secrets

The system SHALL emit a loud stderr warning when the `website-secrets` `WEBSITE_OIDC_SECRET` fetch is empty (since `env:seal` of `workspace-secrets` does not co-rotate it), and the `env:seal` task SHALL document the co-rotation requirement. The KV-map emitted on stdout SHALL be unchanged.

#### Scenario: website-secrets fetch is empty

- **GIVEN** a non-dev sync where `website-secrets/WEBSITE_OIDC_SECRET` cannot be read
- **WHEN** `keycloak-sync.sh` builds its KV-map
- **THEN** it warns on stderr that the website SSO client is not co-synced, without polluting the stdout KV-map
