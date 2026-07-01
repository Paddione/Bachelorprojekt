## ADDED Requirements

### Requirement: Health-Goal-Messbefehle referenzieren nur existierende Workflow-Dateien
<!-- bats: ci-cd.bats -->

The system SHALL ensure that every `--workflow <datei>.yml` reference in `.claude/lib/goals.md`
points to a `.github/workflows/*.yml` file that currently exists in the repository, so that a
workflow consolidation or rename cannot silently freeze a health-goal measurement on a dead data
stream.

#### Scenario: goals.md referenziert keine geloeschte Workflow-Datei *(BATS)*
- **GIVEN** `.claude/lib/goals.md` enthaelt einen oder mehrere `--workflow <datei>.yml`-Verweise
- **WHEN** jeder referenzierte Dateiname gegen den Inhalt von `.github/workflows/` geprueft wird
- **THEN** existiert jede referenzierte Datei; ein Verweis auf eine geloeschte Datei laesst den
  Test fehlschlagen
