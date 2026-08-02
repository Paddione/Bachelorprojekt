# mishap-bundle-dev-flow-scripts

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-bundle-dev-flow-scripts ergänzen._

## Requirements

### Requirement: W3-PARTIAL-NO-FALSE-POSITIVE

plan-lint SHALL NOT emit W3 for a file listed in `## File Structure` when at least one task (including those in `tasks.d/*.md` partial files) references the file by its basename, even when the reference is followed by a line-range suffix (`:N-M`).

#### Scenario: Partial-Plan mit Zeilenbereich-Referenz feuert kein W3

- **GIVEN** a partial-mode plan with `## File Structure` listing `scripts/register-scope.sh`
- **AND** a `tasks.d/pN-impl.md` task containing: `- Modify: \`scripts/register-scope.sh:6-31\``
- **WHEN** plan-lint runs on the index plan
- **THEN** the verdict SHALL NOT include a W3 warning for `scripts/register-scope.sh`

### Requirement: CLAUDE-DEPRECATED-HOOK

#### Scenario: CLAUDE-DEPRECATED-HOOK

CLAUDE.md SHALL reference the active frontmatter command (`vda.sh frontmatter`) and NOT the deprecated `plan-frontmatter-hook.sh` outside its deprecation notice.

### Requirement: COMMIT-SCOPE-ALLOWLIST

#### Scenario: COMMIT-SCOPE-ALLOWLIST

Scripts that generate `git commit` commands SHALL use a scope from the `namedScopes` allowlist in `commitlint.config.cjs`.

<!-- merged from change delta mishap-bundle-dev-flow-scripts.md (528a8886a239) -->