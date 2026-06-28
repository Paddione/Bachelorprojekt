# secret-rotation

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

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

## Requirements

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

---

### Requirement: Full cluster bring-up order: cert-manager before workspace deploy

The system SHALL enforce that `cert:install ENV=<env>` runs before `workspace:deploy ENV=<env>` on any fresh cluster bring-up (including after a reset), and SHALL store the ACME DNS-01 key in BOTH the `cert-manager` namespace AND the `$WORKSPACE_NAMESPACE` via `cert:secret`, because `workspace:deploy` expects cert-manager CRDs to already exist and both namespaces require the ACME key independently.

#### Scenario: workspace:deploy startet ohne cert-manager CRDs

- **GIVEN** ein frischer Cluster ohne cert-manager
- **WHEN** `task workspace:deploy ENV=mentolder` ohne vorheriges `task cert:install ENV=mentolder` ausgeführt wird
- **THEN** kubectl scheitert mit "no matches for kind Certificate", weil die CRDs fehlen; `cert:install` muss zuerst laufen

#### Scenario: ACME-Key fehlt im WORKSPACE_NAMESPACE

- **GIVEN** `task cert:secret` wurde nur für den `cert-manager`-Namespace ausgeführt, aber nicht für `$WORKSPACE_NAMESPACE`
- **WHEN** Cert-Manager versucht, ein TLS-Zertifikat für die Workspace-Ingresses auszustellen
- **THEN** die DNS-01-Challenge schlägt fehl, weil das ACME-Secret im richtigen Namespace fehlt; `cert:secret` muss beide Namespaces befüllen

---

### Requirement: knowledge-secrets secretGenerator conflict resolution

The system SHALL, when a `secretGenerator`-managed Secret with the same name as an existing SealedSecret is present in the overlay (e.g. `knowledge-secrets`), delete the plain Secret from the namespace (`kubectl delete secret knowledge-secrets -n $WORKSPACE_NS`) before re-applying, because the Sealed Secrets controller refuses to adopt a Secret it did not create and the apply will silently leave the cluster in a broken state.

#### Scenario: secretGenerator-Secret kollidiert mit SealedSecret

- **GIVEN** das Overlay enthält einen `secretGenerator`-Eintrag für `knowledge-secrets` UND ein gleichnamiges SealedSecret existiert bereits im Namespace
- **WHEN** `task workspace:deploy` ausgeführt wird
- **THEN** der Sealed-Secrets-Controller lehnt die Adoption ab; das `knowledge-secrets`-Secret im Cluster enthält die falschen (von Kustomize generierten) Werte

#### Scenario: Kollision durch vorheriges Löschen des Plain-Secret aufgelöst

- **GIVEN** dieselbe Kollisionssituation wie oben
- **WHEN** der Operator zuerst `kubectl delete secret knowledge-secrets -n $WORKSPACE_NS` ausführt und danach `task workspace:deploy` wiederholt
- **THEN** der Controller erstellt das Secret aus dem SealedSecret neu mit den korrekten verschlüsselten Werten; alle Pods können die Secrets erfolgreich mounten

---

### Requirement: env:generate precedes env:seal — MANAGED_EXTERNALLY guard

The system SHALL require that `task env:generate ENV=<env>` has been run before `task env:seal ENV=<env>` on any fresh environment setup, because `talk-hpb-setup.sh` and related scripts abort when they encounter `MANAGED_EXTERNALLY` placeholder values that were never replaced by `env:generate`; the sealing step SHALL treat any remaining `MANAGED_EXTERNALLY` value as a dev-placeholder and refuse to seal unless `--force` is passed.

#### Scenario: env:seal mit MANAGED_EXTERNALLY-Platzhalter

- **GIVEN** `environments/.secrets/mentolder.yaml` enthält `TURN_SECRET: MANAGED_EXTERNALLY`, weil `env:generate` nie ausgeführt wurde
- **WHEN** `task env:seal ENV=mentolder` ohne `--force` läuft
- **THEN** das Skript bricht ab und listet `TURN_SECRET` als ungültigen Platzhalter; keine `sealed-secrets/mentolder.yaml` wird geschrieben

