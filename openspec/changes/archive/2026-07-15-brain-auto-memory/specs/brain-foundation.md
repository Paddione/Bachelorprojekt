## ADDED Requirements

### Requirement: REQ-BRAIN-FOUNDATION-008 — Auto-Memory Scan (read-only candidate detection)

The system SHALL provide a read-only, cron-safe scanner (`scripts/brain-auto-memory-scan.sh`)
that discovers Claude auto-memory pages under `~/.claude/projects/*/memory/*.md` (root
overridable via the `AUTO_MEMORY_ROOT` environment variable for testability) and emits a JSON
candidate list to `~/.claude/brain-auto-memory-candidates.json`. The scanner SHALL skip
`MEMORY.md` index files, SHALL parse each page's YAML frontmatter (`name`, `description`,
`metadata.type`) with naive line-based parsing (no `pyyaml` dependency), and SHALL compare each
file's `sha256sum` against the state file `~/.claude/brain-auto-memory-state.json`. A file SHALL
appear as a candidate only when it is new OR its hash changed since the last recorded export.
The scanner SHALL exit `0` in every case — including a missing memory root or zero candidates —
so it is a pure reporting step, never a failure.

#### Scenario: A new memory page is reported as a candidate

- **GIVEN** an `AUTO_MEMORY_ROOT` containing a project memory page with parsable frontmatter and
  no matching entry in the state file
- **WHEN** the scanner runs
- **THEN** it exits `0`
- **AND** the candidates JSON contains one entry carrying the page's `project`, `file`, `name`,
  `description`, `metadata_type`, and `hash`

#### Scenario: An unchanged memory page is not re-reported

- **GIVEN** a memory page whose current `sha256sum` already matches its state-file entry
- **WHEN** the scanner runs
- **THEN** it exits `0`
- **AND** the candidates JSON contains no entry for that page

#### Scenario: Missing memory root is a valid empty state

- **GIVEN** an `AUTO_MEMORY_ROOT` that does not exist
- **WHEN** the scanner runs
- **THEN** it exits `0`
- **AND** the candidates JSON is an empty array

### Requirement: REQ-BRAIN-FOUNDATION-009 — Auto-Memory Confidentiality & Parse Guardrails

The scanner SHALL skip any memory page whose body matches a credential pattern (`-----BEGIN`,
`api[_-]key`, or long hex/base64 blobs) and any page without parsable frontmatter, writing a
warning to `stderr` in both cases and continuing without crashing. Skipped pages SHALL NOT appear
in the candidate list, so no credential or unstructured content can reach the export step.

#### Scenario: A page with a secret pattern is skipped with a warning

- **GIVEN** a memory page whose body contains a `-----BEGIN` block
- **WHEN** the scanner runs
- **THEN** it writes a warning to `stderr`
- **AND** the candidates JSON contains no entry for that page

#### Scenario: A page without parsable frontmatter is skipped with a warning

- **GIVEN** a memory page with no YAML frontmatter block
- **WHEN** the scanner runs
- **THEN** it writes a warning to `stderr`
- **AND** it exits `0` without crashing
- **AND** the candidates JSON contains no entry for that page

### Requirement: REQ-BRAIN-FOUNDATION-010 — Auto-Memory Export (review-gated, one-way)

The system SHALL provide an interactive exporter (`scripts/brain-auto-memory-export.sh`) that
reads the candidate list (invoking the scanner internally when the list is missing or empty),
prompts per candidate with `[y/n/e]` (`e` overrides the target `type`), applies a fixed
type-mapping (`project`→`note`, `reference`→`note`, `feedback`→`decision`, `user`→`note` with a
review default of `n`), and writes each approved page — with converted frontmatter (`type`,
`tags: [auto-memory, <project>]`, `status: draft`) and its original body — to
`<BRAIN_REPO_PATH>/raw/auto-memory/<project>/<slug>.md`, where `slug` is the kebab-cased `name`.
The exporter SHALL `git add`/`commit`/`push` inside the `BRAIN_REPO_PATH` checkout. It SHALL
update the state file (hash + ISO timestamp) ONLY for pages actually exported (`y`), leaving
rejected pages (`n`) open for the next run.

#### Scenario: The type-mapping table converts feedback to decision

- **GIVEN** a candidate whose `metadata_type` is `feedback` approved with `y`
- **WHEN** the exporter converts it
- **THEN** the written page's frontmatter `type` is `decision`
- **AND** its `tags` include `auto-memory` and the source project
- **AND** its `status` is `draft`

#### Scenario: State updates only for approved exports

- **GIVEN** two candidates, one approved `y` and one rejected `n`
- **WHEN** the exporter finishes
- **THEN** the state file records a hash + timestamp for the approved page
- **AND** the state file has no entry for the rejected page

### Requirement: REQ-BRAIN-FOUNDATION-011 — Auto-Memory Export Abort Safety

The exporter SHALL abort — before any state-file mutation — when `BRAIN_REPO_PATH` is unset or is
not a git checkout, and SHALL abort leaving the state file unchanged when `git push` fails, so a
failed run never records a false export and the next run retries the same pages. No partial
progress or state/repo inconsistency is permitted.

#### Scenario: Missing BRAIN_REPO_PATH aborts without touching state

- **GIVEN** `BRAIN_REPO_PATH` is unset and a pre-existing state file
- **WHEN** the exporter runs
- **THEN** it exits non-zero with an error on `stderr`
- **AND** the state file is byte-for-byte unchanged
