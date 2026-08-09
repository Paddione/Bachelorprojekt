## ADDED Requirements

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

### Requirement: Fail-closed Prompt-Obergrenze (REQ-k4-05)

`MAX_SOURCE_CHARS` SHALL be a fail-closed guard rather than a silent truncation.

#### Scenario: Übergroße Quelle wird abgelehnt

- **GIVEN** a source file larger than `MAX_SOURCE_CHARS`
- **WHEN** `scripts/brain-ingest-transform.sh` is invoked on it
- **THEN** it exits non-zero, emits no transformed page, and its error message names the actual length, the limit, and the chunker

#### Scenario: Quelle innerhalb der Grenze bleibt unverändert

- **GIVEN** a source file smaller than `MAX_SOURCE_CHARS`
- **WHEN** `scripts/brain-ingest-transform.sh` is invoked on it
- **THEN** the full source content reaches the prompt and no truncation marker is added

### Requirement: Deterministische Eltern-MOC (REQ-k4-06)

Für jede gechunkte Quelle SHALL eine Eltern-MOC-Seite ohne LLM-Beteiligung aus
dem Chunk-Manifest erzeugt werden.

#### Scenario: MOC verlinkt genau die erzeugten Chunks

- **GIVEN** a source that was split into N chunks
- **WHEN** the parent MOC page is generated
- **THEN** it contains exactly N `[[wikilink]]` entries, each targeting an existing chunk slug, and it carries a `source::` back-reference to the original source path

### Requirement: Coverage-Gate im Ingest (REQ-k4-07)

Phase 3 SHALL die eingespeiste Korpus-Abdeckung messen und unterhalb der
Schwelle fail-closed abbrechen.

#### Scenario: Abdeckung unter der Schwelle bricht ab

- **GIVEN** the characters delivered to the LLM cover less than the configured minimum percentage of the attempted worklist source characters
- **WHEN** the ingest reaches its quality gates
- **THEN** it exits non-zero, reports the measured percentage and the threshold, and delivers nothing

#### Scenario: Abdeckung über der Schwelle läuft durch

- **GIVEN** coverage is at or above the configured minimum percentage
- **WHEN** the ingest reaches its quality gates
- **THEN** the coverage gate passes and reports the measured percentage

### Requirement: Brain-Retrieval als MCP-Server (REQ-k4-08)

`scripts/brain-mcp-server.py` SHALL ein stdio-MCP-Server mit gerankter Suche
und Seitenabruf sein.

#### Scenario: Werkzeuge werden ausgewiesen

- **GIVEN** the server is started on stdio
- **WHEN** a JSON-RPC `initialize` request is followed by `tools/list`
- **THEN** the response advertises exactly the tools `brain_search` and `brain_read` with their input schemas

#### Scenario: Suche liefert Rang und Snippet

- **GIVEN** a wiki directory with several pages, one of which matches the query term far more often than the others
- **WHEN** `tools/call` invokes `brain_search` with that term and a `top_k`
- **THEN** at most `top_k` results are returned, the strongest match ranks first, and every result carries a slug, a score and a text snippet

#### Scenario: Seitenabruf und Fehlerfall

- **GIVEN** a wiki directory containing a page with a known slug
- **WHEN** `tools/call` invokes `brain_read` with that slug, and again with an unknown slug
- **THEN** the known slug returns the page frontmatter and body, and the unknown slug returns a JSON-RPC error rather than an empty success

### Requirement: Registrierung in der MCP-Registry (REQ-k4-09)

Der Brain-MCP-Server SHALL über die SSOT-Registry an alle Harnesses verteilt
werden.

#### Scenario: Registry ist Quelle, Konfigurationen sind generiert

- **GIVEN** `docs/agent-guide/registry/mcp.yaml` declares the brain MCP server with `transport: stdio` and harness blocks for claude_code, agy and opencode
- **WHEN** `task mcp:check` runs
- **THEN** it reports no drift, and both `.mcp.json` and `.opencode/opencode.jsonc` contain the generated brain server entry

#### Scenario: Kein llama.cpp-Kindprozess

- **GIVEN** the brain MCP server declares no `harness.llamacpp` block
- **WHEN** `scripts/llm/mcp-servers.json` is regenerated
- **THEN** it contains no brain server entry, because that file only takes servers that llama-server should spawn as a child process on every model start
