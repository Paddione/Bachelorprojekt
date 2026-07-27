## MODIFIED Requirements

### Requirement: Preflight-PR-Scope-Validierung
<!-- bats: preflight-pr-scope.bats -->

The system SHALL validate PR title scopes against the named-scope list in `commitlint.config.cjs` before `gh pr create` and SHALL exit 0 for valid scopes and exit non-zero with an allowlist hint for unknown scopes.

#### Scenario: Gültiger Scope besteht die Validierung *(BATS)*
- **GIVEN** ein PR-Titel `feat(website): add dashboard` und `commitlint.config.cjs` mit `website` in `namedScopes`
- **WHEN** `scripts/preflight-pr-scope.sh` mit dem Titel aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0

#### Scenario: Ungültiger Scope schlägt fehl mit Allowlist-Hinweis *(BATS)*
- **GIVEN** ein PR-Titel `feat(cockpit): add view` wobei `cockpit` nicht im Allowlist steht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0 und gibt "NOT in the semantic-PR allowlist" sowie die erlaubten Scopes aus

#### Scenario: Scope-loser Titel wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `docs: update readme` ohne Scope-Klammer
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 und gibt einen "no scope"-Hinweis aus

#### Scenario: Gültiger Scope mit Breaking-Change-Marker wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `feat(db)!: breaking schema` mit `!` nach dem Scope
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 — der Breaking-Change-Marker beeinflusst die Scope-Validierung nicht

## REMOVED Requirements

### Requirement: Preflight-PR-Scope-Validierung — Scenario "Fehlende Workflow-Datei liefert Exit-Code 2"

Das Szenario prüfte einen Exit-Code, den es nur gab, weil `scripts/preflight-pr-scope.sh` einen
ci.yml-Pfad als zweites Argument entgegennahm. Der Parameter entfällt mit T002328 ersatzlos —
die Allowlist kommt ausschließlich aus `commitlint.config.cjs`. Ein Parameter, der etwas
annimmt und wegwirft, wäre genau die Halbwahrheit, aus der der ursprüngliche Drift entstand.

## ADDED Requirements

### Requirement: Konsolidierte Scope-Namen nennen ihr Ziel
<!-- bats: ci-cd.bats -->

The system SHALL reject a commit scope that was consolidated into another scope and SHALL name the target scope in the diagnostic, and SHALL report a scope whose subsystem was removed as retired rather than mapping it to a replacement.

#### Scenario: Konsolidierter Scope nennt sein Ziel *(BATS)*
- **GIVEN** ein Commit-Subject `feat(admin): add dashboard`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `website` als Zielscope

#### Scenario: Entfallener Scope wird nicht gemappt *(BATS)*
- **GIVEN** ein Commit-Subject `feat(tracking): add import`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und meldet den Scope als entfallen, ohne einen Ersatz-Scope zu nennen

#### Scenario: register-scope verweigert die Wiederanlage *(BATS)*
- **GIVEN** der konsolidierte Scope-Name `admin`
- **WHEN** `scripts/register-scope.sh admin` aufgerufen wird
- **THEN** liefert das Skript einen Exit-Code ungleich 0 und trägt den Namen nicht in `commitlint.config.cjs` ein
