# sdlc-isolation

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu sdlc-isolation ergänzen._

## Requirements

### Requirement: SDLC stack runs in the fleet dev namespace from the production manifests

The SDLC stack of record — SDLC console, the dev PostgreSQL holding `tickets.*`, and the factory
runner — SHALL run in the namespace `workspace-dev` of the `fleet` cluster, rendered from the same
Kustomize base as production via the dev overlay (`k3d/dev-stack/`). A development instance MAY
run on the `devmesh` cluster; it SHALL NOT replace the stack of record. No `k3d-*` kubeconfig
context SHALL be required by any SDLC task.

#### Scenario: SDLC console is served from the fleet dev namespace

- **GIVEN** the dev stack is deployed to `workspace-dev` on the `fleet` cluster
- **WHEN** a request addresses the SDLC console of record
- **THEN** the response is served by a pod in `workspace-dev`, backed by the dev PostgreSQL in
  the same namespace

#### Scenario: No k3d context is required

- **GIVEN** a developer client whose kubeconfig lists `fleet` and `devmesh` and no `k3d-*` context
- **WHEN** the SDLC tasks run
- **THEN** none of them fails for lack of a `k3d-*` context

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

<!-- merged from change delta sdlc-isolation.md (10f30fe4bee3) -->

### Requirement: SDLC code resides in dedicated directories

All code that exclusively serves the software development lifecycle SHALL live under
`components/website/src/pages/sdlc/`, `components/website/src/lib/sdlc/` and `components/website/src/components/sdlc/`.
Modules used by both the SDLC surface and the business surface SHALL remain in their current
location and SHALL NOT be duplicated.

#### Scenario: SDLC page lives under the sdlc directory

- **GIVEN** the factory floor page, previously at `components/website/src/pages/admin/cockpit.astro`
- **WHEN** the repository is inspected after the split
- **THEN** the file is located under `components/website/src/pages/sdlc/` and no SDLC-only page remains
  under `components/website/src/pages/admin/`

#### Scenario: Shared module stays in place

- **GIVEN** `components/website/src/lib/auth.ts`, which is imported by both SDLC and business pages
- **WHEN** the split is applied
- **THEN** the module remains at `components/website/src/lib/auth.ts` and is not copied into
  `components/website/src/lib/sdlc/`

---

### Requirement: SDLC-only changes do not trigger the production website build

The production website build workflow SHALL NOT run when a push to `main` changes only files
under the SDLC directories.

#### Scenario: Commit touching only SDLC files

- **GIVEN** a push to `main` whose changed-file set lies entirely under `components/website/src/**/sdlc/**`
- **WHEN** GitHub evaluates the `paths` filter of `.github/workflows/build-website.yml`
- **THEN** the workflow is not triggered and no production website image is built

#### Scenario: Commit touching a shared module

- **GIVEN** a push to `main` that changes `components/website/src/lib/auth.ts`
- **WHEN** GitHub evaluates the `paths` filter
- **THEN** the workflow IS triggered, because the module is shared by both surfaces

---

### Requirement: Build target determines which routes are compiled

The Astro build SHALL read a `BUILD_TARGET` environment variable with the values `prod` or
`sdlc` and SHALL remove the routes of the other surface from the route manifest before building,
via the `astro:routes:resolved` integration hook.

#### Scenario: Production build excludes SDLC routes

- **GIVEN** `BUILD_TARGET=prod`
- **WHEN** the Astro build resolves its routes
- **THEN** no route whose component path lies under an `sdlc/` directory is present in the
  resulting manifest

#### Scenario: SDLC build excludes business routes

- **GIVEN** `BUILD_TARGET=sdlc`
- **WHEN** the Astro build resolves its routes
- **THEN** the manifest contains the SDLC routes and the shared infrastructure routes, and no
  business-only route such as `/admin/rechnungen`

#### Scenario: Unset build target keeps every route

- **GIVEN** `BUILD_TARGET` is not set (local development)
- **WHEN** the Astro build resolves its routes
- **THEN** all routes remain in the manifest, so local development is unaffected

---

### Requirement: Legacy admin URLs redirect to their SDLC equivalent

