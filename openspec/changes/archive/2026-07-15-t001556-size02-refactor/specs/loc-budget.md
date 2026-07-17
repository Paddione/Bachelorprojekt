## ADDED Requirements

### Requirement: REQ-LOC-BUDGET-SIZE02 — G-SIZE02 Großdateien-Gate für VideoVault und .opencode

The system SHALL enforce a quality gate (G-SIZE02) that limits the number of source files
exceeding 600 lines in the `VideoVault/` and `.opencode/` directories to at most 8.
This gate SHALL be measured via `git ls-files VideoVault .opencode` filtered to
`.(ts|tsx|js|mjs|svelte)` files and checked with `wc -l`.
Refactoring SHALL split large modules into feature-scoped sub-modules (e.g., upload-core,
upload-validation, upload-progress) using re-exports to avoid duplication.
Skills documentation exceeding the threshold SHALL be grouped by domain (dev-flow, superpowers,
references) into separate sub-files with an aggregating OVERVIEW.

#### Scenario: Refactored VideoVault modules stay below 600 lines

- **GIVEN** the `VideoVault/src/lib/upload.ts` module has been split into sub-modules
- **WHEN** `git ls-files VideoVault | grep -E '\.(ts|tsx|js|mjs|svelte)$' | xargs wc -l | awk '$1>600'` is executed
- **THEN** the count of files exceeding 600 lines in VideoVault/ is ≤ 8

#### Scenario: .opencode skills grouped by domain stay below 600 lines

- **GIVEN** `.opencode/skills/**/*.md` files have been split into domain groups
- **WHEN** `git ls-files .opencode | grep -E '\.(ts|tsx|js|mjs|svelte)$' | xargs wc -l | awk '$1>600'` is executed
- **THEN** the count of files exceeding 600 lines in .opencode/ is ≤ 0
