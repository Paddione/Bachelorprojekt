## MODIFIED Requirements

### Requirement: Explicit ENV= for All Env-Sensitive Deploys

The system SHALL require an explicit `ENV=` parameter for all environment-sensitive tasks (`workspace:deploy`, `workspace:post-setup`, `workspace:talk-setup`, etc.); tasks SHALL default to `ENV=dev` when unset, and the kubectl-context mismatch check SHALL only run when `ENV != dev`, so that a missing `ENV=` with the wrong active context silently targets whatever cluster is current.

#### Scenario: Deploy ohne ENV=-Angabe

- **GIVEN** der Entwickler führt `task workspace:deploy` ohne `ENV=` aus
- **WHEN** der Task die aktive kubectl-Context prüft
- **THEN** verwendet der Task `ENV=dev` als Default und deployt in den k3d-Dev-Cluster (kein Kontext-Mismatch-Check greift)
- **AND** es wird kein Warn-Fehler für falschen Produktions-Kontext ausgelöst

#### Scenario: Nextcloud OIDC-Konfiguration auf fleet für mentolder

- **GIVEN** der Operator will die Nextcloud OIDC-Konfiguration auf dem fleet-Cluster für mentolder aktualisieren
- **WHEN** `task workspace:post-setup ENV=mentolder` ausgeführt wird
- **THEN** wird `ENV=mentolder` (Alias `fleet-mentolder`) zum fleet-Kontext aufgelöst und die Konfiguration in `workspace` geschrieben
- **AND** das Weglassen von `ENV=mentolder` hätte den Dev-k3d-Cluster verändert, ohne Fehlermeldung
