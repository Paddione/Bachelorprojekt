# secret-rotation-guards


<!-- merged from change delta secret-rotation-guards.md on 2026-06-20 -->

## Purpose

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

## Requirements

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

### Requirement: git-crypt-guard detects encrypted vs. plaintext files

The system SHALL provide a `git-crypt-guard.sh is-encrypted` subcommand that exits 0 when a file begins with the 10-byte git-crypt magic header (`\x00GITCRYPT\x00`), and exits non-zero for plaintext, empty, or missing files. An unknown subcommand SHALL exit with code 2.

#### Scenario: Verschlüsselte Datei wird erkannt

- **GIVEN** eine Datei, die mit dem git-crypt Magic Header (`\x00GITCRYPT\x00`) beginnt
- **WHEN** `git-crypt-guard.sh is-encrypted <Datei>` ausgeführt wird
- **THEN** exit code ist 0 (Datei ist verschlüsselt)

#### Scenario: Plaintext, leere oder fehlende Datei wird abgelehnt

- **GIVEN** eine Datei mit Klartext-Inhalt, eine leere Datei oder eine nicht existierende Datei
- **WHEN** `git-crypt-guard.sh is-encrypted <Datei>` ausgeführt wird
- **THEN** exit code ist ungleich 0 (Datei gilt als NICHT verschlüsselt)
- **AND** ein unbekanntes Subcommand (`bogus`) gibt exit code 2 zurück

### Requirement: git-crypt-guard classifies managed secret paths

The system SHALL provide a `git-crypt-guard.sh is-managed` subcommand that exits 0 for paths that are under git-crypt management (`environments/.secrets/`, `deploy/mcp/claude-code-secrets.yaml`), and exits non-zero for public artefacts (`environments/certs/*.pem`) and placeholder files (`.gitkeep`).

#### Scenario: Verwaltete Secret-Pfade werden als managed erkannt

- **GIVEN** ein Pfad wie `environments/.secrets/mentolder.yaml` oder `deploy/mcp/claude-code-secrets.yaml`
- **WHEN** `git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist 0 (Pfad ist git-crypt-verwaltet)

#### Scenario: Öffentliche Zertifikate und Platzhalter sind NOT managed

- **GIVEN** ein Pfad wie `environments/certs/mentolder.pem` (öffentliches Sealing-Cert) oder `environments/.secrets/.gitkeep`
- **WHEN** `git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist ungleich 0 (Pfad ist NICHT git-crypt-verwaltet)

### Requirement: Three-way secret consistency between schema, dev secrets, and SealedSecrets

The system SHALL enforce that every key in `environments/schema.yaml` is present in `k3d/secrets.yaml` (workspace-secrets), that no orphan keys exist in `k3d/secrets.yaml` without a schema entry, and that every `required: true` schema key is present in each per-brand SealedSecret file (`environments/sealed-secrets/mentolder.yaml` and `environments/sealed-secrets/korczewski.yaml`). Optional (`required: false`) schema keys MAY be absent from SealedSecret files.

#### Scenario: Schema-Key fehlt in k3d/secrets.yaml oder Orphan-Key vorhanden

- **GIVEN** `environments/schema.yaml` enthält einen Schlüssel, der in `k3d/secrets.yaml workspace-secrets` nicht vorhanden ist — oder umgekehrt ein Key in `k3d/secrets.yaml` existiert, der nicht im Schema steht
- **WHEN** der Three-way-Consistency-Check ausgeführt wird (z. B. `task test:all` / BATS `secrets-sync.bats`)
- **THEN** der Check schlägt fehl und listet die fehlenden bzw. verwaisten Keys auf

#### Scenario: Pflicht-Schema-Keys fehlen in einem Brand-SealedSecret

- **GIVEN** ein required-Key aus `environments/schema.yaml` ist in `environments/sealed-secrets/mentolder.yaml` oder `environments/sealed-secrets/korczewski.yaml` nicht im `spec.encryptedData`-Block vorhanden
- **WHEN** der SealedSecret-Konsistenz-Check läuft
- **THEN** der Check schlägt fehl und benennt den fehlenden Key sowie das betroffene Brand-File — optionale Keys (`required: false`) werden dabei übersprungen

## Testszenarien

<!-- merged from BATS unit tests -->

### Requirement: ci-dummy-secrets fail-closed precondition
<!-- bats: secret-task-guards.bats -->

The system SHALL refuse to write placeholder secret files unless `CI=true` or `ENV ∈ {dev, ""}`.

