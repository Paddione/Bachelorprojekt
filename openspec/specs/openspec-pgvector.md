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

### Requirement: Wrapper probe timeout tolerates the real backend latency

`scripts/openspec-embed-local.sh` SHALL probe the embedding backend (`POST
{LLM_EMBED_URL}/v1/embeddings`) with a client timeout configurable via
`OPENSPEC_EMBED_PROBE_TIMEOUT` (default 20 seconds) instead of a fixed value below the backend's
observed response time. A backend that answers within the configured timeout SHALL be treated as
reachable, regardless of how close its latency is to a previously hardcoded, shorter timeout.

The rationale is diagnostic correctness: a client-side probe timeout set below a slow-but-healthy
backend's real latency reports that backend as unreachable, which is indistinguishable from an
actually-down backend and causes the wrapper to abort before the DB/index step runs.

#### Scenario: Wrapper proceeds past the probe for a slow-but-healthy backend

- **GIVEN** the embedding backend answers `POST /v1/embeddings` with HTTP 200 after a delay
  longer than 3 seconds but within `OPENSPEC_EMBED_PROBE_TIMEOUT`
- **WHEN** `scripts/openspec-embed-local.sh <slug>` runs against that backend
- **THEN** the wrapper does not emit `kein Embedding-Backend erreichbar`
- **AND** execution reaches the next stage (DB URL resolution / embed invocation)

#### Scenario: A backend that never answers is still reported unreachable

- **GIVEN** the embedding backend does not answer within `OPENSPEC_EMBED_PROBE_TIMEOUT`
- **WHEN** `scripts/openspec-embed-local.sh <slug>` runs against that backend
- **THEN** the wrapper emits `kein Embedding-Backend erreichbar` and exits 1

<!-- merged from change delta openspec-pgvector.md (4748ae7eb37a) -->

### Requirement: Bundled context retrieval CLI

The system SHALL provide a Node.js ESM script `scripts/context-retrieve.mjs` that accepts a task
prompt (`--task-prompt <text>` or `-` for stdin), a role (`--role`), a token budget
(`--budget`, default 4000) and an optional corpus whitelist (`--corpora`), and emits a single
markdown context block on stdout. The script SHALL perform exactly one embedding call for the
query and at most one rerank batch per invocation, pulling at most 40 candidates from
`knowledge.chunks` before reranking. Role, domain and status SHALL be applied as metadata
predicates in the SQL query, never appended to the query text.

#### Scenario: One invocation produces one embed and one rerank call

- **GIVEN** `bge-mcp` is reachable and `knowledge.chunks` contains indexed `specs_plans` chunks
- **WHEN** `scripts/context-retrieve.mjs --task-prompt "<task>" --role bachelorprojekt-infra --json` runs
- **THEN** the JSON output reports exactly one embedding call and at most one rerank call
- **AND** the reported candidate count is at most 40
- **AND** the selected chunks stay within the token budget

### Requirement: Provenance marker on every emitted block

Every block emitted by `scripts/context-retrieve.mjs` SHALL begin with a machine-readable
comment carrying `mode` (`retrieval`, `rulefilter` or `truncated`), the corpora consulted, the
candidate and selected counts, the token budget usage and the pinned count. When `mode` is not
`retrieval`, the block SHALL additionally contain a plain-language sentence inside the block body
stating that the context is incomplete and that absent information must not be read as evidence
of non-existence.

#### Scenario: Degraded mode carries a plain-language warning

- **GIVEN** the embedding backend is unreachable
- **WHEN** `scripts/context-retrieve.mjs --task-prompt "<task>" --role bachelorprojekt-infra` runs
- **THEN** the exit status is 0
- **AND** the block header reports `mode=rulefilter`
- **AND** the block body contains a plain-language sentence marking the context as incomplete

#### Scenario: Zero candidates still produce a marked block

- **GIVEN** the metadata predicates match no chunk at all
- **WHEN** the script runs
- **THEN** stdout is not empty
- **AND** the emitted block carries a header and the incompleteness sentence

### Requirement: Pinned guardrails outside the token budget

The system SHALL always inject guardrail chunks — entries from
`docs/agent-guide/registry/guardrails.yaml` plus the role's `tier: caution|danger` entries from
`docs/agent-guide/registry/capabilities.yaml` — before retrieval and without charging them
against the `--budget` value. When the budget is smaller than the pinned set, the pinned set
SHALL still be emitted in full and `mode` SHALL be `truncated`.

#### Scenario: Guardrails survive a zero budget

- **GIVEN** the role `bachelorprojekt-infra` has guardrail entries in the registry
- **WHEN** `scripts/context-retrieve.mjs --task-prompt "<task>" --role bachelorprojekt-infra --budget 0` runs
- **THEN** the guardrail content is present in the output
- **AND** the block header reports `mode=truncated`

### Requirement: Retrieval quality is guarded by a golden query set

The repository SHALL contain a golden query set of at least ten real task prompts, each paired
with at least one chunk that MUST appear in the retrieval result, and a test that asserts recall
against it. The test SHALL verify command output rather than script internals.

#### Scenario: A ranking regression fails the recall assertion

- **GIVEN** the golden query set and a populated `specs_plans` collection
- **WHEN** the recall test runs against `scripts/context-retrieve.mjs`
- **THEN** every required chunk appears in the corresponding retrieval result
- **AND** the assertion reads the command output, not the source of the script

### Requirement: HNSW index on knowledge.chunks is restored and verified

The system SHALL restore the `chunks_embedding_hnsw` index on `knowledge.chunks.embedding`
(`vector_cosine_ops`) via a migration, reconciling the database with the guarantee stated in this
spec since `migrations/20260717-drop-unused-indexes.sql` dropped it. A test SHALL assert the
index exists by querying `pg_indexes`, not by reading the migration file.

#### Scenario: The index exists in the database

- **GIVEN** the migrations have been applied
- **WHEN** `pg_indexes` is queried for schema `knowledge` and table `chunks`
- **THEN** an index named `chunks_embedding_hnsw` is returned

<!-- merged from change delta openspec-pgvector.md (906d47edd227) -->