While SDLC routes are still present in the production image, requests to the previous
`/admin/<page>` URL of a moved page SHALL be answered with a permanent redirect to
`/sdlc/<page>`.

#### Scenario: Bookmark to the old cockpit URL

- **GIVEN** a request to `/admin/cockpit`
- **WHEN** the redirect map is consulted
- **THEN** the response is a 301 to `/sdlc/cockpit`

#### Scenario: Business admin page is untouched

- **GIVEN** a request to `/admin/rechnungen`, which did not move
- **WHEN** the redirect map is consulted
- **THEN** no redirect is applied and the page is served normally

<!-- merged from change delta sdlc-isolation.md (402a1509cfa1) -->

### Requirement: The fleet ticket-id sequence occupies a separate number range

While the fleet copy of `tickets.tickets` remains writable, its
`tickets.external_id_seq` SHALL sit in a number range disjoint from the local database's,
starting at 900000. `migrate-tickets.sh split-sequence` SHALL establish that state.

Both databases assign `external_id` through the same BEFORE-INSERT trigger, each drawing
from its own sequence. Overlapping ranges therefore hand out the same T-number twice —
observed in T002731. The permission-based fix (freeze) is unavailable until T002722
resolves the shared use of `tickets.tickets` by the customer portal.

#### Scenario: Establishing the split on a fleet sequence below the boundary

- **GIVEN** fleet's `tickets.external_id_seq` reads below 900000
- **WHEN** `bash scripts/sdlc/migrate-tickets.sh split-sequence` runs
- **THEN** the command exits 0
- **AND** the next `external_id` fleet assigns matches `^T9[0-9]{5}$`
- **AND** the command reports the previous and the new value

#### Scenario: Running the command when the split already holds

- **GIVEN** fleet's sequence already reads at or above 900000
- **WHEN** the command runs again
- **THEN** it exits 0 and leaves the sequence untouched
- **AND** it reports that no change was needed

#### Scenario: A dump-and-restore cycle reverts the sequence

- **GIVEN** a fleet dump taken before the split is restored
- **WHEN** `migrate-tickets.sh restore` completes
- **THEN** the split is re-established before the command returns
- **AND** the restore output states that it did so

### Requirement: The status command surfaces the sequence split

`migrate-tickets.sh status` SHALL report both databases' `external_id_seq` values and
SHALL state explicitly whether the split currently holds.

A silently reverted split is indistinguishable from a healthy one until the next
collision. Naming the state is what makes the regression visible.

#### Scenario: Reading status while the split holds

- **WHEN** `bash scripts/sdlc/migrate-tickets.sh status` runs
- **THEN** its output contains both sequence values
- **AND** it states that the split is in effect

#### Scenario: Reading status after the split was lost

- **GIVEN** fleet's sequence reads below 900000
- **WHEN** the status command runs
- **THEN** its output names the split as absent and points at `split-sequence`

<!-- merged from change delta sdlc-isolation.md (fa9e1e5444d8) -->

### Requirement: Single Entry Point for the Local SDLC Stack

`task sdlc:up` SHALL be the single entry point for the local SDLC stack. It SHALL check that the
`devmesh` cluster is reachable, that the SDLC deployments of the development instance are rolled
out, start the llm-proxy and the default chat loadout, and then run the health gate. It SHALL NOT
create or delete a cluster. It SHALL exit 0 only after the health gate reports every component
ready, including the chat loadout.

#### Scenario: Cold start brings the stack up

- **GIVEN** a reachable devmesh cluster with the development instance deployed and a stopped llm-proxy
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the llm-proxy and the default chat loadout are started and the health gate runs
- **AND** the command exits 0 only after every component is ready
- **AND** no cluster is created

### Requirement: The `dev:` Task Namespace Stays Reserved for the Staging Stack

The task namespace `dev:` SHALL continue to address the persistent staging stack defined in
`taskfiles/Taskfile.dev-stack.yml`. Tasks that operate on the local SDLC stack SHALL NOT be
added under the `dev:` prefix; tasks that operate on the devmesh cluster SHALL use the `devmesh:`
prefix.

Rationale: ein `dev:up`, das den lokalen SDLC-Stack startet, stünde direkt neben `dev:deploy`,
das den Staging-Stack aufspielt — gleiches Präfix, zwei verschiedene Systeme.