#### Scenario: talk-hpb-setup bricht bei nicht generiertem Secret ab

- **GIVEN** `env:seal` wurde mit `--force` übersprungen und das SealedSecret enthält `MANAGED_EXTERNALLY` als verschlüsselten Wert
- **WHEN** `task workspace:post-setup ENV=mentolder` → `talk-hpb-setup.sh` läuft
- **THEN** das Setup-Skript bricht mit einer expliziten Fehlermeldung ab und nennt das betroffene Secret; der HPB-Dienst wird nicht konfiguriert

---

### Requirement: Keypair rotation invalidates all SealedSecrets across all environments

The system SHALL treat every cluster reset as a full SealedSecrets keypair rotation event — meaning ALL existing `environments/sealed-secrets/<env>.yaml` files for that cluster become undecryptable, and the operator SHALL run `env:fetch-cert` AND `env:seal` for EVERY affected environment (not just the one being worked on) before running `workspace:deploy` for any environment on that cluster.

#### Scenario: Alter SealedSecret nach Controller-Neuinstallation nicht entschlüsselbar

- **GIVEN** der Sealed-Secrets-Controller auf dem `fleet`-Cluster wurde neu installiert (z.B. nach einem Cluster-Reset) und hat ein neues Keypair generiert
- **WHEN** `task workspace:deploy ENV=mentolder` ausgeführt wird ohne vorheriges `env:fetch-cert` + `env:seal`
- **THEN** der Controller kann die bestehende `environments/sealed-secrets/mentolder.yaml` nicht entschlüsseln; alle Pods, die `workspace-secrets` benötigen, crashloopen wegen fehlendem Secret

#### Scenario: Alle Umgebungen müssen nach Rotation neu versiegelt werden

- **GIVEN** ein Cluster-Reset hat das Keypair rotiert und `env:fetch-cert ENV=mentolder` + `env:seal ENV=mentolder` wurden bereits ausgeführt
- **WHEN** der Operator `task workspace:deploy ENV=korczewski` ausführt ohne `env:fetch-cert ENV=korczewski` + `env:seal ENV=korczewski`
- **THEN** das korczewski-Deployment schlägt fehl, weil `environments/sealed-secrets/korczewski.yaml` noch gegen das alte Keypair versiegelt ist; jede Umgebung muss separat neu versiegelt werden

---

### Requirement: env-resolve.sh sourcing — never execute as subprocess

The system SHALL invoke `scripts/env-resolve.sh` exclusively via `source scripts/env-resolve.sh "$ENV"` (never via `bash scripts/env-resolve.sh`), because the script uses `return 1 2>/dev/null || exit 1` as its error-exit mechanism — executing it as a subprocess causes it to `exit` the calling shell rather than `return`, silently killing the parent process and preventing any subsequent task commands from running.

#### Scenario: Direkter bash-Aufruf beendet die aufrufende Shell

- **GIVEN** ein Operator- oder Skript-Aufruf führt `bash scripts/env-resolve.sh mentolder` aus statt `source scripts/env-resolve.sh mentolder`
- **WHEN** `env-resolve.sh` einen Fehler feststellt (z.B. ungültiges ENV)
- **THEN** der `exit 1`-Aufruf im Subshell-Kontext beendet unerwartet die aufrufende Shell; alle nachfolgenden Taskfile-Kommandos laufen nie und der Fehler erscheint als stiller Abbruch

#### Scenario: Korrekte Verwendung via source exportiert alle Variablen

- **GIVEN** ein Task führt `source scripts/env-resolve.sh mentolder` aus
- **WHEN** `env-resolve.sh` erfolgreich abschließt
- **THEN** alle Variablen (`ENV_CONTEXT`, `WORKSPACE_NAMESPACE`, `PROD_DOMAIN`, etc.) sind in der aufrufenden Shell-Session exportiert und stehen nachfolgenden `envsubst`- und `kubectl`-Aufrufen direkt zur Verfügung

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Fail-closed guard for ci-dummy-secrets outside CI/dev
<!-- bats: secret-task-guards.bats -->

