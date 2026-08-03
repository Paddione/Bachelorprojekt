## ADDED Requirements

### Requirement: pipeline.mjs enthält alle Blöcke aus pipeline.js

The system SHALL keep `pipeline.mjs` (the dispatched path) in sync with `pipeline.js`, so that
the partial-fanout (T002074) and guard-overwrite (T002286) blocks present in `pipeline.js` are
also present in `pipeline.mjs`. The `pipeline.js` duplicate SHALL be removed and all references
SHALL point to `pipeline.mjs`.

#### Scenario: Fehlende Blöcke sind nach pipeline.mjs portiert

- **GIVEN** `pipeline.js` enthält Partial-Fanout- und Guard-Overwrite-Blöcke
- **WHEN** `pipeline.mjs` geprüft wird
- **THEN** enthält es dieselben Blöcke
- **AND** `pipeline.js` ist entfernt
- **AND** alle Referenzen zeigen auf `pipeline.mjs`

#### Scenario: Dispatched-Pfad läuft vollständig

- **GIVEN** die portierten Blöcke sind in `pipeline.mjs` vorhanden
- **WHEN** der dispatched-Pfad ausgeführt wird
- **THEN** läuft er vollständig mit den portierten Blöcken

### Requirement: Kontrakttests laufen gegen den dispatched-Pfad

The system SHALL run the contract tests against `pipeline.mjs` (the live dispatched path), so
that regressions in the live path are detected. The tests SHALL reference `pipeline.mjs` via
`PIPELINE_SCRIPT`/`PJS` instead of `pipeline.js`.

#### Scenario: Kontrakttests nutzen pipeline.mjs

- **GIVEN** die Kontrakttests werden ausgeführt
- **WHEN** die Skript-Referenz geprüft wird
- **THEN** zeigt `PIPELINE_SCRIPT`/`PJS` auf `pipeline.mjs`
- **AND** nicht auf `pipeline.js`

#### Scenario: Regression in pipeline.mjs wird erkannt

- **GIVEN** eine Regression wird in `pipeline.mjs` eingeführt
- **WHEN** der Negativtest läuft
- **THEN** schlägt der Test fehl
- **AND** die Regression wird erkannt
