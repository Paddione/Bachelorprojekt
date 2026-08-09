## MODIFIED Requirements

### Requirement: Konsolidierte Scope-Namen nennen ihr Ziel

The system SHALL reject a commit scope that was consolidated into another scope and SHALL name the target scope in the diagnostic, and SHALL report a scope whose subsystem was removed as retired rather than mapping it to a replacement. The scope `mcp-gateway` SHALL be recognized as consolidated into `mcp`, mirroring the existing `mcp-task-runner` alias.

#### Scenario: Konsolidierter Scope nennt sein Ziel *(BATS)*
- **GIVEN** ein Commit-Subject `feat(admin): add dashboard`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `website` als Zielscope

#### Scenario: Entfallener Scope wird nicht gemappt *(BATS)*
- **GIVEN** ein Commit-Subject `feat(tracking): add import`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und meldet den Scope als entfallen, ohne einen Ersatz-Scope zu nennen

#### Scenario: `mcp-gateway` nennt sein Ziel statt einer Tippfehler-Heuristik *(BATS)*
- **GIVEN** ein Commit-Subject `fix(mcp-gateway): agy headless mcp tool permissions`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `mcp` als Zielscope (nicht nur eine „did you mean"-Vermutung)

#### Scenario: `tickets` bleibt zu `factory` konsolidiert *(BATS)*
- **GIVEN** ein Commit-Subject `chore(tickets): register mcp tool params`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `factory` als Zielscope

## ADDED Requirements

### Requirement: Ablehnung eines unbekannten Scopes verweist auf den scope-blinden PR-Titel-Check

Because the CI PR-title check (`amannn/action-semantic-pull-request`) validates commit **type** but deliberately not **scope** — named-scope enforcement happens only in `scripts/validate-commit-msg.sh` — a green PR-title check carries no information about scope validity. The system SHALL, whenever it rejects a commit subject for an unknown scope, additionally print a note that the CI PR-title check does not validate scope, so a green PR title is not evidence that the scope will be accepted.

#### Scenario: Ablehnung eines unbekannten Scopes trägt den Hinweis *(BATS)*
- **GIVEN** ein Commit-Subject `fix(totally-not-a-real-scope): x`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Ausgabe enthält einen Hinweis darauf, dass der PR-Titel-Check keinen Scope prüft

#### Scenario: Ein gültiger Scope trägt keinen Ablehnungs-Hinweis *(BATS)*
- **GIVEN** ein Commit-Subject `fix(ops): correct commit-lint scope`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 0 ohne jede Ablehnungsdiagnose