The system SHALL refuse to run `scripts/ci-dummy-secrets.sh` when the target environment is a prod brand (`mentolder`, `korczewski`) and the `CI` environment variable is not set, and SHALL NOT write any placeholder secret files in that case.

#### Scenario: ci-dummy-secrets abgelehnt für prod ohne CI *(BATS)*
- **GIVEN** `CI` ist nicht gesetzt und `ENV=mentolder`
- **WHEN** `bash scripts/ci-dummy-secrets.sh` wird ausgeführt
- **THEN** das Skript scheitert (non-zero) und schreibt weder `k3d/secrets.yaml` noch `k3d/backup-secrets.yaml`

#### Scenario: ci-dummy-secrets abgelehnt für korczewski ohne CI *(BATS)*
- **GIVEN** `CI` ist nicht gesetzt und `ENV=korczewski`
- **WHEN** `bash scripts/ci-dummy-secrets.sh` wird ausgeführt
- **THEN** das Skript scheitert (non-zero)

#### Scenario: ci-dummy-secrets erfolgreich im CI-Kontext *(BATS)*
- **GIVEN** `CI=true` und `ENV=mentolder`
- **WHEN** `bash scripts/ci-dummy-secrets.sh` wird ausgeführt
- **THEN** das Skript endet erfolgreich und `k3d/secrets.yaml` wird erstellt

#### Scenario: ci-dummy-secrets erlaubt für ENV=dev ohne CI *(BATS)*
- **GIVEN** `CI` ist nicht gesetzt und `ENV=dev`
- **WHEN** `bash scripts/ci-dummy-secrets.sh` wird ausgeführt
- **THEN** das Skript endet erfolgreich (dev-Ergonomics)

---

### Requirement: wait-for-sealed-secret fail-closed on decrypt timeout
<!-- bats: secret-task-guards.bats -->

The system SHALL exit non-zero when `scripts/wait-for-sealed-secret.sh` polls for a secret that never appears within the given timeout, and SHALL exit zero when the secret becomes available.

#### Scenario: Hilfsskript existiert und ist ausführbar *(BATS)*
- **GIVEN** das Repo ist ausgecheckt
- **WHEN** die Dateieigenschaften von `scripts/wait-for-sealed-secret.sh` geprüft werden
- **THEN** die Datei existiert und hat das executable-Bit gesetzt

#### Scenario: Timeout führt zu non-zero Exit *(BATS)*
- **GIVEN** ein gefälschtes `kubectl`, das `get secret` immer mit Exit 1 beantwortet
- **WHEN** `wait-for-sealed-secret.sh --context fake --namespace workspace --secret workspace-secrets --timeout 2` läuft
- **THEN** das Skript endet mit einem Fehler (fail-closed)

#### Scenario: Sofort vorhandenes Secret führt zu Zero Exit *(BATS)*
- **GIVEN** ein gefälschtes `kubectl`, das `get secret` immer mit Exit 0 beantwortet
- **WHEN** `wait-for-sealed-secret.sh` mit denselben Argumenten läuft
- **THEN** das Skript endet erfolgreich

---

### Requirement: keycloak-sync fail-closed in non-dev environments
<!-- bats: secret-task-guards.bats -->

The system SHALL treat `keycloak-sync.sh` as fail-closed for prod brands unless `KEYCLOAK_SYNC_SOFT=1` is explicitly set, and SHALL be open (permissive) for `ENV=dev`.

#### Scenario: kc_should_fail_closed TRUE für prod ohne Override *(BATS)*
- **GIVEN** `KEYCLOAK_SYNC_SOFT` ist nicht gesetzt und `ENV=mentolder`
- **WHEN** `kc_should_fail_closed` in `keycloak-sync.sh` aufgerufen wird
- **THEN** gibt die Funktion `CLOSED` zurück

#### Scenario: kc_should_fail_closed FALSE für ENV=dev *(BATS)*
- **GIVEN** `ENV=dev`
- **WHEN** `kc_should_fail_closed` aufgerufen wird
- **THEN** gibt die Funktion `OPEN` zurück