#### Scenario: No SDLC entry point under the staging prefix

- **GIVEN** the task definitions in `taskfiles/`
- **WHEN** the task list is inspected
- **THEN** no task named `dev:up` or `dev:down` exists
- **AND** the SDLC entry points are reachable as `sdlc:up` and `sdlc:down`
- **AND** devmesh cluster tasks are reachable under `devmesh:`

### Requirement: Health Gate Reports Diagnosable Failure

| | Before | After |
|---|---|---|
| llm-proxy check | `/livez` only (liveness: process answering) | `/livez` **plus** `GET /health` readiness poll (ready only when a priority-1 backend group is healthy) **plus** `GET /admin/loadouts/status` (configured chat loadout running + healthy) |
| Failure naming | names the component and observed state | unchanged — readiness failures additionally name the `degraded` backends from the `/health` response |

#### Scenario: A partially started stack is not reported as success

| | Before | After |
|---|---|---|
| Case | one of the checked components is not ready | additionally: proxy answers `/livez` but `/health` returns 503 (`ready: false`) or the chat loadout is not `running`+`healthy` |
| Result | gate exits non-zero | gate exits non-zero and names `llm-proxy` / the loadout slug |

### Requirement: The Astro Dev Server Is a Separate, Blocking Task

The Astro dev server SHALL be started by its own task `sdlc:dev` with `BUILD_TARGET=sdlc`, and
SHALL NOT be started by `sdlc:up`.

Rationale: der Devserver blockiert das Terminal bis zum Abbruch. In `sdlc:up` aufgenommen,
terminierte dieser nie und verlöre damit seinen Exit-Status als Erfolgssignal.

#### Scenario: Startup terminates

- **GIVEN** a cold machine
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command returns control to the shell instead of blocking

#### Scenario: Dev server task carries the SDLC build target

- **GIVEN** the task `sdlc:dev`
- **WHEN** it is invoked
- **THEN** it runs the Astro dev server with `BUILD_TARGET=sdlc`

<!-- merged from change delta sdlc-isolation.md (4e383e18c012) -->

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

### Requirement: Remote access to the SDLC surface only through the tailnet, without an inbound port

The SDLC surface SHALL be reachable from the home network and from developer clients that are
members of the tailnet with the tag `tag:devclient`. There SHALL be no publicly reachable
endpoint for the SDLC surface and no port forwarded from the internet into the home network;
every tailnet connection SHALL be established outbound.

#### Scenario: SDLC is home-only for devices outside the tailnet

- **GIVEN** a user outside the home network whose device is not a tailnet member
- **WHEN** they try to reach the SDLC cockpit
- **THEN** no publicly reachable endpoint answers and no tunnel forwards the request

#### Scenario: Tailnet client outside the home network

- **GIVEN** a developer client outside the home network that is a tailnet member with `tag:devclient`
- **WHEN** it requests the SDLC cockpit
- **THEN** the request is served through the tailnet

#### Scenario: Home router forwards no port

- **GIVEN** the home router configuration
- **WHEN** its port forwards are listed
- **THEN** no forward targets a devmesh server

### Requirement: Two build targets from one codebase

The Astro application SHALL support two build targets, `prod` and `sdlc`, from a single
codebase. SDLC code SHALL live under `components/website/src/pages/sdlc/`, `components/website/src/lib/sdlc/` and
`components/website/src/components/sdlc/`; the production build SHALL NOT contain SDLC routes and SHALL
NOT be triggered by commits touching only SDLC directories.

#### Scenario: Production image excludes SDLC routes

- **GIVEN** `BUILD_TARGET=prod`
- **WHEN** the website image is built
- **THEN** the resulting image contains no SDLC route

#### Scenario: SDLC-only commit does not trigger the production build

- **GIVEN** a push whose changed files lie entirely under `components/website/src/**/sdlc/**`
- **WHEN** GitHub evaluates the `paths` filter of `.github/workflows/build-website.yml`
- **THEN** the production website build is not triggered

---

### Requirement: Mixed runtime — cluster pods for stateful services, native processes for GPU

