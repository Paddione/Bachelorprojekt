## ADDED Requirements

### Requirement: Local k3d cluster runs the SDLC stack from the production manifests

The Dev-Host SHALL run a local k3d cluster named `mentolder-dev` (kubeconfig context
`k3d-mentolder-dev`) that serves the SDLC console, a local PostgreSQL, and a second
CPU-only bge-embed/bge-rerank pair. The stack SHALL be rendered from the same Kustomize
manifests as production via a self-contained overlay `k3d/sdlc-stack/` (no manifest copies),
built with `--load-restrictor=LoadRestrictionsNone`.

#### Scenario: SDLC console is served by the local k3d cluster

- **GIVEN** the local k3d cluster is running and the stack is deployed
- **WHEN** a request addresses `http://sdlc.localhost`
- **THEN** the response is served by a pod in the local k3d cluster, backed by the local
  PostgreSQL, and the endpoint answers with HTTP 200

#### Scenario: Second bge pair responds locally

- **GIVEN** the stack is deployed
- **WHEN** a health probe targets the `llm-gateway-embed` and `llm-gateway-rerank` services
- **THEN** both answer with HTTP 200, without any dependency on the fleet cluster

---

### Requirement: SDLC console runs the sdlc build target

The console deployment SHALL use the `ghcr.io/paddione/website-sdlc` image (built with
`BUILD_TARGET=sdlc`). Its health endpoint SHALL expose the build target so code drift and
deploy drift stay distinguishable.

#### Scenario: Health endpoint proves the sdlc target

- **GIVEN** the console pod is running
- **WHEN** `/api/health` is requested
- **THEN** the response identifies the `sdlc` build target

---

### Requirement: Local PostgreSQL bootstraps the tickets schema

The local PostgreSQL SHALL host the `website` database whose `tickets` schema bootstraps
itself on first use (idempotent schema init, no migration in this change). Production data
migration is out of scope for this change.

#### Scenario: Tickets schema exists after first console request

- **GIVEN** a fresh local PostgreSQL and a running console
- **WHEN** the console serves a schema-touching request
- **THEN** the `tickets` schema with its tables exists in the local `website` database
  (verified via `information_schema`)

---

### Requirement: Local authentication with fail-closed fallback over the mesh

The SDLC console SHALL authenticate against a local Pocket ID instance by default. When the
local instance is unreachable, the console SHALL fall back to the fleet Pocket ID over the
wireguard mesh. When neither provider is available, access SHALL be denied — a dedicated test
SHALL prove that an auth failure denies access instead of granting a degraded session.

#### Scenario: Local Pocket ID authenticates without the mesh

- **GIVEN** the local Pocket ID is running and the mesh is down
- **WHEN** a user signs in to the SDLC console
- **THEN** authentication succeeds through the local Pocket ID

#### Scenario: Mesh reachable falls back to fleet Pocket ID

- **GIVEN** the local Pocket ID is unreachable and the fleet Pocket ID is reachable over the mesh
- **WHEN** a user signs in to the SDLC console
- **THEN** authentication succeeds through the fleet Pocket ID

#### Scenario: Auth failure denies access (fail-closed)

- **GIVEN** neither the local nor the fleet Pocket ID is available
- **WHEN** a user attempts to sign in
- **THEN** access is denied and no degraded-but-open session is created; the dedicated
  fail-closed test passes

---

### Requirement: Dev-Host WSL memory verified for the local stack

The Dev-Host SHALL allocate at least 36 GB of RAM to WSL2 so that the local k3d cluster
(console, PostgreSQL, bge pair), parallel factory ticks and Unsloth training fit the WSL
memory budget. The effective allocation SHALL be measured and documented.

#### Scenario: WSL memory is sufficient

- **GIVEN** the Dev-Host
- **WHEN** the effective WSL memory is measured (`free -g`)
- **THEN** it is at least 36 GB and the measurement is documented in the stack runbook
