# openspec-pgvector

## Purpose

OpenSpec-Dokumente (`proposal.md`, `tasks.md`, `specs/<slug>.md`) werden über einen Embedding-basierten Read-Pfad in `knowledge.chunks` (pgvector, HNSW `vector_cosine_ops`) indexiert, sodass Agents semantisch nach relevanten Specs/Plänen suchen können, ohne den gesamten `openspec/`-Tree zu scannen. Der Write-Pfad ist best-effort und unterbricht den OpenSpec-Lifecycle nie.

## Requirements

### Requirement: Standalone Embed-CLI ohne Website-Pod-Abhängigkeit

The system SHALL provide a Node.js ESM script `scripts/openspec-embed.mjs` that reads OpenSpec files, chunks them, embeds via the LLM Gateway (`llm-gateway-embed:8081`, model `bge-m3` when `LLM_ENABLED=true`, else `voyage-multilingual-2` fallback), and upserts the result into `knowledge.chunks` against a single `specs_plans` collection. The script SHALL exit 0 on any error (best-effort) and log a warning to stderr.

#### Scenario: Embed-CLI schreibt im Dry-Run nichts

- **GIVEN** `OPENSPEC_EMBED_REPO=<tmp>` mit einer Demo-Changes-Struktur
- **WHEN** `node scripts/openspec-embed.mjs --slug demo --dry-run` aufgerufen wird
- **THEN** ist Exit-Code 0
- **AND** `knowledge.chunks` wurde nicht verändert (kein DB-Write)

#### Scenario: Embed-Fehler bricht Apply/Archive nicht ab

- **GIVEN** der TEI-Endpunkt ist nicht erreichbar
- **WHEN** `bash scripts/openspec.sh apply <slug>` aufgerufen wird
- **THEN** beendet sich `apply` mit Exit 0
- **AND** `proposal.md` und `tasks.md` werden trotzdem in `plan_staged` überführt

### Requirement: Astro-Read-API für semantische Suche

The system SHALL provide `GET /api/openspec/search?q=<query>&limit=<n>` which embeds the query, runs a `pgvector <=>` nearest-neighbor query against `knowledge.chunks` joined with `knowledge.documents`, and returns JSON `{ ok: true, results: [{ id, slug, path, score, snippet }] }`. The endpoint SHALL reuse the existing `embeddings.ts` / `knowledge-db.ts` infrastructure.

#### Scenario: Suche liefert Top-1-Treffer aus dem Index

- **GIVEN** `knowledge.chunks` enthält einen indexierten Chunk zu `openspec/specs/openspec-workflow.md`
- **WHEN** `GET /api/openspec/search?q=openspec%20workflow&limit=1` aufgerufen wird
- **THEN** antwortet die API mit HTTP 200
- **AND** `results[0].path` enthält `openspec/specs/openspec-workflow.md`

### Requirement: plan-context.sh --semantic Flag

The system SHALL add a `--semantic <query>` flag to `scripts/plan-context.sh` that queries `/api/openspec/search` and emits a `## semantically similar` section. If the API is unreachable, the script SHALL silently fall back to the grep-only output (exit 0).

#### Scenario: Semantic section appears when the API is reachable

- **GIVEN** `/api/openspec/search` is reachable and returns at least one result
- **WHEN** `bash scripts/plan-context.sh infra --semantic "sealed secrets"` runs
- **THEN** the output contains a `## semantically similar` section listing the results

#### Scenario: Unreachable API falls back to grep-only output

- **GIVEN** `/api/openspec/search` is unreachable
- **WHEN** `bash scripts/plan-context.sh infra --semantic "sealed secrets"` runs
- **THEN** the script exits 0
- **AND** emits the grep-only output without a `## semantically similar` section

### Requirement: MCP-Tool openspec_find_similar

The system SHALL expose an MCP tool `openspec_find_similar` (registered in `scripts/factory/mcp-server.mjs`) that wraps `/api/openspec/search` for agent-side discovery.

#### Scenario: Agent finds similar specs via MCP

- **GIVEN** the factory MCP server is running and `knowledge.chunks` contains indexed OpenSpec chunks
- **WHEN** an agent calls `openspec_find_similar` with a query string
- **THEN** the tool returns the `/api/openspec/search` results (slug, path, score, snippet) as structured output

### Requirement: Embedding-Modell-Konsistenz ohne Mixed-Model-Error

The system SHALL store exactly one `embedding_model` value per `knowledge.collections` row, mirrored from `createCollection`'s default (`bge-m3` when `LLM_ENABLED=true`, else `voyage-multilingual-2`). Re-indexing SHALL use the same model as the existing collection — no mixed-model inserts.

#### Scenario: Re-indexing keeps the collection's embedding model

- **GIVEN** the `specs_plans` collection exists with `embedding_model='bge-m3'`
- **WHEN** `node scripts/openspec-embed.mjs` re-indexes documents into that collection
- **THEN** all new chunks are embedded with `bge-m3`
- **AND** no row in the collection ends up with a different `embedding_model` value

<!-- from archive/2026-06-21-openspec-pgvector/tasks.md lines 1-180 -->