Stateful SDLC components (SDLC console, the dev PostgreSQL holding `tickets.*`, the factory
runner) SHALL run as pods — the stack of record in `workspace-dev` on `fleet`, the development
instance on `devmesh` — using the same Kustomize base as production. They SHALL NOT be placed in
a k3d cluster.

GPU-bound processes (llama.cpp, Ollama, ComfyUI, Unsloth training) SHALL run natively on the
Dev-Host without container indirection. Their availability SHALL be optional from the clusters'
point of view: a consumer that cannot reach a GPU-bound process SHALL degrade to its configured
escalation chain or fail explicitly, rather than block.

#### Scenario: The SDLC console is provided by a cluster pod

- **GIVEN** the dev stack is deployed to `workspace-dev`
- **WHEN** the SDLC console is requested
- **THEN** it is served by a pod in `workspace-dev`, backed by the dev PostgreSQL in that
  namespace

#### Scenario: GPU processes run natively

- **GIVEN** the Dev-Host
- **WHEN** llama.cpp or an Unsloth training run is started
- **THEN** it runs as a native process and not inside a container

#### Scenario: A powered-down Dev-Host does not stall the clusters

- **GIVEN** the Dev-Host is switched off, so no GPU-bound process answers
- **WHEN** a cluster-side consumer requests a completion
- **THEN** it falls back to its configured escalation chain or returns an explicit error, and
  does not hang

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

<!-- merged from change delta sdlc-isolation.md (dff6908ef21e) -->

### Requirement: sdlc:up starts the local chat loadout before the health gate

`sdlc:up` SHALL start the configured local chat loadout after the llm-proxy
is running and before the health gate runs. The loadout SHALL be selected via
the environment variable `SDLC_LLM_LOADOUT`, defaulting to
`gemma26-throughput`. Starting SHALL be idempotent: a loadout that is already
running and healthy SHALL NOT be restarted. A loadout belonging to an
`exclusiveGroup` that another running loadout occupies SHALL fail with a
non-zero exit status and name the conflicting loadout, SHALL NOT stop the
conflicting loadout, and SHALL NOT be auto-started by the health gate.

Rationale: without an explicit start, the proxy only auto-starts loadouts on
the first matching request (T002336/T002616); a freshly started stack would
answer 404/503 until that first request. All chat loadouts share
`exclusiveGroup: chat-gpu` — at most one can run, so exactly one configurable
default is started, not every loadout.

#### Scenario: Stopped loadout is started and reported healthy

- **GIVEN** the llm-proxy is running and the configured chat loadout is stopped
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the loadout is started via the proxy admin API
- **AND** the health gate reports it as `running` and `healthy`
- **AND** the command exits 0 only after the loadout is healthy

#### Scenario: Repeated invocation is idempotent

- **GIVEN** the configured chat loadout is already running and healthy
- **WHEN** the operator runs `task sdlc:up` a second time
- **THEN** the loadout is not restarted and the command exits 0

#### Scenario: Conflicting exclusiveGroup loadout is named, not stopped

- **GIVEN** another loadout of the same `exclusiveGroup` (e.g. `chat-gpu`) is running
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command exits non-zero and names the conflicting loadout
- **AND** the conflicting loadout keeps running

### Requirement: sdlc:down stops the chat loadout before the proxy

`sdlc:down` SHALL stop the configured chat loadout before stopping the llm-proxy. Stopping SHALL
be best-effort: if the proxy is already unreachable or the loadout is not running, the shutdown
SHALL still complete successfully. `sdlc:down` SHALL NOT delete or stop the devmesh cluster.

Rationale: loadout units are managed via `systemd-run` and outlive the proxy process; stopping
the proxy first would strand the llama-server on its port. The devmesh cluster is shared and
persistent.

#### Scenario: Shutdown stops the loadout before the proxy

- **GIVEN** the SDLC stack is running with the chat loadout healthy
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the loadout is stopped before the llm-proxy is stopped
- **AND** the devmesh cluster keeps running

#### Scenario: Shutdown tolerates an already-stopped loadout

- **GIVEN** the SDLC stack is running but the chat loadout is already stopped
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the shutdown completes without error

<!-- merged from change delta sdlc-isolation.md (5cf0fbb99a31) -->