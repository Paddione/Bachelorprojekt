## MODIFIED Requirements

### Requirement: AK-04: Prototyp-Betrieb
<!-- source: ak-04-prototype.spec.ts -->

The system SHALL ship all required configuration and operational scripts in the repository and SHALL NOT load any external tracking or font resources during page load, in compliance with DSGVO/GDPR.

#### Scenario: T1: Taskfile.yml im Repo vorhanden
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** das Dateisystem geprüft wird
- **THEN** existiert die Datei `Taskfile.yml` im Repo-Wurzelverzeichnis

#### Scenario: T1: workspace:deploy in Taskfile definiert
- **GIVEN** `Taskfile.yml` existiert im Repository
- **WHEN** der Inhalt der Taskfile gelesen wird
- **THEN** enthält die Datei den Task-Namen `workspace:deploy`

#### Scenario: T2: scripts/setup.sh existiert und ist ausführbar (falls vorhanden)
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `scripts/setup.sh` vorhanden ist und dessen Dateisystem-Metadaten geprüft werden
- **THEN** sind die ausführbaren Bits gesetzt (mode & 0o111 ist truthy)

#### Scenario: T2: scripts/-Verzeichnis enthält Betriebsskripte
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** das `scripts/`-Verzeichnis aufgelistet wird
- **THEN** existiert das Verzeichnis und enthält mindestens eine `.sh`-Datei

#### Scenario: T5a: DSGVO — Website lädt keine Google Fonts
- **GIVEN** die Website ist erreichbar
- **WHEN** die Startseite vollständig geladen wird
- **THEN** werden keine Anfragen an `fonts.googleapis.com` oder `fonts.gstatic.com` gestellt

#### Scenario: T5b: DSGVO — Website lädt keine externen Analytics-Scripts
- **GIVEN** die Website ist erreichbar
- **WHEN** die Startseite vollständig geladen wird
- **THEN** werden keine Anfragen an Google Analytics, Google Tag Manager, Facebook, Hotjar oder Mixpanel gestellt

