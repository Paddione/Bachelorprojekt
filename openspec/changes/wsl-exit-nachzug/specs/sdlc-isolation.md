## MODIFIED Requirements

### Requirement: Local k3d cluster runs the SDLC stack from the production manifests

The SDLC stack — SDLC console, the dev PostgreSQL holding `tickets.*`, and the factory runner —
SHALL run in the namespace `workspace-dev` of the `fleet` cluster, rendered from the same
Kustomize base as production via the dev overlay (`k3d/dev-stack/`). It SHALL NOT depend on a
local k3d cluster on the Dev-Host: no `k3d-*` kubeconfig context exists any more, and with the
WSL2 shutdown decided on 2026-09-03 none is expected to return.

Rationale: measured on 2026-09-03 against `2da8a9a94` —
`kubectl config get-contexts -o name` lists only `fleet` and `hetzner`;
`kubectl --context fleet get deploy,sts -n workspace-dev` shows `sdlc-console 1/1`,
`factory-runner 1/1` and `statefulset shared-db-dev 1/1`. The overlay name `k3d/dev-stack/`
survives as a path, not as a statement about a local cluster.

#### Scenario: SDLC console is served from the fleet dev namespace

- **GIVEN** the dev stack is deployed to `workspace-dev` on the `fleet` cluster
- **WHEN** a request addresses the SDLC console
- **THEN** the response is served by a pod in `workspace-dev`, backed by the dev PostgreSQL in
  the same namespace

#### Scenario: No local cluster is required

- **GIVEN** the Dev-Host runs Windows with WSL2 shut down and Docker Desktop uninstalled
- **WHEN** an operator lists kubeconfig contexts
- **THEN** no `k3d-*` context is present, and the SDLC stack is nonetheless reachable

### Requirement: Dev-only services run on the Dev-Host, customer-synchronous services stay on fleet

The SDLC surface SHALL be served exclusively from the SDLC dev namespace `workspace-dev` on the
`fleet` cluster: factory floor, cockpit, pipeline, tickets including their frontend,
observability/cluster monitoring, repo-health dashboard, technical component pages, systemtest
board, prompts, AI configuration and asset generation. It SHALL NOT be served from a process on
the local Dev-Host, and no SDLC surface SHALL require the Dev-Host to be powered on.

Services that a customer request needs synchronously SHALL remain in the brand namespaces of the
fleet cluster. Non-development services (customer website, billing, coaching, Nextcloud,
Pocket ID, Vaultwarden) SHALL NOT be relocated.

The separation this requirement enforces is therefore one of namespace and lifecycle
(`workspace-dev` versus the brand namespaces), no longer one of host. Access control for the
SDLC surface is governed by the separate requirement "No remote cockpit and no tunnel into the
home network" and is NOT changed here.

#### Scenario: Factory floor does not depend on the Dev-Host

- **GIVEN** the Dev-Host is powered down
- **WHEN** a request addresses the factory floor
- **THEN** the response is served by a pod in `workspace-dev` on the fleet cluster

#### Scenario: Customer website stays in the brand namespace

- **GIVEN** the topology split
- **WHEN** a customer requests the mentolder website
- **THEN** the request is served from the brand namespace and does not depend on `workspace-dev`

### Requirement: Mixed runtime — local k3d for stateful services, native processes for GPU

Stateful SDLC components (SDLC console, the dev PostgreSQL holding `tickets.*`, the factory
runner) SHALL run as pods in `workspace-dev` on the `fleet` cluster, using the same Kustomize
base as production. They SHALL NOT be placed in a local k3d cluster; the local k3d runtime is
retired together with WSL2 and Docker Desktop.

GPU-bound processes (llama.cpp, Ollama, ComfyUI, Unsloth training) SHALL run natively on the
Windows Dev-Host without container indirection and without a Linux virtual machine. Their
availability SHALL be optional from the cluster's point of view: a consumer that cannot reach a
GPU-bound process on the Dev-Host SHALL degrade to its configured escalation chain or fail
explicitly, rather than block.

#### Scenario: The SDLC console is provided by the fleet dev namespace

- **GIVEN** the dev stack is deployed to `workspace-dev`
- **WHEN** the SDLC console is requested
- **THEN** it is served by a pod in `workspace-dev`, backed by the dev PostgreSQL in that
  namespace

#### Scenario: GPU processes run natively on Windows

- **GIVEN** the Dev-Host
- **WHEN** llama.cpp or an Unsloth training run is started
- **THEN** it runs as a native Windows process — not inside a container and not inside WSL2

#### Scenario: A powered-down Dev-Host does not stall the cluster

- **GIVEN** the Dev-Host is switched off, so no GPU-bound process answers
- **WHEN** a cluster-side consumer requests a completion
- **THEN** it falls back to its configured escalation chain or returns an explicit error, and
  does not hang

## REMOVED Requirements

### Requirement: Dev-Host WSL memory verified for the local stack

**Reason:** The premise is gone. This requirement sized WSL2 memory for a local k3d cluster
(console, PostgreSQL, bge pair) plus parallel factory ticks. As of the operator decision on
2026-09-03, WSL2 is shut down and Docker Desktop is uninstalled; the local k3d cluster no longer
exists (`kubectl config get-contexts -o name` lists only `fleet` and `hetzner`, measured
2026-09-03 against `2da8a9a94`), and the stateful SDLC components run in `workspace-dev` on the
fleet cluster. A WSL memory budget can therefore neither be measured nor be a precondition for
anything.

**Migration:** None required. Host-side sizing for the remaining native GPU workloads
(llama.cpp, Ollama, ComfyUI, Unsloth) is a Windows-native concern and is covered by the GPU
scenarios of "Mixed runtime — local k3d for stateful services, native processes for GPU", not by
a WSL allocation.
