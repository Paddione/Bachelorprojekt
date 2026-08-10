## ADDED Requirements

### Requirement: Dev-only services run on the Dev-Host, customer-synchronous services stay on fleet

The SDLC surface SHALL be served exclusively from the local Dev-Host (WSL2/RTX 5070 Ti,
192.168.100.10): factory floor, cockpit, pipeline, tickets including their frontend,
observability/cluster monitoring, repo-health dashboard, technical component pages,
systemtest board, prompts, AI configuration and asset generation. Services that a customer
request needs synchronously SHALL remain on the fleet cluster. Non-development services
(customer website, billing, coaching, Nextcloud, Pocket ID, Vaultwarden) SHALL NOT be
relocated.

#### Scenario: Factory floor is reachable only from the Dev-Host

- **GIVEN** the SDLC surface is fully relocated
- **WHEN** a request addresses the factory floor
- **THEN** the response is served by a process on the Dev-Host, without any dependency on the
  fleet cluster

#### Scenario: Customer website stays on fleet

- **GIVEN** the topology split
- **WHEN** a customer requests the mentolder website
- **THEN** the request is served by the fleet cluster and does not depend on the Dev-Host

---

### Requirement: No remote cockpit and no tunnel into the home network

The SDLC surface SHALL be reachable only from the home network. There SHALL be no remote
cockpit and no tunnel that opens an inbound path from the internet into the home network.

#### Scenario: SDLC is home-only

- **GIVEN** a user outside the home network
- **WHEN** they try to reach the SDLC cockpit
- **THEN** no publicly reachable endpoint exists and no tunnel forwards the request

---

### Requirement: Two build targets from one codebase

The Astro application SHALL support two build targets, `prod` and `sdlc`, from a single
codebase. SDLC code SHALL live under `website/src/pages/sdlc/`, `website/src/lib/sdlc/` and
`website/src/components/sdlc/`; the production build SHALL NOT contain SDLC routes and SHALL
NOT be triggered by commits touching only SDLC directories.

#### Scenario: Production image excludes SDLC routes

- **GIVEN** `BUILD_TARGET=prod`
- **WHEN** the website image is built
- **THEN** the resulting image contains no SDLC route

#### Scenario: SDLC-only commit does not trigger the production build

- **GIVEN** a push whose changed files lie entirely under `website/src/**/sdlc/**`
- **WHEN** GitHub evaluates the `paths` filter of `.github/workflows/build-website.yml`
- **THEN** the production website build is not triggered

---

### Requirement: Mixed runtime — local k3d for stateful services, native processes for GPU

Stateful SDLC components (SDLC console, local PostgreSQL holding `tickets.*`, the second
bge-embed/bge-rerank pair) SHALL run in a local k3d cluster using the same Kustomize manifests
as production. GPU-bound processes (llama.cpp, Ollama, ComfyUI, Unsloth training) SHALL run
natively on the Dev-Host without container indirection.

#### Scenario: Local k3d provides the SDLC console

- **GIVEN** the local k3d cluster is running
- **WHEN** the SDLC console is requested
- **THEN** it is served by a pod in the local k3d cluster, backed by the local PostgreSQL

#### Scenario: GPU processes run natively

- **GIVEN** the Dev-Host
- **WHEN** llama.cpp or an Unsloth training run is started
- **THEN** it runs as a native process (WSL/Windows) and not inside a container

---

### Requirement: SDLC data is local-primary, CI events arrive via pull

The `tickets` schema SHALL be primary on the local PostgreSQL of the Dev-Host. CI events
(runs, PRs, checks) SHALL be fetched from GitHub by a local poller (pull model); GitHub SHALL
NOT reach into the Dev-Host. Customer bug reports submitted through the website SHALL reach
the local database through a defined write path.

#### Scenario: A factory tick runs without the Hetzner database

- **GIVEN** the local database is primary for `tickets.*`
- **WHEN** a factory tick runs while the Dev-Host is online
- **THEN** it completes without any connection to the Hetzner shared-db

#### Scenario: CI events are polled, not pushed

- **GIVEN** a CI run finishes on GitHub
- **WHEN** the local poller runs
- **THEN** the run, its PR and its checks are fetched via the GitHub API and written into the
  local database; no inbound connection from GitHub exists

---

### Requirement: Training has priority over factory inference

A training run SHALL set a lock file; while the lock is set, the llm-proxy SHALL mark local
backends as draining and the factory SHALL route to the API instead of failing. A running
training run SHALL never be interrupted by a factory tick. After training ends, the local
backends SHALL be released again.

#### Scenario: Factory tick during a training window

- **GIVEN** a training run holds the lock
- **WHEN** a factory tick requests model inference
- **THEN** the request is routed to the API and succeeds, and the training run is not
  interrupted

#### Scenario: Orphaned training lock

- **GIVEN** a training process crashed without releasing the lock
- **WHEN** the lock is detected as stale
- **THEN** the lock is reclaimed and the local backends return to service

---

### Requirement: Local authentication with fail-closed production fallback

The SDLC console SHALL authenticate locally, falling back to Pocket ID over the mesh when the
Pocket ID service is reachable. Two auth paths in one codebase SHALL be implemented
fail-closed, with a dedicated test proving that an auth failure denies access instead of
granting it.

#### Scenario: Mesh reachable

- **GIVEN** Pocket ID is reachable over the mesh
- **WHEN** a user signs in to the SDLC console
- **THEN** authentication succeeds through Pocket ID

#### Scenario: Auth failure denies access

- **GIVEN** neither local nor Pocket ID authentication is available
- **WHEN** a user attempts to sign in
- **THEN** access is denied (fail-closed) and no degraded-but-open session is created

---

### Requirement: Model registry captures four dimensions per trained adapter

Every trained adapter SHALL be registered with (1) suitability — a measurement series per
factory role against the eval harness; (2) stat requirements — VRAM per quantization, maximum
context length, throughput, load time; (3) provenance — base model, corpus, LoRA configuration,
commit; (4) usage instructions — chat template verified by the template guard, stop tokens,
sampling parameters, and a ready-to-use `loadouts.json` block.

#### Scenario: A freshly trained adapter is fully registered

- **GIVEN** a trained adapter passes the eval gate
- **WHEN** it is registered
- **THEN** the registry entry contains all four dimensions and the adapter can be entered into
  `loadouts.json` without further research
