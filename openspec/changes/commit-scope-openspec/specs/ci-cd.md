## ADDED Requirements

### Requirement: Unknown-scope diagnostic names its source of truth and the listing command

Whenever `scripts/validate-commit-msg.sh` rejects a commit subject because its scope is
not allowed, the diagnostic SHALL additionally name the file in which the allowed scopes
are maintained (`commitlint.config.cjs`) and the command that prints every currently
allowed scope (`scripts/validate-commit-msg.sh scopes`). This addition SHALL appear for
every rejected scope — including scopes for which no alias hint and no nearest-scope
suggestion is available — and SHALL NOT replace or suppress the existing consolidation
hint from T002328 or the nearest-scope suggestion from T002240.

The named-scope allowlist itself SHALL remain unchanged; `openspec` stays an alias of
`plans` rather than becoming an accepted scope, because the consolidation to one name per
concept is the documented anchor of T002328.

#### Scenario: Rejected alias scope names source and listing command

- **GIVEN** the commit subject `chore(openspec): 54 gemergte Changes archivieren`
- **WHEN** `scripts/validate-commit-msg.sh message <file>` validates it
- **THEN** it exits non-zero
- **AND** the output contains `commitlint.config.cjs`
- **AND** the output contains `validate-commit-msg.sh scopes`
- **AND** the output still names `plans` as the consolidation target

#### Scenario: Rejected unknown scope without alias still names source and listing command

- **GIVEN** the commit subject `chore(zzzunbekannt): irgendwas`, whose scope matches no
  alias, no retired entry and no nearest-scope suggestion
- **WHEN** `scripts/validate-commit-msg.sh message <file>` validates it
- **THEN** it exits non-zero
- **AND** the output contains `commitlint.config.cjs`
- **AND** the output contains `validate-commit-msg.sh scopes`

#### Scenario: Valid scope is still accepted unchanged

- **GIVEN** the commit subject `chore(plans): archive a merged change`
- **WHEN** `scripts/validate-commit-msg.sh message <file>` validates it
- **THEN** it exits zero
- **AND** no unknown-scope diagnostic is printed
