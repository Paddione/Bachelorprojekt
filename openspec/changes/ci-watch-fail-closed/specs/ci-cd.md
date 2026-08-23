## ADDED Requirements

### Requirement: Die CI-Gegenprobe entlastet nur mit Belegen

`scripts/devflow-ci-watch.sh` SHALL einen als `failure` gemeldeten Check nur dann als
unbedenklich einstufen, wenn der zugehörige Workflow-Run **gefunden** wurde und dessen Jobs
nachweislich keine `failure`-Conclusion tragen.

Kann der Run nicht bestimmt werden — weil kein passender Run gefunden wurde oder der PR-Branch
nicht ermittelbar ist —, SHALL der gemeldete Fehler bestehen bleiben und das Skript SHALL NICHT
mit Exit 0 „alle grün" melden.

Der Run-Lookup SHALL den Branch aus dem Pull Request beziehen und NICHT aus dem lokalen
Arbeitsverzeichnis: der dokumentierte Aufrufweg führt über das Haupt-Checkout, in dem `main`
ausgecheckt ist.

#### Scenario: Kein zugehöriger Run auffindbar

- **GIVEN** die check-runs-API meldet für den PR-HEAD eine `failure`-Conclusion
- **AND** zu diesem HEAD ist über den PR-Branch kein Run auffindbar
- **WHEN** `devflow-ci-watch.sh` die Checks bewertet
- **THEN** meldet es nicht „alle grün"
- **AND** der Exit-Code ist ungleich 0

#### Scenario: PR-Branch nicht bestimmbar

- **GIVEN** die check-runs-API meldet eine `failure`-Conclusion
- **AND** der PR-Branch ist nicht ermittelbar
- **WHEN** `devflow-ci-watch.sh` die Checks bewertet
- **THEN** meldet es nicht „alle grün"

#### Scenario: Nachweislich harmloses Aggregat bleibt grün

- **GIVEN** ein Run wurde über den PR-Branch gefunden
- **AND** keiner seiner Jobs trägt die Conclusion `failure`
- **WHEN** `devflow-ci-watch.sh` die Checks bewertet
- **THEN** gilt der Check als entlastet und der Lauf endet mit Exit 0
