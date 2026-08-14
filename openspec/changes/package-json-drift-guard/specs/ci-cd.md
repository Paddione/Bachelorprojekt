# ci-cd Delta — Subagent-Package-Drift-Guard

## ADDED Requirements

### Requirement: Package-Json-Drift-Guard

The commit-msg guard SHALL reject implementation commits (`fix`/`feat`/`refactor`/`perf`
subject prefixes) whose staged diff includes `.opencode/package.json` or
`.opencode/package-lock.json`, unless the subject explicitly declares a dependency
update (`chore(deps)`/`fix(plugins)`/`build(deps)`). Commits without those two files
SHALL keep their current behavior.

#### Scenario: Implementierungs-Commit mit Package-Rauschen wird blockiert

- **GIVEN** ein `fix(...)`-Commit mit echtem Code UND staged `.opencode/package.json`-Änderung (unbeabsichtigtes `npm install`-Rauschen eines Subagent-Dispatches)
- **WHEN** `check-commit-vs-diff.sh` den Commit prüft
- **THEN** Exit 1; die Meldung nennt `package.json` und den korrekten Präfix (`chore(deps):`)

#### Scenario: Deklariertes Dependency-Update bleibt erlaubt

- **GIVEN** ein `chore(deps)`-Commit mit `.opencode/package.json` + `package-lock.json` (legitimes Plugin-Update)
- **WHEN** `check-commit-vs-diff.sh` den Commit prüft
- **THEN** Exit 0; das Update passiert das Gate

#### Scenario: Commit ohne Package-Artefakte unverändert

- **GIVEN** ein normaler Implementierungs-Commit ohne `.opencode/package*.json` im Diff
- **WHEN** `check-commit-vs-diff.sh` den Commit prüft
- **THEN** Exit 0; das bestehende T001434-Verhalten gilt unverändert