#### Scenario: kc_should_fail_closed FALSE mit KEYCLOAK_SYNC_SOFT=1 *(BATS)*
- **GIVEN** `ENV=mentolder` und `KEYCLOAK_SYNC_SOFT=1`
- **WHEN** `kc_should_fail_closed` aufgerufen wird
- **THEN** gibt die Funktion `OPEN` zurück (Soft-Override aktiv)

---

### Requirement: env-seal certificate fingerprint comparison
<!-- bats: secret-task-guards.bats -->

The system SHALL provide a testable `--_test-cert-compare` seam in `scripts/env-seal.sh` that exits zero for identical certificates and non-zero for drifted certificates.

#### Scenario: Identische Zertifikate — kein Drift *(BATS)*
- **GIVEN** zwei PEM-Dateien mit identischem Inhalt
- **WHEN** `env-seal.sh --_test-cert-compare a.pem b.pem` läuft
- **THEN** Exit 0 (kein Drift erkannt)

#### Scenario: Unterschiedliche Zertifikate — Drift erkannt *(BATS)*
- **GIVEN** zwei PEM-Dateien mit unterschiedlichem Inhalt
- **WHEN** `env-seal.sh --_test-cert-compare a.pem b.pem` läuft
- **THEN** Exit non-zero (Drift erkannt)

---

### Requirement: Post-restore guidance references sync-db-passwords
<!-- bats: secret-task-guards.bats -->

The system SHALL reference `workspace:sync-db-passwords` in `scripts/backup-restore.sh` restore-complete guidance AND chain it in the `workspace:db:restore` Taskfile task, so operators are never left with stale DB role passwords after a restore.

#### Scenario: backup-restore.sh nennt sync-db-passwords in Guidance *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** der Dateiinhalt nach `sync-db-passwords` durchsucht wird
- **THEN** mindestens ein Treffer wird gefunden

#### Scenario: db:restore Task verkettet sync-db-passwords *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `workspace:db:restore`
- **WHEN** der Taskblock nach `workspace:sync-db-passwords` durchsucht wird
- **THEN** mindestens ein Aufruf ist vorhanden

---

### Requirement: app-install references env-seal after secret processing
<!-- bats: secret-task-guards.bats -->

The system SHALL reference `env-seal.sh` (or a "sealed mirror stale" warning) in `scripts/app-install.sh` to remind operators to reseal after secret processing.

#### Scenario: app-install verweist auf env-seal *(BATS)*
- **GIVEN** `scripts/app-install.sh` ist vorhanden
- **WHEN** der Dateiinhalt nach `env-seal.sh` oder `sealed mirror stale` durchsucht wird
- **THEN** mindestens ein Treffer wird gefunden

---

### Requirement: secrets:sync workload-reconcile reminder and full-sync companion
<!-- bats: secret-task-guards.bats -->

The system SHALL emit a workload-reconcile reminder (referencing `sync-db-passwords`, `rollout restart`, or equivalent) in the `secrets:sync` task, AND SHALL provide a `secrets:sync:full` companion task for full reconciliation.

#### Scenario: secrets:sync enthält Workload-Reconcile-Hinweis *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `secrets:sync`
- **WHEN** der Taskblock nach Reconcile-Verweisen durchsucht wird
- **THEN** mindestens ein Verweis auf `sync-db-passwords`, `rollout restart`, `landmine` oder `latent` ist vorhanden

#### Scenario: secrets:sync:full Task existiert *(BATS)*
- **GIVEN** `Taskfile.yml` ist vorhanden
- **WHEN** nach `secrets:sync:full:` gesucht wird
- **THEN** genau ein solcher Task-Eintrag ist vorhanden

---

### Requirement: claude-code rotate-tokens stamps token-version annotation
<!-- bats: secret-task-guards.bats -->

The system SHALL, via the `claude-code:rotate-tokens` Taskfile task, annotate the relevant Deployment with a `token-version` label/annotation so that rollouts are triggered on token rotation.

