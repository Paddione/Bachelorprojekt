## MODIFIED Requirements

### Requirement: Brain MCP retrieval tools

The Brain MCP server SHALL continue to advertise exactly `brain_search` and `brain_read`.
`brain_search` SHALL accept its existing `query` and `top_k` parameters plus optional conjunctive
filters for `type`, `tags`, `status`, `source_kind`, and `as_of`. Without optional filters its
ranking and result-limit behavior SHALL remain backward compatible. Search results SHALL include
available provenance and validity metadata plus a computed freshness state. `brain_read` SHALL
continue returning the complete frontmatter and body for a slug.

#### Scenario: Existing unfiltered search remains compatible

- **GIVEN** a client calls `brain_search` with only `query` and `top_k`
- **WHEN** the server ranks matching pages
- **THEN** it returns no more than `top_k` results in score order
- **AND** the tool list still contains exactly `brain_search` and `brain_read`

#### Scenario: As-of search excludes invalid pages

- **GIVEN** pages whose validity intervals do and do not contain the requested `as_of` time
- **WHEN** a client searches with that `as_of` filter
- **THEN** only pages valid at that time are ranked
- **AND** legacy pages with unknown validity follow the documented compatibility policy

### Requirement: Offline retrieval quality evaluation

The repository SHALL provide a versioned offline retrieval evaluation set and runner using the
same index implementation as the MCP server. For each run it SHALL report Recall@k, mean
reciprocal rank, and stale-result rate in machine-readable and human-readable form. The initial
evaluation SHALL record a baseline without enforcing a hard quality threshold.

#### Scenario: Evaluation metrics are reproducible

- **GIVEN** a fixed wiki fixture and versioned JSONL query set
- **WHEN** the offline evaluation runs twice
- **THEN** both runs report identical Recall@k, mean reciprocal rank, and stale-result rate
- **AND** the runner performs no network access
