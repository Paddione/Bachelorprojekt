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