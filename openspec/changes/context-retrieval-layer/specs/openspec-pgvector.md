## ADDED Requirements

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
