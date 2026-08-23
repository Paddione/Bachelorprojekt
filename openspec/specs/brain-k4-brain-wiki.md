# brain-k4-brain-wiki

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k4-brain-wiki ergänzen._

## Requirements

### Requirement: Diagramm der Ingest-Pipeline (REQ-k4-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K4 erstellt wird
**THEN** existiert ein Diagramm der Ingest-Pipeline mit beschrifteten Kanten

### Requirement: Quellgruppen-Erhebung (REQ-k4-02)

#### Scenario: Quellgruppen-Survey

**GIVEN** ingest-sources.yaml definiert 8 Quellgruppen
**WHEN** K4 dokumentiert die Quellen
**THEN** ist erfasst, welche Gruppen aktuell befüllt sind und welche keinen Trigger haben

### Requirement: Lesepfad-Integration (REQ-k4-03)

#### Scenario: Integrations-Analyse

**GIVEN** K1 und K3 sind separate Wissensquellen
**WHEN** K4 analysiert die Integration
**THEN** ist dokumentiert, ob der Brain-Lesepfad mit K1/K3 zusammenhängt oder eine unverbundene Wissensinsel bildet

<!-- merged from change delta brain-k4-brain-wiki.md (6bf8cb531469) -->

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

<!-- merged from change delta brain-k4-brain-wiki.md (fe55f289db6c) -->

### Requirement: Brain MCP retrieval tools

The Brain MCP server SHALL continue to advertise exactly `brain_search` and `brain_read`.
`brain_search` SHALL accept its existing `query` and `top_k` parameters plus optional conjunctive
filters for `type`, `tags`, `status`, `source_kind`, and `as_of`. Without optional filters its
ranking and result-limit behavior SHALL remain backward compatible. Search results SHALL include
available provenance (including `upstream_revision` when present) and validity metadata plus a
computed freshness state. `brain_read` SHALL
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

<!-- merged from change delta brain-k4-brain-wiki.md (cbb6f7d8451c) -->

### Requirement: Brain-Ingest-Delivery-Integrität

Der Brain-Ingest SHALL jeden Lauf vom aktuellen `origin/main` des Ziel-Repos starten und SHALL die Auslieferung verhindern, wenn der Base des generierten Commits beim Delivery-Zeitpunkt nicht mehr dem aktuellen `origin/main` entspricht, es sei denn, der generierte Commit lässt sich sauber auf den neuen Main rebasen.

#### Scenario: Run starts from current main even when delivery branch exists

- **GIVEN** der Remote-Branch `feature/brain-initial-ingest` existiert im Ziel-Repo und liegt N Commits hinter `origin/main`
- **WHEN** ein Ingest-Lauf die Branch-Preparation durchführt
- **THEN** wird der Arbeitsbranch von `origin/main` (nicht von `origin/$BRANCH`) erzeugt

#### Scenario: Main moved during generation — rebase or abort

- **GIVEN** ein Ingest-Lauf hat generiert und `origin/main` ist währenddessen um mindestens einen Commit gewandert
- **WHEN** das Staleness-Gate vor dem Push prüft
- **THEN** wird der einzelne generierte Commit auf den neuen `origin/main` gerebased, sofern der Rebase konfliktfrei durchläuft
- **AND** schlägt der Rebase fehl, bricht der Lauf mit Exit-Code ungleich 0 ab, ohne zu pushen

#### Scenario: Rejected push fails loudly

- **GIVEN** der Remote-Branch divergiert vom lokalen Stand (Push würde nicht fast-forwarden)
- **WHEN** der Delivery-Push ausgeführt wird
- **THEN** endet der Skriptlauf mit Exit-Code ungleich 0 und einer Fehlermeldung
- **AND** der Lauf meldet keinen Erfolg (`exit 0` nach fehlgeschlagenem Push ist verboten)

<!-- merged from change delta brain-k4-brain-wiki.md (5e2a1c371426) -->

### Requirement: Dokumentierter Dry-Run-Einstieg ist ausführbar

Der dokumentierte Audit-Einstieg `task brain:ingest:dry` SHALL ohne manuelles Setzen von
Umgebungsvariablen ausführbar sein. Der Task SHALL `LM_MODEL` auf einen Default setzen
(überschreibbar via Environment) und SHALL den Ingest-Pool-Endpunkt (`http://localhost:8093`)
als Default für `LM_STUDIO_URL` verwenden.

Die T002533-Pflicht bleibt für Direktaufrufer von `scripts/brain-ingest.sh` bestehen: ohne
den Wrapper SHALL das Script weiterhin ohne `LM_MODEL` abbrechen.

#### Scenario: Dry-Run ohne Env-Setzung

- **GIVEN** keine der Variablen `LM_MODEL` oder `LM_STUDIO_URL` ist exportiert
- **WHEN** `task brain:ingest:dry` ausgeführt wird
- **THEN** bricht der Lauf nicht mit der T002533-Pflichtmeldung ab
- **AND** der Aufruf erreicht die Dry-Run-Logik von `scripts/brain-ingest.sh`

#### Scenario: Explizite Überschreibung

- **GIVEN** `LM_MODEL` ist vom Aufrufer explizit gesetzt
- **WHEN** `task brain:ingest:dry` ausgeführt wird
- **THEN** verwendet der Lauf den explizit gesetzten Wert statt des Defaults

#### Scenario: Doku-Verweis trifft zu

- **GIVEN** der system-audit-Skill verweist auf `task brain:ingest:dry`
- **WHEN** ein Auditierer dem Verweis folgt
- **THEN** existiert der Task in `Taskfile.yml`

<!-- merged from change delta brain-k4-brain-wiki.md (ccb52363d336) -->