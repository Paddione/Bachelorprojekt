## ADDED Requirements

### Requirement: Leere Checkliste ist kein CI-Erfolg

The system SHALL eine leere GitHub-Checkliste (PR DIRTY, CI nie gestartet) nicht als "CI ok" werten — das Prädikat über einer leeren Menge ist vakuos.

#### Scenario: PR DIRTY ohne Checks

- **GIVEN** ein PR mit mergeStateStatus=DIRTY und leerer Checkliste
- **WHEN** die Warteschleife die Checks auswertet
- **THEN** gilt der Zustand nicht als CI-Erfolg
- **AND** die Schleife wartet oder bricht mit klarer Meldung ab

### Requirement: Push-Erfolg nach abgelehntem Commit wird erkannt

The system SHALL einen Push-Erfolg, der auf einen zuvor abgelehnten Commit folgt, als inkonsistent erkennen statt als stillen Erfolg zu melden.

#### Scenario: Hook-Reject dann Push

- **GIVEN** ein Commit wurde vom Hook abgelehnt (rc≠0)
- **WHEN** danach ein Push gelingt
- **THEN** meldet das System die Inkonsistenz (Commit fehlt)

### Requirement: Pre-push akzeptiert Push nach Rebase

The system SHALL den Pre-push-Scope-Check gegen die merge-base statt gegen den Gesamtverlauf ausführen, sodass stale Scope-Commits aus rebased main einen validen Push nicht mehr blockieren.

#### Scenario: Rebase mit fremden Scope-Commits

- **GIVEN** ein Branch enthält stale Scope-Commits aus einem rebased main
- **WHEN** der Push geprüft wird
- **THEN** zählen nur die Commits seit der merge-base

### Requirement: Archivierung committet openspec-status.json

The system SHALL nach `openspec.sh archive` das openspec-status.json zwingend regenerieren und committen, sodass Archiv-PRs den freshness gate bestehen.

#### Scenario: Archiv-PR

- **GIVEN** ein Change wird archiviert
- **WHEN** der Archiv-PR erstellt wird
- **THEN** enthält er die openspec-status.json-Änderung
- **AND** der freshness gate besteht

### Requirement: openspec/-only startet kein Live-E2E

The system SHALL `test:changed` bei einer reinen openspec/-Änderung ohne Live-E2E gegen korczewski ausführen.

#### Scenario: openspec/-only PR

- **GIVEN** ein PR ändert nur openspec/-Dateien
- **WHEN** test:changed läuft
- **THEN** startet es kein Live-E2E
- **AND** openspec-spezifische Gates laufen

### Requirement: Cluster-abhängige Bats werden ausgeführt oder skippen begründet

The system SHALL cluster-abhängige `tests/spec/*.bats` in CI ausführen (fleet-Kontext) oder ihren Skip explizit begründet dokumentieren.

#### Scenario: Cluster-bats in CI

- **GIVEN** eine cluster-abhängige Bats-Datei
- **WHEN** CI läuft
- **THEN** wird sie ausgeführt oder ihr Skip ist explizit begründet
- **AND** kein stilles "nie ausgeführt"