#### Scenario: rotate-tokens Task enthält token-version Annotation *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `claude-code:rotate-tokens`
- **WHEN** der Taskblock nach `token-version` oder `annotate` durchsucht wird
- **THEN** mindestens ein Treffer ist vorhanden

---

### Requirement: keycloak-sync warns on missing WEBSITE_OIDC_SECRET
<!-- bats: secret-task-guards.bats -->

The system SHALL log a loud warning in `scripts/keycloak-sync.sh` when the fetched `WEBSITE_OIDC_SECRET` from `website-secrets` is empty or missing, and the `env:seal` task description SHALL note the co-rotation of `website-secrets`.

#### Scenario: keycloak-sync warnt bei leerem WEBSITE_OIDC_SECRET *(BATS)*
- **GIVEN** `scripts/keycloak-sync.sh` ist vorhanden
- **WHEN** der Dateiinhalt nach Warnmeldungen für `WEBSITE_OIDC_SECRET` durchsucht wird
- **THEN** mindestens ein Warn-Hinweis ist vorhanden

#### Scenario: env:seal Task-Beschreibung erwähnt website-secrets Co-Rotation *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `env:seal`
- **WHEN** der Taskblock nach `website-secrets` oder `WEBSITE_OIDC` durchsucht wird
- **THEN** mindestens ein Treffer ist vorhanden

---

### Requirement: Three-way secret consistency — schema, dev secrets, sealed secrets
<!-- bats: secrets-sync.bats -->

The system SHALL keep `environments/schema.yaml`, `k3d/secrets.yaml` (workspace-secrets), and all `environments/sealed-secrets/*.yaml` files in sync: every schema secret must exist in the dev secrets file, no orphan keys may exist in the dev file, and every `required: true` schema secret must be present in each environment's SealedSecret.

#### Scenario: Alle Schema-Secrets in k3d/secrets.yaml vorhanden *(BATS)*
- **GIVEN** `environments/schema.yaml` und `k3d/secrets.yaml` sind vorhanden
- **WHEN** alle Schema-Schlüssel gegen den `workspace-secrets` Block in `k3d/secrets.yaml` abgeglichen werden
- **THEN** kein Schema-Schlüssel fehlt in der Dev-Secrets-Datei

#### Scenario: Keine verwaisten Schlüssel in k3d/secrets.yaml *(BATS)*
- **GIVEN** `environments/schema.yaml` und `k3d/secrets.yaml` sind vorhanden
- **WHEN** alle Dev-Secret-Schlüssel gegen das Schema abgeglichen werden
- **THEN** kein Schlüssel in `k3d/secrets.yaml` ist im Schema unbekannt (kein Orphan)

#### Scenario: Alle required Schema-Secrets in mentolder.yaml SealedSecret *(BATS)*
- **GIVEN** `environments/schema.yaml` und `environments/sealed-secrets/mentolder.yaml` sind vorhanden
- **WHEN** alle `required: true` Schema-Schlüssel gegen das `encryptedData` des SealedSecret geprüft werden
- **THEN** kein required Schlüssel fehlt in `mentolder.yaml`

#### Scenario: Alle required Schema-Secrets in korczewski.yaml SealedSecret *(BATS)*
- **GIVEN** `environments/schema.yaml` und `environments/sealed-secrets/korczewski.yaml` sind vorhanden
- **WHEN** alle `required: true` Schema-Schlüssel gegen das `encryptedData` des SealedSecret geprüft werden
- **THEN** kein required Schlüssel fehlt in `korczewski.yaml`

---

### Requirement: git-crypt-guard encryption detection
<!-- bats: git-crypt-guard.bats -->

The system SHALL provide `scripts/git-crypt-guard.sh` with an `is-encrypted` subcommand that detects the git-crypt magic header (10-byte prefix `\x00GITCRYPT\x00`) and exits zero for encrypted files and non-zero for plaintext, empty, or missing files; and an `is-managed` subcommand that returns zero for paths under the git-crypt attribute scope and non-zero for paths that are explicitly not managed (public certs, `.gitkeep`).

