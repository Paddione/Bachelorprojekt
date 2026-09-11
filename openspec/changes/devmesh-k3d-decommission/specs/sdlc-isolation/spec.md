## RENAMED Requirements

### Requirement: Local k3d cluster runs the SDLC stack from the production manifests

**Renamed-to:** SDLC stack runs in the fleet dev namespace from the production manifests

### Requirement: Mixed runtime — local k3d for stateful services, native processes for GPU

**Renamed-to:** Mixed runtime — cluster pods for stateful services, native processes for GPU

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Kubelet serving certificate drift detection on the local k3d dev cluster

The drift is specific to Docker-assigned k3d node IPs; devmesh nodes use fixed LAN addresses.

### Requirement: Repairing a stale kubelet serving certificate

Removed together with the drift check; the node containers it restarted no longer exist.

### Requirement: Translating the misleading x509 error in the ticket tooling

The hint pointed at the removed certificate check command.

### Requirement: Health gate covers kubelet reachability, not only API-server reachability

The certificate check it invoked is removed; the devmesh health gate covers node readiness.
