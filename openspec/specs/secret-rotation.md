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
