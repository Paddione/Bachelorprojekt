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

The repository SHALL provide a task `sdlc:up` that brings the local SDLC stack from a cold
machine to a verified running state in one invocation, and a task `sdlc:down` that shuts it
down again.

`sdlc:up` SHALL orchestrate the existing tasks rather than reimplement them, in the order
cluster → stack → llm-proxy → health gate, and SHALL terminate with a non-zero exit status if
any stage fails.

Rationale: die Einzelschritte existieren bereits; was fehlte, war die Reihenfolge und die
Verifikation. Ein `sdlc:up`, das seine Bausteine dupliziert, würde bei jeder Änderung an
`sdlc:deploy` auseinanderlaufen.

#### Scenario: Cold start brings the stack up

- **GIVEN** no k3d cluster `mentolder-dev` exists and the llm-proxy is not running
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the cluster is created, the SDLC stack is deployed, the llm-proxy is started
- **AND** the command exits 0 only after the health gate reports every component ready

#### Scenario: Repeated invocation is idempotent

- **GIVEN** the SDLC stack is already running and healthy
- **WHEN** the operator runs `task sdlc:up` a second time
- **THEN** the command does not fail on the already-existing cluster
- **AND** it exits 0 without recreating or restarting the cluster

#### Scenario: Shutdown reverses the startup order

- **GIVEN** the SDLC stack is running
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the llm-proxy is stopped before the cluster is deleted

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

`sdlc:up` SHALL verify readiness through a health gate that names the component that failed
and the observed state, rather than reporting a generic failure or reporting success on a
partially started stack.

The health gate SHALL check that the cluster context is reachable, that the deployments
`shared-db`, `pocket-id`, `sdlc-console`, `bge-embed` and `bge-rerank` are available, and that
the llm-proxy answers its status probe.

#### Scenario: A failed component is named

- **GIVEN** the cluster is up but the deployment `pocket-id` never becomes available
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command exits non-zero
- **AND** the output names `pocket-id` and its observed state

#### Scenario: A partially started stack is not reported as success

- **GIVEN** one of the checked components is not ready
- **WHEN** the health gate runs
- **THEN** it exits non-zero

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