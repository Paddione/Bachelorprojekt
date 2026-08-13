# sdlc-isolation

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu sdlc-isolation ergänzen._

## Requirements

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

<!-- merged from change delta sdlc-isolation.md (10f30fe4bee3) -->

### Requirement: SDLC code resides in dedicated directories

All code that exclusively serves the software development lifecycle SHALL live under
`website/src/pages/sdlc/`, `website/src/lib/sdlc/` and `website/src/components/sdlc/`.
Modules used by both the SDLC surface and the business surface SHALL remain in their current
location and SHALL NOT be duplicated.

#### Scenario: SDLC page lives under the sdlc directory

- **GIVEN** the factory floor page, previously at `website/src/pages/admin/cockpit.astro`
- **WHEN** the repository is inspected after the split
- **THEN** the file is located under `website/src/pages/sdlc/` and no SDLC-only page remains
  under `website/src/pages/admin/`

#### Scenario: Shared module stays in place

- **GIVEN** `website/src/lib/auth.ts`, which is imported by both SDLC and business pages
- **WHEN** the split is applied
- **THEN** the module remains at `website/src/lib/auth.ts` and is not copied into
  `website/src/lib/sdlc/`

---

### Requirement: SDLC-only changes do not trigger the production website build

The production website build workflow SHALL NOT run when a push to `main` changes only files
under the SDLC directories.

#### Scenario: Commit touching only SDLC files

- **GIVEN** a push to `main` whose changed-file set lies entirely under `website/src/**/sdlc/**`
- **WHEN** GitHub evaluates the `paths` filter of `.github/workflows/build-website.yml`
- **THEN** the workflow is not triggered and no production website image is built

#### Scenario: Commit touching a shared module

- **GIVEN** a push to `main` that changes `website/src/lib/auth.ts`
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

#### Scenario: Cold start brings the stack up

| | Before | After |
|---|---|---|
| Steps | cluster → stack → llm-proxy → health gate | cluster → stack → llm-proxy → **default chat loadout** → health gate |
| Exit semantics | Exit 0 only after the health gate reports every component ready | unchanged — now including the chat loadout |

### Requirement: The `dev:` Task Namespace Stays Reserved for the Staging Stack

The task namespace `dev:` SHALL continue to address the persistent staging stack defined in
`taskfiles/Taskfile.dev-stack.yml`. Tasks that operate on the local SDLC stack SHALL NOT be
added under the `dev:` prefix.

Rationale: beide Stacks laufen im selben Cluster-Kontext `k3d-mentolder-dev`. Ein `dev:up`,
das den SDLC-Stack startet, stünde direkt neben `dev:deploy`, das den Staging-Stack aufspielt —
gleiches Präfix, zwei verschiedene Systeme, gleicher Kontext.

#### Scenario: No SDLC entry point under the staging prefix

- **GIVEN** the task definitions in `taskfiles/`
- **WHEN** the task list is inspected
- **THEN** no task named `dev:up` or `dev:down` exists
- **AND** the SDLC entry points are reachable as `sdlc:up` and `sdlc:down`

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

### Requirement: Kubelet serving certificate drift detection on the local k3d dev cluster

The system SHALL provide a read-only check that compares, for every node of the
local k3d dev cluster, the node's Kubernetes `InternalIP` against the IP entries
in the Subject Alternative Name of that node's kubelet serving certificate, and
SHALL report a mismatch as an actionable finding naming the node, both IPs and
the repair command.

The check SHALL distinguish a finding from a missing precondition by exit code:
`0` when every node matches, `1` when at least one node's certificate is stale,
and `2` when a required tool (`kubectl`, `docker`, `openssl`) is unavailable or
the cluster context cannot be reached.

The certificate SHALL be parsed on the host, because the k3s node container does
not ship an `openssl` binary.

#### Scenario: Node IP matches the certificate SAN

- **GIVEN** the node's `InternalIP` is contained in the certificate's SAN IP list
- **WHEN** the check runs
- **THEN** it exits `0` and reports the node as OK