#### Scenario: Prod-Brand ohne CI wird abgelehnt (mentolder) *(BATS)*
- **GIVEN** `ENV=mentolder` und `CI` ist nicht gesetzt
- **WHEN** `scripts/ci-dummy-secrets.sh` ausgeführt wird
- **THEN** exit code ist ungleich 0 und weder `k3d/secrets.yaml` noch `k3d/backup-secrets.yaml` wurden geschrieben

#### Scenario: Prod-Brand ohne CI wird abgelehnt (korczewski) *(BATS)*
- **GIVEN** `ENV=korczewski` und `CI` ist nicht gesetzt
- **WHEN** `scripts/ci-dummy-secrets.sh` ausgeführt wird
- **THEN** exit code ist ungleich 0 (Ablehnung für alle prod-Brands)

#### Scenario: CI=true lässt die Ausführung zu *(BATS)*
- **GIVEN** `CI=true` und `ENV=mentolder`
- **WHEN** `scripts/ci-dummy-secrets.sh` ausgeführt wird
- **THEN** exit code ist 0 und `k3d/secrets.yaml` wurde geschrieben

#### Scenario: ENV=dev lässt die Ausführung zu *(BATS)*
- **GIVEN** `ENV=dev` und `CI` ist nicht gesetzt
- **WHEN** `scripts/ci-dummy-secrets.sh` ausgeführt wird
- **THEN** exit code ist 0 (dev-Ergonomik bleibt erhalten)

### Requirement: Fail-closed SealedSecret decrypt-wait (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL provide a testable `scripts/wait-for-sealed-secret.sh` helper that is executable and fails closed when the Secret never appears within the timeout.

#### Scenario: Helper-Script ist vorhanden und ausführbar *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `scripts/wait-for-sealed-secret.sh` auf Existenz und Executable-Bit geprüft wird
- **THEN** die Datei existiert und ist ausführbar

#### Scenario: Secret taucht nicht auf — exit non-zero *(BATS)*
- **GIVEN** ein gefakter `kubectl`, der beim `get secret`-Aufruf immer exit 1 zurückgibt
- **WHEN** `KUBECTL=<fake> bash scripts/wait-for-sealed-secret.sh --context fake --namespace workspace --secret workspace-secrets --timeout 2` ausgeführt wird
- **THEN** exit code ist ungleich 0 (fail-closed)

#### Scenario: Secret ist sofort vorhanden — exit zero *(BATS)*
- **GIVEN** ein gefakter `kubectl`, der immer exit 0 zurückgibt
- **WHEN** `KUBECTL=<fake> bash scripts/wait-for-sealed-secret.sh --context fake --namespace workspace --secret workspace-secrets --timeout 2` ausgeführt wird
- **THEN** exit code ist 0 (happy path)

### Requirement: keycloak-sync fail-closed in non-dev (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL expose a testable `kc_should_fail_closed` helper in `keycloak-sync.sh` that returns true for prod-Brands und false for dev or KEYCLOAK_SYNC_SOFT=1.

#### Scenario: Prod-Brand ohne Soft-Override → fail-closed TRUE *(BATS)*
- **GIVEN** `ENV=mentolder` und `KEYCLOAK_SYNC_SOFT` ist nicht gesetzt
- **WHEN** `kc_should_fail_closed` im sourced Kontext aufgerufen wird
- **THEN** gibt `CLOSED` zurück (fail-closed ist aktiv)

#### Scenario: ENV=dev → fail-closed FALSE *(BATS)*
- **GIVEN** `ENV=dev`
- **WHEN** `kc_should_fail_closed` aufgerufen wird
- **THEN** gibt `OPEN` zurück (dev-Ergonomik)

#### Scenario: KEYCLOAK_SYNC_SOFT=1 → fail-closed FALSE *(BATS)*
- **GIVEN** `ENV=mentolder` und `KEYCLOAK_SYNC_SOFT=1`
- **WHEN** `kc_should_fail_closed` aufgerufen wird
- **THEN** gibt `OPEN` zurück (Soft-Override aktiv)

### Requirement: env-seal cert-fingerprint comparison (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL provide a `--_test-cert-compare` seam in `env-seal.sh` that exits 0 for identical certs and non-zero for drifted certs.

#### Scenario: Identische Zertifikate → exit zero *(BATS)*
- **GIVEN** zwei Dateien mit identischem Zertifikatinhalt (`CERT-A`)
- **WHEN** `bash scripts/env-seal.sh --_test-cert-compare a.pem b.pem` ausgeführt wird
- **THEN** exit code ist 0 (kein Drift)

