## MODIFIED Requirements

### Requirement: bge reaches the proxy through role-based routes

The proxy SHALL serve `POST /v1/embeddings` and `POST /v1/rerank` by resolving the **request
path** to a role (`embed`, `rerank`) and forwarding to that role's configured upstream chain.
Resolution SHALL NOT go through the chat model resolution, and the served models SHALL NOT appear
in `GET /v1/models`.

Keeping the two resolutions apart is the point of the requirement, not an implementation detail:
if embedding models entered `/v1/models`, a client that picks the first listed model could send a
chat completion to `bge-m3` — the failure class T003203 exists to remove.

Each role's chain SHALL be derived from the backend registry `tickets.llm_proxy_backends`: a row
whose `roles` column contains the role name is a member of that role's chain, and the chain order
SHALL be `priority` ascending. A row carrying a non-null `loadout_slug` SHALL yield a loadout
entry; every other row SHALL yield an absolute-URL entry built from `base_url`. Rows with
`enabled = false` SHALL NOT appear in any chain.

The registry SHALL supply chain **membership and order only**. The health state maintained by
`discovery.mjs` SHALL NOT influence bge chain construction or upstream selection, so that the
request-driven failover requirement below is not silently converted into a probe-driven one.

When the registry cannot be resolved, the proxy SHALL fall back to the `roles` block in
`scripts/llm/loadouts.json` and SHALL log one line naming the reason. Embedding and reranking
serve local processes and SHALL remain available while the cluster database is unreachable.

#### Scenario: An embedding request reaches a role upstream

- **GIVEN** the `embed` role declares a chain whose first entry answers
- **WHEN** a client sends `POST /v1/embeddings` to the proxy
- **THEN** the proxy answers `200` with the upstream body
- **AND** the response carries `x-llm-proxy-bge-upstream` naming the entry that served it

#### Scenario: Embedding models stay out of the chat model list

- **GIVEN** both bge roles are configured and reachable
- **WHEN** a client requests `GET /v1/models`
- **THEN** the response contains no bge model id

#### Scenario: Chain order follows registry priority

- **GIVEN** three enabled registry rows carry the role `rerank` with priorities 1, 2 and 3
- **WHEN** the proxy builds the `rerank` chain
- **THEN** the chain lists the three entries in ascending priority order
- **AND** a fourth row with `enabled = false` carrying the same role is absent from the chain

#### Scenario: A disabled registry row leaves the chain

- **GIVEN** a backend carrying the role `embed` is set to `enabled = false`
- **WHEN** the registry poll next refreshes
- **THEN** the `embed` chain no longer contains that backend

#### Scenario: The chain survives an unreachable registry

- **GIVEN** the backend registry cannot be resolved because no `shared-db` pod is reachable
- **WHEN** a client sends `POST /v1/embeddings` to the proxy
- **THEN** the chain is built from the `roles` block in `scripts/llm/loadouts.json`
- **AND** the proxy has logged one line naming the registry failure as the reason

#### Scenario: bge routing does not consult the health probe

- **GIVEN** the proxy source is inspected
- **WHEN** the import graph of `scripts/llm-proxy/bge-routes.mjs` is resolved
- **THEN** it does not reach `scripts/llm-proxy/discovery.mjs`

### Requirement: The bge chain is ordered desktop first, portable devices last

Each role's chain SHALL be ordered so that the always-powered desktop backend comes first, the
cluster forward second, and battery-powered devices (PK-L-1, PK-Tablet) last. This replaces the
E2/E3 topology decision of T006143, which ordered portable GPU devices first.

The earlier order was decided while the desktop CPU was occupied by llama.cpp chat loadouts. Since
the FreeToken cutover (T014028) the chat path runs with `--moe-cpu-layers 0` and computes nothing
on the CPU, so the desktop is the least contended host for encoder work — bge-m3 is a 568M-parameter
XLM-RoBERTa encoder whose forward pass is GEMM-bound and scales with cores.

Ordering portable devices last also bounds the cost of a sleeping device without introducing a
health probe: a suspended laptop on WireGuard does not refuse the connection, it stays silent for
the full `ROLE_TIMEOUT_MS`. Placed last, it is only reached once every always-on entry has already
failed, which is when paying that timeout is justified.

#### Scenario: A suspended portable device does not delay a served request

- **GIVEN** PK-Tablet is suspended and the desktop `rerank` backend answers
- **WHEN** a client sends `POST /v1/rerank`
- **THEN** the desktop entry serves the request
- **AND** the suspended device is never contacted

## ADDED Requirements

### Requirement: An embed backend is admitted only after passing the equivalence gate

A backend SHALL NOT carry the role `embed` in the registry unless it has passed
`scripts/llm/measure-embedding-equivalence.mjs` against the reference entry with a mean cosine
similarity of at least 0.99, and SHALL produce 1024-dimensional vectors.

Admission has to be gated because the failure is silent. A backend using a different pooling
convention — mean pooling where bge-m3 uses CLS plus L2 normalisation — returns plausible vectors
in a different space. Retrieval quality then degrades depending on which chain entry happened to
answer, and a fallback that engages during indexing leaves the index permanently mixed. The
dimension is fixed at 1024 because `scripts/index-repo.ts` and
`components/website/src/lib/embeddings.ts` are built against it.

#### Scenario: A non-equivalent backend is rejected from the embed role

- **GIVEN** a candidate embedding backend whose mean cosine similarity against the reference is
  below 0.99
- **WHEN** the admission check runs for the role `embed`
- **THEN** the check fails and names the measured mean
- **AND** the backend is not enabled for the role

#### Scenario: A backend with the wrong vector dimension is rejected

- **GIVEN** a candidate embedding backend returning vectors of a dimension other than 1024
- **WHEN** the admission check runs for the role `embed`
- **THEN** the check fails and names the measured dimension
