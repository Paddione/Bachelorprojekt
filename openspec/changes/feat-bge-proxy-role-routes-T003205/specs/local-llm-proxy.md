## ADDED Requirements

### Requirement: bge reaches the proxy through role-based routes

The proxy SHALL serve `POST /v1/embeddings` and `POST /v1/rerank` by resolving the **request
path** to a role (`embed`, `rerank`) and forwarding to that role's configured upstream chain.
Resolution SHALL NOT go through the chat model resolution, and the served models SHALL NOT appear
in `GET /v1/models`.

Keeping the two resolutions apart is the point of the requirement, not an implementation detail:
if embedding models entered `/v1/models`, a client that picks the first listed model could send a
chat completion to `bge-m3` — the failure class T003203 exists to remove.

Each role's chain SHALL be configured in `scripts/llm/loadouts.json` under the top-level key
`roles`, where a chain entry is either a loadout reference (`loadout:<slug>`) or an absolute
upstream URL. The chain order SHALL be honoured as written; the shipped default puts the local
CPU loadout first and the cluster port-forward second.

#### Scenario: An embedding request reaches a role upstream

- **GIVEN** the `embed` role declares a chain whose first entry answers
- **WHEN** a client sends `POST /v1/embeddings` to the proxy
- **THEN** the proxy answers `200` with the upstream body
- **AND** the response carries `x-llm-proxy-bge-upstream` naming the entry that served it

#### Scenario: Embedding models stay out of the chat model list

- **GIVEN** both bge roles are configured and reachable
- **WHEN** a client requests `GET /v1/models`
- **THEN** the response contains no bge model id

### Requirement: bge failover is request-driven, not health-probe-driven

Upstream selection SHALL be decided by the outcome of the forwarded request itself, NOT by a
health probe. A probe is unsound here: on 2026-08-09 the cluster endpoint accepted the connection
and never answered for over 60 seconds while its `/health` kept returning `200`
(`scripts/bge-mcp/server.mjs:105-111`, T002838). A health endpoint answers "is the process
alive", not "can it serve my request".

The proxy SHALL advance to the next chain entry on a connection error, on a timeout, and on a
`5xx` response. It SHALL NOT advance on a `4xx` response — a client-side error SHALL be passed
through unchanged, because retrying it across the chain converts an immediate error into a
multi-timeout stall. When every entry has been tried, the proxy SHALL answer `503` with a body
that names a reason **per entry** rather than a single aggregate message.

The per-request timeout SHALL default to 30000 ms, matching `BGE_MCP_UPSTREAM_TIMEOUT_MS` in the
shim so the two deadlines do not race.

#### Scenario: A dead first entry falls through to the second

- **GIVEN** the first chain entry refuses connections and the second answers
- **WHEN** a role request arrives
- **THEN** the proxy answers `200` and `x-llm-proxy-bge-upstream` names the second entry

#### Scenario: A silent first entry falls through after the timeout

- **GIVEN** the first chain entry accepts the connection and never answers
- **WHEN** a role request arrives
- **THEN** the proxy advances to the next entry once the timeout elapses rather than blocking
  the caller indefinitely

#### Scenario: A client error is passed through without failover

- **GIVEN** the first chain entry answers `400`
- **WHEN** a role request arrives
- **THEN** the proxy returns `400` to the caller and does not contact any further entry

#### Scenario: An exhausted chain reports each entry

- **GIVEN** every entry of a role's chain fails
- **WHEN** a role request arrives
- **THEN** the proxy answers `503` and the body names a distinct reason per entry

### Requirement: A role's loadout entry starts on demand within a bounded budget

When a chain entry is a loadout reference and that loadout is not running, the proxy SHALL start
it and wait at most 20000 ms for readiness. The bound exists so that a start attempt plus the
cluster fallback together stay below the shim's 30000 ms deadline; without it the caller would
abort while the proxy was still failing over. If the start fails or the budget elapses, the entry
SHALL count as failed and the chain SHALL advance — a loadout that will not start MUST NOT
swallow the request.

The bge-CPU loadouts are eligible for this because they declare no `exclusiveGroup` and allocate
no VRAM; starting them cannot evict a chat loadout from the GPU.

#### Scenario: A stopped loadout entry is started and then serves

- **GIVEN** the first chain entry is a loadout reference and the loadout is stopped
- **WHEN** a role request arrives and the loadout becomes ready within the budget
- **THEN** the proxy forwards to it and `x-llm-proxy-bge-upstream` names that loadout

#### Scenario: A loadout that will not start does not swallow the request

- **GIVEN** the first chain entry is a loadout that fails to become ready within the budget
- **WHEN** a role request arrives and a later entry is reachable
- **THEN** the proxy answers from the later entry instead of failing the request

### Requirement: The gateway-consumer lint covers the bge surfaces

The static lint (`tests/spec/local-llm-proxy/gateway-consumer-lint.bats`) SHALL additionally track
`scripts/bge-mcp/bge-mcp.service` and `scripts/openspec-embed-local.sh`, and SHALL additionally
reject the bge backend ports `:8081`, `:8095` and `:8096` in those tracked surfaces. Comment lines
stay exempt, as with the existing literals, so retired configurations remain documentable.

`scripts/llm/loadouts.json` SHALL be exempt from this lint. Backend addresses belong there by
construction — it is the file that defines the chains — exactly as the registry seeds are already
exempt. Without the exemption the lint would forbid the configuration surface this change
introduces.

#### Scenario: A reintroduced direct backend port fails the lint

- **GIVEN** a tracked bge consumer surface carries a non-comment `:8081` literal
- **WHEN** the spec BATS suite runs
- **THEN** the lint fails and names that file

#### Scenario: The chain configuration itself does not trip the lint

- **GIVEN** `scripts/llm/loadouts.json` declares role chains containing `http://127.0.0.1:8081`
- **WHEN** the lint runs
- **THEN** it passes, because the configuration file is exempt by construction
