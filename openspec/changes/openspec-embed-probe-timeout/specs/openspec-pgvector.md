## ADDED Requirements

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
