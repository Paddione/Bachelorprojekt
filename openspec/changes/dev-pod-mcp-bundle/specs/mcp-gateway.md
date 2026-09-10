## ADDED Requirements

### Requirement: MCP servers are served from a single in-cluster deployment

The MCP servers SHALL be served by one `dev-pod` Deployment in namespace `workspace-dev`,
delivered through the Flux GitOps pipeline. The deployment SHALL carry three containers:
`mcp-node` (the Node.js servers under a supervisor), `mcp-kubernetes` (the upstream Go binary)
and `repo-sync` (the checkout sidecar).

#### Scenario: Deployment is reachable through the Flux pipeline

- **GIVEN** the `dev-pod` manifest lives under an overlay referenced by a Flux Kustomization
- **WHEN** the overlay is rendered
- **THEN** the deployment appears in the rendered output, so that it does not depend on a manual
  `kubectl apply`

#### Scenario: Playwright is not part of the bundle

- **GIVEN** the `playwright` MCP server carries a 4 GiB memory limit while every other server
  stays below 512 MiB
- **WHEN** the `dev-pod` containers are declared
- **THEN** `playwright` is absent from them and remains a local stdio server, so that a browser
  leak cannot restart the other MCP servers

### Requirement: No MCP endpoint is exposed publicly

The MCP endpoints SHALL be reachable over the WireGuard mesh only. No Ingress, IngressRoute or
LoadBalancer Service SHALL expose them.

#### Scenario: An Ingress would bypass authentication

- **GIVEN** `oauth2-proxy-dev` carries `--skip-auth-route` for the MCP path prefixes
- **WHEN** an MCP endpoint is published through an Ingress
- **THEN** the endpoint answers without authentication, which is why the deployment declares no
  Ingress for these paths

### Requirement: The repository checkout is supplied read-only from a single writer

Four MCP servers read the repository tree. A `repo-sync` sidecar SHALL be the only container
that writes the checkout volume; every consuming container SHALL mount it read-only.

#### Scenario: A consumer cannot corrupt the shared checkout

- **GIVEN** several containers mount the same checkout volume
- **WHEN** the mounts are declared
- **THEN** only `repo-sync` mounts it writable

#### Scenario: The checkout survives a restart

- **GIVEN** the checkout lives on a PersistentVolumeClaim
- **WHEN** the pod restarts
- **THEN** the servers start against the existing checkout instead of waiting for a fresh clone,
  so that a restart does not depend on network reachability of the git remote

### Requirement: Container images carry their dependencies

Containers SHALL NOT install packages at runtime. Every binary a container needs SHALL be part
of its image.

#### Scenario: A package mirror outage cannot prevent startup

- **GIVEN** the previous `llm-proxy` container ran `apk add bash curl postgresql-client` on
  startup and failed against the package mirror
- **WHEN** the `dev-pod` containers start
- **THEN** they execute no package manager, so that mirror reachability is irrelevant to startup

### Requirement: The monolith guard keeps its subject after the manifest is gone

The guard in `tests/spec/mcp-gateway.bats` that checks the SSOT prose about the monolith is
conditioned on the presence of the monolith manifest. Once that manifest is removed, the guard
SHALL be retargeted rather than left to skip silently.

#### Scenario: Guard does not degrade into a no-op *(BATS)*

- **GIVEN** the guard body runs only when `k3d/default/claude-code-mcp-monolith-deploy.yaml` exists
- **WHEN** that manifest is removed by this change
- **THEN** the guard asserts against the `dev-pod` manifest instead, so that it keeps testing a
  live subject rather than passing by absence

## MODIFIED Requirements

### Requirement: MCP Monolith Deployment Reality In SSOT

The SSOT spec SHALL describe the actual deployment state of the MCP servers, so that planning
does not proceed against a state that never took effect. With the `dev-pod` deployment in place
and `k3d/default/claude-code-mcp-monolith-deploy.yaml` removed from the repository, the spec
SHALL describe the `dev-pod` as the serving deployment.

#### Scenario: Spec and repository agree on what serves MCP *(BATS)*

- **GIVEN** the monolith manifest is no longer part of the repository
- **WHEN** the spec is checked against the manifests that exist
- **THEN** it names the `dev-pod` deployment as the serving component and makes no claim about a
  manifest that is absent

#### Scenario: Apply-Weg des Deployments ist dokumentiert *(BATS)*

- **GIVEN** the `dev-pod` overlay is referenced by a Flux Kustomization
- **WHEN** the spec is checked for the delivery path of this manifest
- **THEN** it states that the resources go live through the Flux pipeline, not through a manual apply
