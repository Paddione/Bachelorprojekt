## ADDED Requirements

### Requirement: Commit-Hook-Empfehlungen sind Scope-konform

The system SHALL ensure that all concrete scope prefixes recommended by
`check-commit-vs-diff.sh` in user-facing messages are valid entries in the
scope allowlist of `validate-commit-msg.sh`.

#### Scenario: Scope wird umbenannt

- **GIVEN** `validate-commit-msg.sh scopes` listet `plans` aber nicht `plan`
- **WHEN** `check-commit-vs-diff.sh` empfiehlt `chore(plan):`
- **THEN** schlägt der Guard-Test fehl
- **AND** die Empfehlung wird auf `chore(plans):` korrigiert