#### Scenario: Verschiedene Zertifikate → exit non-zero *(BATS)*
- **GIVEN** zwei Dateien mit verschiedenem Inhalt (`CERT-A` vs. `CERT-B-DIFFERENT`)
- **WHEN** `bash scripts/env-seal.sh --_test-cert-compare a.pem b.pem` ausgeführt wird
- **THEN** exit code ist ungleich 0 (Drift erkannt)

### Requirement: Restore re-aligns role passwords (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL chain `workspace:sync-db-passwords` into `workspace:db:restore` and the restore guidance SHALL reference it.

#### Scenario: backup-restore.sh verweist auf sync-db-passwords *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` im Repository
- **WHEN** nach dem String `sync-db-passwords` gesucht wird
- **THEN** mindestens ein Treffer existiert (Restore-Guidance ist vorhanden)

#### Scenario: db:restore-Task kettet sync-db-passwords *(BATS)*
- **GIVEN** `Taskfile.yml` mit dem `workspace:db:restore:`-Task
- **WHEN** nach `workspace:sync-db-passwords` innerhalb des Task-Blocks gesucht wird
- **THEN** genau ein Treffer existiert (automatisches Chaining)

### Requirement: app-install reseals after secret processing (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL reference `env-seal.sh` in `app-install.sh` to reseal after writing plaintext secrets.

#### Scenario: app-install.sh enthält Reseal-Referenz *(BATS)*
- **GIVEN** `scripts/app-install.sh` im Repository
- **WHEN** nach `env-seal.sh` oder dem Hinweis `sealed mirror stale` gesucht wird
- **THEN** mindestens ein Treffer existiert (Reseal-Schritt ist dokumentiert)

### Requirement: secrets:sync workload-reconcile awareness (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL emit a workload-reconcile reminder in `secrets:sync` and provide a `secrets:sync:full` companion task.

#### Scenario: secrets:sync-Task enthält Workload-Erinnerung *(BATS)*
- **GIVEN** `Taskfile.yml` mit dem `secrets:sync:`-Task
- **WHEN** nach `sync-db-passwords`, `rollout restart`, `landmine` oder `latent` gesucht wird
- **THEN** mindestens ein Treffer existiert (Erinnerung ist eingebaut)

#### Scenario: secrets:sync:full-Companion-Task existiert *(BATS)*
- **GIVEN** `Taskfile.yml`
- **WHEN** nach `secrets:sync:full:` gesucht wird
- **THEN** genau ein Treffer existiert

### Requirement: rotate-tokens annotation and fail-loud reminder (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL stamp a `token-version` annotation in the `claude-code:rotate-tokens` task.

#### Scenario: rotate-tokens-Task annotiert die Deployment-Version *(BATS)*
- **GIVEN** `Taskfile.yml` mit dem `claude-code:rotate-tokens:`-Task
- **WHEN** nach `token-version` oder `annotate` gesucht wird
- **THEN** mindestens ein Treffer existiert

### Requirement: keycloak-sync warns on empty website-secrets (BATS-Abdeckung)
<!-- bats: secret-task-guards.bats -->

The system SHALL warn loudly when `WEBSITE_OIDC_SECRET` is missing and the `env:seal` task description SHALL document co-rotation.

#### Scenario: keycloak-sync.sh warnt bei leerem WEBSITE_OIDC_SECRET *(BATS)*
- **GIVEN** `scripts/keycloak-sync.sh` im Repository
- **WHEN** nach Warnmustern für leeren/fehlenden `WEBSITE_OIDC_SECRET` gesucht wird
- **THEN** mindestens ein Treffer existiert (Warnung ist implementiert)

#### Scenario: env:seal-Task dokumentiert website-secrets Co-Rotation *(BATS)*
- **GIVEN** `Taskfile.yml` mit dem `env:seal:`-Task
- **WHEN** nach `website-secrets` oder `WEBSITE_OIDC` gesucht wird
- **THEN** mindestens ein Treffer existiert

### Requirement: git-crypt-guard detects encrypted vs. plaintext files (BATS-Abdeckung)
<!-- bats: git-crypt-guard.bats -->

The system SHALL provide `git-crypt-guard.sh is-encrypted` with correct exit codes for all file states, and `is-managed` for path classification.

