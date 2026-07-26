# auth-sso — Delta (t002205-keycloak-cleanup)

## MODIFIED Requirements

### Requirement: Single-Sign-On für alle Platform-Services
<!-- bats: auth-sso.bats -->

The system SHALL use Pocket ID as the sole OIDC identity provider on `auth.<domain>`. No Keycloak
realm-import artifact SHALL remain in the repository: `scripts/import-entrypoint.sh` and
`prod/import-entrypoint.sh` SHALL NOT exist, `k3d/deploy.sh` SHALL NOT create a
`keycloak-import-script` ConfigMap, and no Kustomize base or overlay SHALL reference a
`realm-template` or `keycloak-import-script` generator. The `KEYCLOAK_DB_PASSWORD` and
`KEYCLOAK_ADMIN_PASSWORD` keys SHALL be absent from `environments/schema.yaml` and from every
`environments/.secrets/<env>.yaml`, and the shared-database backup/restore helpers SHALL NOT
offer `keycloak` as a database target.

#### Scenario: Realm-Import-Skripte existieren nicht mehr *(BATS)*
- **GIVEN** das Repository auf `main`
- **WHEN** nach `scripts/import-entrypoint.sh` und `prod/import-entrypoint.sh` gesucht wird
- **THEN** existiert keine der beiden Dateien

#### Scenario: deploy.sh legt keine keycloak-import-script ConfigMap an *(BATS)*
- **GIVEN** `k3d/deploy.sh`
- **WHEN** der Skriptinhalt gelesen wird
- **THEN** enthält er weder `keycloak-import-script` noch `import-entrypoint.sh`

#### Scenario: Kustomize-Bases referenzieren keine Keycloak-Generatoren *(BATS)*
- **GIVEN** `k3d/kustomization.yaml`, `prod/kustomization.yaml`, `prod-mentolder/kustomization.yaml`, `prod-korczewski/kustomization.yaml` und `prod-fleet/staging/kustomization.yaml`
- **WHEN** die Dateien gelesen werden
- **THEN** enthält keine davon `realm-template` oder `keycloak-import-script`

#### Scenario: KEYCLOAK_*-Keys sind aus Schema und Secrets entfernt *(BATS)*
- **GIVEN** `environments/schema.yaml` und alle `environments/.secrets/*.yaml`
- **WHEN** nach Zeilen gesucht wird, die mit `KEYCLOAK_DB_PASSWORD:` oder `KEYCLOAK_ADMIN_PASSWORD:` beginnen
- **THEN** wird kein Treffer gefunden

#### Scenario: Backup-Restore kennt kein keycloak-Ziel mehr *(BATS)*
- **GIVEN** `scripts/backup-restore-lib.sh`, `scripts/backup-restore-db.sh` und `scripts/backup-restore.sh`
- **WHEN** die Dateien gelesen werden
- **THEN** enthält keine davon das Datenbank-Ziel `keycloak`

#### Scenario: shared-db exportiert keinen keycloak-db Alias-Service *(BATS)*
- **GIVEN** `k3d/shared-db.yaml`
- **WHEN** die Service-Namen gelesen werden
- **THEN** existiert kein Service `keycloak-db`

## REMOVED Requirements

### Requirement: Realm-Import mit Platzhalter-Validierung beim Start

**Reason:** Keycloak wurde durch Pocket ID abgelöst (pocket-id-migration Welle 3, 2026-06-22).
Es gibt kein Realm-Template und keinen Realm-Import mehr; Pocket ID hält seine OIDC-Clients in
der eigenen PostgreSQL-Datenbank und wird über den `pocket-id-client-seed`-Job provisioniert.

**Migration:** Abgedeckt durch "Pocket ID OIDC clients are deploy-seeded". Keine Datenmigration
nötig — die Keycloak-Datenbanken und -Rollen wurden in `workspace`, `workspace-korczewski` und
`workspace-staging` gedroppt (T002205).

### Requirement: Prod-Entrypoint-Escaping für Push-Deploy-Pipeline

**Reason:** Die Requirement beschreibt das `$$`-Escaping in `prod/import-entrypoint.sh`. Die Datei
wurde mit T002205 gelöscht, weil sie ausschliesslich den Keycloak-Realm-Import bediente.

**Migration:** Keine — es existiert kein Entrypoint-Skript mehr, das durch die Push-Deploy-sed-
Pipeline läuft.

### Requirement: Prod-Entrypoint $$-Escaping — Push-Deploy-Pipeline-Kontrakt

**Reason:** Duplikat der obigen Requirement (BATS-Variante, verwies auf die nie angelegte
`keycloak-entrypoint-escaping.bats`). Gegenstand `prod/import-entrypoint.sh` ist mit T002205
gelöscht.

**Migration:** Keine.
