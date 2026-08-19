## ADDED Requirements

### Requirement: REQ-BRAIN-FOUNDATION-018 — Temporal provenance metadata

The Brain ingest pipeline SHALL add deterministic, flat provenance metadata to newly compiled
pages: `source_kind`, `source_revision`, `observed_at`, and `valid_from`. It MAY add
`valid_until` and `superseded_by`. Existing pages without these fields SHALL remain valid and
readable. When `valid_until` is present, the validity interval SHALL be interpreted as half-open:
`valid_from <= as_of < valid_until`.

#### Scenario: New pages receive deterministic provenance

- **GIVEN** a source selected by the ingest worklist
- **WHEN** the pipeline compiles it into a Brain page
- **THEN** the page carries its source kind, source revision, observation time, and validity start
- **AND** the source revision is derived from the source rather than invented by the LLM

#### Scenario: Legacy pages remain compatible

- **GIVEN** an existing Brain page with only `type`, `tags`, and `status`
- **WHEN** Brain lint, audit, or retrieval reads it
- **THEN** the page remains valid and readable
- **AND** missing lifecycle metadata is reported as unknown rather than fabricated

### Requirement: REQ-BRAIN-FOUNDATION-019 — Report-only lifecycle audit

The repository SHALL provide an offline deterministic Brain audit that reports invalid temporal
intervals, missing `superseded_by` targets, stale Bachelorprojekt source revisions, and conflicting
`claim:: <key> = <value>` edges whose active validity intervals overlap. The audit SHALL support
human-readable and JSON output and SHALL NOT mutate, delete, archive, or overwrite wiki pages.

#### Scenario: Overlapping conflicting claims are reported

- **GIVEN** two active pages with the same claim key, different values, and overlapping validity
- **WHEN** the lifecycle audit runs
- **THEN** it reports both page slugs and the conflicting claim key
- **AND** both files remain byte-for-byte unchanged

#### Scenario: A changed local source is reported as stale

- **GIVEN** a page whose recorded source revision differs from its current Bachelorprojekt source
- **WHEN** the lifecycle audit runs
- **THEN** it reports the page and source path as stale
- **AND** it does not rewrite the recorded revision

### Requirement: REQ-BRAIN-FOUNDATION-020 — Review-gated GitHub expertise source

GitHub-derived expertise ingestion SHALL require an explicit repository and pull-request scope.
Fetched material SHALL be written first to a local non-ingested staging area, minimize author
identity, redact secrets, and retain immutable source identifiers. Only an explicit approval step
SHALL create an artifact in the manifest-allowlisted `github-reviewed` source group. Ambient
organization-wide discovery and automatic ingestion of staged material SHALL be forbidden.

#### Scenario: Staged GitHub material is not ingestible

- **GIVEN** explicitly fetched PR and review material in the local staging area
- **WHEN** the Brain worklist is generated before approval
- **THEN** no staged file appears in the worklist

#### Scenario: Approved expertise preserves provenance

- **GIVEN** a reviewer approves a redacted staged artifact
- **WHEN** the approval command writes the allowlisted source document
- **THEN** it records repository, PR or review identifiers, source URL, and revision
- **AND** the worklist includes it under source kind `github-reviewed`
