## ADDED Requirements

### Requirement: Renovate-Lauf ohne verarbeitetes Repository gilt als Fehlschlag

The system SHALL treat a Renovate run that aborts with `result=repository-changed` as a
failure and SHALL retry the run up to three times before failing the job with a non-zero
exit code. The workflow SHALL NOT report success for a run in which no repository was
processed.

#### Scenario: Base-Branch-Drift löst einen Wiederholungsversuch aus

- **GIVEN** ein Renovate-Lauf bricht mit `"result": "repository-changed"` ab, weil auf `main`
  während der 157-sekündigen Laufzeit ein Commit gelandet ist
- **WHEN** der Workflow das Lauf-Ergebnis auswertet
- **THEN** startet er einen weiteren Renovate-Lauf, ohne auf einen Backoff zu warten
- **AND** der Folgeversuch nutzt den bereits aufgewärmten Repository-Cache

#### Scenario: Drei erfolglose Versuche färben den Job rot

- **GIVEN** alle drei Versuche brechen mit `repository-changed` ab
- **WHEN** der letzte Versuch ausgewertet ist
- **THEN** beendet sich der Job mit Exit-Code ≠ 0
- **AND** der Fehlschlag ist in der GitHub-Actions-Übersicht als `failure` sichtbar — nicht
  wie zuvor als `success` mit leerem Ergebnis

#### Scenario: Erfolgreicher Lauf beendet die Schleife sofort

- **GIVEN** ein Renovate-Lauf verarbeitet das Repository ohne `repository-changed`
- **WHEN** der Workflow das Ergebnis auswertet
- **THEN** bricht er die Retry-Schleife ab und beendet den Job grün, ohne weitere Versuche

---

### Requirement: Renovate-Repository-Cache über Läufe hinweg persistiert

The system SHALL run Renovate with `RENOVATE_REPOSITORY_CACHE=enabled` and a defined
`RENOVATE_CACHE_DIR`, and SHALL persist that directory between workflow runs so the
datasource lookup phase is shortened and the base-branch-drift window narrowed.

#### Scenario: Cache wird zwischen zwei Läufen wiederverwendet

- **GIVEN** ein vorheriger Renovate-Lauf hat seinen Repository-Cache abgelegt
- **WHEN** ein neuer Lauf startet
- **THEN** stellt ein `actions/cache`-Step das Cache-Verzeichnis wieder her, bevor Renovate startet

#### Scenario: Cache-Dateien bleiben für den Runner beschreibbar

- **GIVEN** der Renovate-Container hat Dateien in das gemountete Cache-Verzeichnis geschrieben
- **WHEN** der `actions/cache`-Post-Step den Cache als Benutzer `runner` packt
- **THEN** sind die Dateibesitzrechte so gesetzt, dass das Packen nicht an fehlenden
  Schreibrechten scheitert

---

### Requirement: Renovate-Image digest-gepinnt

The system SHALL invoke the Renovate container image pinned by both tag and `sha256` digest,
because the container receives the GitHub App installation token and is therefore subject to
the same supply-chain pinning rule as the secret-bearing Actions in the same workflow.

#### Scenario: Image-Referenz trägt Tag und Digest

- **GIVEN** der Workflow ruft `ghcr.io/renovatebot/renovate` auf
- **WHEN** die Image-Referenz geprüft wird
- **THEN** enthält sie sowohl einen Tag als auch einen `@sha256:`-Digest
- **AND** Renovates eigener `docker`-Manager kann den Pin dadurch selbst aktualisieren