#### Scenario: Verschlüsselte Datei mit Magic Header → exit 0 *(BATS)*
- **GIVEN** eine Datei mit dem 10-Byte git-crypt Magic Header (`\x00GITCRYPT\x00`) gefolgt von Cipher-Payload
- **WHEN** `bash scripts/git-crypt-guard.sh is-encrypted <Datei>` ausgeführt wird
- **THEN** exit code ist 0

#### Scenario: Klartext-Datei → exit non-zero *(BATS)*
- **GIVEN** eine Datei mit Klartext-Inhalt (z. B. `PASSWORD: hunter2`)
- **WHEN** `bash scripts/git-crypt-guard.sh is-encrypted <Datei>` ausgeführt wird
- **THEN** exit code ist ungleich 0

#### Scenario: Leere Datei → exit non-zero *(BATS)*
- **GIVEN** eine leere Datei
- **WHEN** `bash scripts/git-crypt-guard.sh is-encrypted <Datei>` ausgeführt wird
- **THEN** exit code ist ungleich 0

#### Scenario: Fehlende Datei → exit non-zero *(BATS)*
- **GIVEN** ein Pfad zu einer nicht existierenden Datei
- **WHEN** `bash scripts/git-crypt-guard.sh is-encrypted <Pfad>` ausgeführt wird
- **THEN** exit code ist ungleich 0

#### Scenario: Unbekanntes Subcommand → exit 2 *(BATS)*
- **GIVEN** kein spezifischer Dateipfad
- **WHEN** `bash scripts/git-crypt-guard.sh bogus` ausgeführt wird
- **THEN** exit code ist genau 2

#### Scenario: environments/.secrets/-Pfad ist managed *(BATS)*
- **GIVEN** Pfad `environments/.secrets/mentolder.yaml`
- **WHEN** `bash scripts/git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist 0

#### Scenario: deploy/mcp/claude-code-secrets.yaml ist managed *(BATS)*
- **GIVEN** Pfad `deploy/mcp/claude-code-secrets.yaml`
- **WHEN** `bash scripts/git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist 0

#### Scenario: Öffentliches Sealing-Cert ist NOT managed *(BATS)*
- **GIVEN** Pfad `environments/certs/mentolder.pem`
- **WHEN** `bash scripts/git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist ungleich 0

#### Scenario: .gitkeep-Platzhalter ist NOT managed *(BATS)*
- **GIVEN** Pfad `environments/.secrets/.gitkeep`
- **WHEN** `bash scripts/git-crypt-guard.sh is-managed <Pfad>` ausgeführt wird
- **THEN** exit code ist ungleich 0

### Requirement: Three-way secret consistency (BATS-Abdeckung)
<!-- bats: secrets-sync.bats -->

The system SHALL enforce schema↔dev-secrets↔SealedSecrets consistency via BATS static analysis (no cluster required).

#### Scenario: Alle Schema-Keys sind in k3d/secrets.yaml vorhanden *(BATS)*
- **GIVEN** `environments/schema.yaml` und `k3d/secrets.yaml`
- **WHEN** jeder Schema-Key gegen den `workspace-secrets`-Block in `k3d/secrets.yaml` geprüft wird
- **THEN** kein Key fehlt — andernfalls werden fehlende Keys aufgelistet und der Test schlägt fehl

#### Scenario: Kein Orphan-Key in k3d/secrets.yaml *(BATS)*
- **GIVEN** `k3d/secrets.yaml` `workspace-secrets`-Block und `environments/schema.yaml`
- **WHEN** jeder Key aus `k3d/secrets.yaml` gegen das Schema geprüft wird
- **THEN** kein verwaister Key existiert — andernfalls werden Orphans aufgelistet und der Test schlägt fehl

#### Scenario: Alle required-Keys sind in mentolder SealedSecret vorhanden *(BATS)*
- **GIVEN** `environments/schema.yaml` (nur `required: true`-Keys) und `environments/sealed-secrets/mentolder.yaml`
- **WHEN** jeder required-Key gegen `spec.encryptedData` geprüft wird
- **THEN** kein required-Key fehlt — optionale Keys (`required: false`) werden übersprungen

#### Scenario: Alle required-Keys sind in korczewski SealedSecret vorhanden *(BATS)*
- **GIVEN** `environments/schema.yaml` (nur `required: true`-Keys) und `environments/sealed-secrets/korczewski.yaml`
- **WHEN** jeder required-Key gegen `spec.encryptedData` geprüft wird
- **THEN** kein required-Key fehlt — optionale Keys (`required: false`) werden übersprungen