#### Scenario: Docker IPs swapped and the certificate SAN is stale

- **GIVEN** the node's `InternalIP` is NOT contained in the certificate's SAN IP list
- **WHEN** the check runs
- **THEN** it exits `1`
- **AND** the output names the node, the current node IP, the SAN IP and the repair command

#### Scenario: Required tooling is unavailable

- **GIVEN** `openssl` is not present in `PATH`
- **WHEN** the check runs
- **THEN** it exits `2` rather than `1`, so a missing precondition is not reported as a finding

### Requirement: Repairing a stale kubelet serving certificate

The system SHALL offer a `--repair` mode that deletes the kubelet serving
certificate and key inside the affected node container, restarts that container,
and re-runs the check afterwards.

Repair SHALL NOT be triggered implicitly by any other command. Restarting a node
container as a side effect of an unrelated operation would disrupt every
concurrent session.

#### Scenario: Restart alone does not reissue the certificate

- **GIVEN** a node whose kubelet serving certificate carries a stale SAN
- **WHEN** the node container is restarted WITHOUT deleting the certificate files
- **THEN** the SAN remains stale and the check still exits `1`

#### Scenario: Deleting the certificate before the restart reissues it

- **GIVEN** a node whose kubelet serving certificate carries a stale SAN
- **WHEN** the repair mode deletes certificate and key and then restarts the container
- **THEN** the reissued certificate contains the node's current IP and the check exits `0`

### Requirement: Translating the misleading x509 error in the ticket tooling

The shared exec path used by the ticket tooling SHALL detect an x509 SAN
verification failure in the error output of `kubectl exec` and SHALL emit an
additional hint that names the kubelet as the affected component and states the
check command. The hint SHALL remain silent for unrelated errors.

The raw error names `psql` and the `shared-db` pod and therefore points at the
database rather than at the kubelet; without the hint the reader searches in the
wrong subsystem.

#### Scenario: x509 SAN failure is translated

- **GIVEN** `kubectl exec` fails with `tls: failed to verify certificate: x509: certificate is valid for …, not <node-ip>`
- **WHEN** the shared exec path handles the failure
- **THEN** an additional hint naming the kubelet and the check command is written to stderr

#### Scenario: Unrelated errors stay untouched

- **GIVEN** a plain SQL error such as a missing relation
- **WHEN** the shared exec path handles the failure
- **THEN** no kubelet hint is emitted

### Requirement: Health gate covers kubelet reachability, not only API-server reachability

The local stack health gate SHALL run the certificate check after its cluster
reachability check.

`kubectl get nodes` is served by the API server and stays green while every
`kubectl exec` fails, so API-server reachability alone does not establish that
the stack is usable.

#### Scenario: API server reachable but kubelet certificate stale

- **GIVEN** the cluster answers `kubectl get nodes`
- **AND** a node's kubelet serving certificate carries a stale SAN
- **WHEN** the health gate runs
- **THEN** it fails and names the certificate check as the failing component

<!-- merged from change delta sdlc-isolation.md (88141bdfbf61) -->

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

`sdlc:down` SHALL stop the configured chat loadout before stopping the
llm-proxy. Stopping SHALL be best-effort: if the proxy is already unreachable
or the loadout is not running, the shutdown SHALL still complete successfully.

Rationale: loadout units are managed via `systemd-run` and outlive the proxy
process; stopping the proxy first would strand the llama-server on its port.

#### Scenario: Shutdown stops the loadout before the proxy

- **GIVEN** the SDLC stack is running with the chat loadout healthy
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the loadout is stopped before the llm-proxy is stopped
- **AND** the cluster is deleted afterwards

#### Scenario: Shutdown tolerates an already-stopped loadout

- **GIVEN** the SDLC stack is running but the chat loadout is already stopped
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the shutdown completes without error

<!-- merged from change delta sdlc-isolation.md (e1ee564c40bd) -->