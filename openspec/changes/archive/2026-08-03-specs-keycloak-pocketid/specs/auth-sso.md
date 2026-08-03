## ADDED Requirements

### Requirement: Verhaltens-SSOT beschreibt Pocket ID als OIDC-Provider

The system SHALL describe Pocket ID as the OIDC provider in the behavior SSOT, replacing
Keycloak where it merely stands for "the OIDC provider". The SSOT SHALL NOT reference realms,
realm-JSON import, or `kcadm.sh` as current behavior.

#### Scenario: Reine Umbenennung ersetzt Keycloak durch Pocket ID

- **GIVEN** eine Spec-Stelle nennt Keycloak nur als "den OIDC-Provider"
- **WHEN** die Stelle geprüft wird
- **THEN** nennt sie Pocket ID
- **AND** kein Verweis auf Keycloak als aktuellen Provider bleibt

#### Scenario: Überholtes Realm-Verhalten ist inhaltlich neu formuliert

- **GIVEN** eine Spec-Stelle beschreibt Realm-JSON-Import, `kcadm.sh` oder Admin-REST-Pfade `/admin/realms/...`
- **WHEN** die Stelle geprüft wird
- **THEN** ist sie inhaltlich neu formuliert
- **AND** beschreibt die Provisionierung über `pocket_id.oidc_clients` per Seed-Job über die Admin-REST-API

### Requirement: Historischer Keycloak-Kontext bleibt erhalten

The system SHALL keep Keycloak references in migration descriptions where Keycloak correctly
represents the predecessor state, so that historical context is not falsified.

#### Scenario: Migrationsbeschreibung behält Keycloak als Vorgänger

- **GIVEN** eine Spec-Stelle beschreibt eine Migration von Keycloak
- **WHEN** die Stelle geprüft wird
- **THEN** bleibt Keycloak als Vorgängerzustand erhalten
- **AND** wird nicht durch Pocket ID ersetzt
