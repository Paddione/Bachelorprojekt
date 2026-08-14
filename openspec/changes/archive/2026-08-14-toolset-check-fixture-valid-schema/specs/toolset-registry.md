## ADDED Requirements
 
### Requirement: Usage semantics schema validation in check runner

The automated test runner in `scripts/toolset/check.test.mjs` SHALL validate that `check.mjs` passes when valid usage semantics (`use_when`, `roles`) are present in test fixtures, and SHALL validate that `check.mjs` fails when a canonical instance lacks `use_when` or non-empty `roles`.

#### Scenario: Valid fixture with usage semantics passes
 
- **GIVEN** a test fixture with a canonical instance containing valid `use_when` and non-empty `roles`
- **WHEN** `node scripts/toolset/check.mjs` executes in the test runner
- **THEN** it exits zero with "check passed"
 
#### Scenario: Canonical fixture missing usage semantics fails
 
- **GIVEN** a test fixture with a canonical instance missing `use_when` or `roles`
- **WHEN** `node scripts/toolset/check.mjs` executes in the test runner
- **THEN** it exits non-zero and reports missing `use_when` or missing `roles`

