## ADDED Requirements

### Requirement: devmesh hosts the CPU-bound LLM and database services
<!-- bats: local-dev-mesh/llm-services.bats -->

The devmesh stack SHALL provide a `llm-services` component that runs the LLM proxy, the bge-mcp
shim and the mcp-postgres server in one Deployment built from the `mcp-node` image. The
component SHALL expose them through one Service on ports 18235, 13001 and 13005. The GPU-bound
backends SHALL stay on the Windows side of the dev workstation.

#### Scenario: The rendered stack contains the component

- **GIVEN** the devmesh stack is rendered with `scripts/devmesh/render-stack.sh`
- **WHEN** the output is inspected
- **THEN** it contains the `llm-services` Deployment and a Service exposing ports 18235, 13001
  and 13005

#### Scenario: Only the three services start in the component

- **GIVEN** the `llm-services` Deployment sets the supervisor service selection
- **WHEN** the `mcp-node` supervisor starts
- **THEN** it starts the LLM proxy, mcp-postgres and bge-mcp, and no other server

### Requirement: The GPU endpoint exposes one port per workstation GPU service
<!-- bats: local-dev-mesh/llm-services.bats -->

The `llm-gateway-host` Service SHALL declare one named port for every GPU service listed in
`gpu_endpoint.ports` of the devmesh inventory, and its EndpointSlice SHALL point all of them at
the tailnet address of the GPU workstation.

#### Scenario: Every inventory port is rendered

- **GIVEN** `gpu_endpoint.ports` lists the workstation GPU services
- **WHEN** the stack is rendered
- **THEN** the Service and the EndpointSlice carry one port per listed service

### Requirement: The devmesh backend registry contains no loopback URLs
<!-- bats: local-dev-mesh/llm-services.bats -->

The devmesh database SHALL hold its own `tickets.llm_proxy_backends` table, seeded by a
migration. No seeded `base_url` SHALL use a loopback address, because loopback inside the pod
does not reach the workstation or the cluster services.

#### Scenario: The seed migration is checked for loopback URLs

- **GIVEN** the devmesh registry seed migration
- **WHEN** its `base_url` values are inspected
- **THEN** none of them contains `127.0.0.1` or `localhost`