#### Scenario: git-crypt Header erkannt — Exit 0 *(BATS)*
- **GIVEN** eine Datei mit dem git-crypt Magic-Header `\x00GITCRYPT\x00` am Anfang
- **WHEN** `git-crypt-guard.sh is-encrypted <datei>` ausgeführt wird
- **THEN** Exit 0 (verschlüsselt erkannt)

#### Scenario: Plaintext-Datei — Exit non-zero *(BATS)*
- **GIVEN** eine YAML-Datei mit Klartext-Inhalt (`PASSWORD: hunter2`)
- **WHEN** `git-crypt-guard.sh is-encrypted <datei>` ausgeführt wird
- **THEN** Exit non-zero (nicht verschlüsselt)

#### Scenario: Leere Datei — Exit non-zero *(BATS)*
- **GIVEN** eine leere Datei
- **WHEN** `git-crypt-guard.sh is-encrypted <datei>` ausgeführt wird
- **THEN** Exit non-zero

#### Scenario: Fehlende Datei — Exit non-zero *(BATS)*
- **GIVEN** ein Pfad, der nicht existiert
- **WHEN** `git-crypt-guard.sh is-encrypted <pfad>` ausgeführt wird
- **THEN** Exit non-zero

#### Scenario: Unbekannter Subcommand — Exit 2 *(BATS)*
- **GIVEN** ein beliebiger Subcommand, der nicht existiert
- **WHEN** `git-crypt-guard.sh bogus` ausgeführt wird
- **THEN** Exit 2 (usage error)

#### Scenario: Secrets-Verzeichnis ist managed *(BATS)*
- **GIVEN** der Pfad `environments/.secrets/mentolder.yaml`
- **WHEN** `git-crypt-guard.sh is-managed <pfad>` ausgeführt wird
- **THEN** Exit 0 (Datei ist unter git-crypt-Verwaltung)

#### Scenario: MCP-Secrets sind managed *(BATS)*
- **GIVEN** der Pfad `deploy/mcp/claude-code-secrets.yaml`
- **WHEN** `git-crypt-guard.sh is-managed <pfad>` ausgeführt wird
- **THEN** Exit 0 (Datei ist unter git-crypt-Verwaltung)

#### Scenario: Öffentliche Sealing-Certs sind NICHT managed *(BATS)*
- **GIVEN** der Pfad `environments/certs/mentolder.pem`
- **WHEN** `git-crypt-guard.sh is-managed <pfad>` ausgeführt wird
- **THEN** Exit non-zero (öffentliches Cert ist nicht git-crypt-managed)

#### Scenario: .gitkeep Platzhalter ist NICHT managed *(BATS)*
- **GIVEN** der Pfad `environments/.secrets/.gitkeep`
- **WHEN** `git-crypt-guard.sh is-managed <pfad>` ausgeführt wird
- **THEN** Exit non-zero (Platzhalter-Datei ist nicht managed)

---

### Requirement: Keycloak password policy enforced in workspace realm
<!-- e2e: sa-03-passwords.spec.ts -->

The system SHALL configure the Keycloak `workspace` realm with a `passwordPolicy` that includes at minimum a minimum-length rule and at least one hardening rule (`specialChars` or `digits`).

#### Scenario: passwordPolicy enthält Längen-Regel *(E2E)*
- **GIVEN** Keycloak ist erreichbar und `KC_ADMIN_PASS` ist gesetzt
- **WHEN** die Realm-Konfiguration via Admin-API (`GET /admin/realms/workspace`) abgerufen wird
- **THEN** `realm.passwordPolicy` ist definiert und enthält `"length"`

#### Scenario: passwordPolicy enthält Härtungs-Regel *(E2E)*
- **GIVEN** Keycloak ist erreichbar und `KC_ADMIN_PASS` ist gesetzt
- **WHEN** die Realm-Konfiguration via Admin-API abgerufen wird
- **THEN** `realm.passwordPolicy` enthält `"specialChars"` oder `"digits"`

---

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

### Requirement: ci-dummy-secrets fail-closed precondition — BATS-Szenarien
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
