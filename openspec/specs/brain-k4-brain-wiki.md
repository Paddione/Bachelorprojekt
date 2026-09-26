# brain-k4-brain-wiki

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k4-brain-wiki ergänzen._

## Requirements

### Requirement: Sektions-Chunking statt Kürzung (REQ-k4-04)

Der Ingest SHALL Quelldateien an Abschnittsgrenzen in Chunks unterhalb der
Prompt-Obergrenze zerlegen, statt sie zu kürzen.

#### Scenario: OpenSpec-Spec mit Requirement-Überschriften

- **GIVEN** a source file with at least two `### Requirement:` headings and more characters than the chunk target size
- **WHEN** `scripts/brain-chunk.sh` processes the file
- **THEN** it emits more than one chunk, every chunk boundary falls on a `### Requirement:` heading, and no chunk exceeds the configured target size

#### Scenario: Quelle ohne Requirement-Ebene

- **GIVEN** a source file with no `### Requirement:` headings but multiple `## ` headings
- **WHEN** `scripts/brain-chunk.sh` processes the file
- **THEN** it falls back to the `## ` heading level and still emits chunks whose concatenation reproduces the source content

#### Scenario: Chunk-Manifest als TSV

- **GIVEN** a source file is chunked
- **WHEN** the chunker writes to stdout
- **THEN** each line is TAB-separated as `<chunk-file>\t<chunk-slug>\t<index>\t<heading>` and the chunk slugs sort lexicographically in the same order as their numeric index

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

<!-- merged from change delta brain-k4-brain-wiki.md (cbb6f7d8451c) -->

### Requirement: K4-Spiegel ist entfernt (REQ-k4-10)

No ingest job SHALL write to the external Brain wiki anymore: the
ingest manifest, the pipeline scripts, the merge-hook workflow and the
ingest skill SHALL be absent, and recall over specs and docs SHALL be
served by the K1 embeddings and the K3 code graph instead.

#### Scenario: No ingest entry points remain

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** `scripts/brain-ingest.sh`, `scripts/brain/ingest-sources.yaml`
  and `.github/workflows/brain-merge-hook.yml` do not exist
- **AND** no Taskfile task name starts with `brain:ingest`

#### Scenario: No MCP recall path on the wiki remains

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** neither `scripts/brain-mcp-server.py` nor
  `scripts/brain-mcp-node/server.mjs` exists
- **AND** no MCP registry or harness config advertises `brain_search`
  or `brain_read`

<!-- merged from change delta brain-k4-brain-wiki.md (9f3435df9fbc) -->

### Requirement: Versioned eval set is wired into CI

The repository SHALL maintain the versioned retrieval eval set at
`tests/fixtures/brain/retrieval-eval.jsonl`, covering runbook, adr, spec and
diagram queries plus validity-filter (`as_of`/stale) and field-filter cases,
and CI SHALL execute it through the offline runner on a deterministic fixture.

#### Scenario: Wired set passes on fixture

- **GIVEN** the versioned eval set and a fixture wiki directory
- **WHEN** the offline runner evaluates the set twice
- **THEN** both runs report identical Recall@k, MRR and stale-result rate
- **AND** the BATS suite covering this requirement is green in CI

#### Scenario: Invalid set fails closed

- **GIVEN** an eval set with an unknown top-level key or an empty case list
- **WHEN** the runner loads it
- **THEN** it exits non-zero without emitting metrics

### Requirement: Baseline artifact is recorded

The repository SHALL commit a machine-readable baseline of a real-wiki eval
run at `tests/fixtures/brain/retrieval-baseline.json` carrying `schema_version`,
the eval-set reference, the wiki revision it was taken against, and aggregate
Recall@k, MRR and stale-result rate. The artifact is informational and SHALL
NOT gate any check.

#### Scenario: Baseline is present and well-formed

- **GIVEN** the committed baseline artifact
- **WHEN** its JSON is parsed
- **THEN** `schema_version`, eval-set reference, wiki revision and all three
  aggregate metrics are present
- **AND** no CI job fails on its values

<!-- merged from change delta brain-k4-brain-wiki.md (79fe21463493) -->