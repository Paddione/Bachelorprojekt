## ADDED Requirements

### Requirement: devmesh hosts a development instance of the stack

The devmesh cluster SHALL run a development instance of the stack rendered from the `k3d/`
Kustomize base through `dev-local/core` or `dev-local/full`. The instance SHALL NOT be the SDLC
surface of record and SHALL NOT hold the ticket data of record; both stay on the `fleet` cluster.

#### Scenario: Profile core renders without the heavy services

- **GIVEN** the overlay `dev-local/core`
- **WHEN** `kustomize build dev-local/core` runs
- **THEN** it succeeds and the output contains no Nextcloud, Collabora or Talk workload

#### Scenario: Profile full adds the heavy services

- **GIVEN** the overlay `dev-local/full`
- **WHEN** `kustomize build dev-local/full` runs
- **THEN** it succeeds and the output contains the Nextcloud, Collabora and Talk workloads

### Requirement: The stack deploys from the working copy

`task devmesh:deploy` SHALL render the profile named by `DEVMESH_PROFILE` from the current
checkout, apply the sealed secrets before the manifests, and exit `0` only after every
deployment of the profile has rolled out. `ENV=dev` SHALL resolve to the kubeconfig context
`devmesh`.

#### Scenario: Deploy a branch state before merge

- **GIVEN** a checkout of a feature branch and a reachable devmesh cluster
- **WHEN** `task devmesh:deploy` runs
- **THEN** the manifests of that checkout are applied to devmesh
- **AND** the command exits 0 after all rollouts finished

#### Scenario: Environment resolution targets devmesh

- **GIVEN** `environments/dev.yaml`
- **WHEN** `scripts/env-resolve.sh dev` is sourced
- **THEN** `ENV_CONTEXT` is `devmesh`

### Requirement: Hostnames under devmesh.mentolder.de with a publicly trusted certificate

The devmesh ingress SHALL serve `*.devmesh.mentolder.de` with a wildcard certificate issued by
Let's Encrypt through a DNS01 challenge. The public DNS records SHALL point to tailnet addresses
of the devmesh servers only.

#### Scenario: Certificate is trusted without a private CA

- **GIVEN** a developer client with tailnet membership and no additional CA installed
- **WHEN** it requests `https://web.devmesh.mentolder.de/api/health`
- **THEN** TLS verification succeeds and the endpoint answers HTTP 200

#### Scenario: DNS exposes no LAN address

- **GIVEN** the public DNS zone for `devmesh.mentolder.de`
- **WHEN** its A records are resolved
- **THEN** every address lies in `100.64.0.0/10`

### Requirement: GPU inference is reached through a static endpoint and degrades when absent

The stack SHALL reach native GPU inference on PK-Desktop through a selector-less Service backed
by an EndpointSlice whose address and port come from `gpu_endpoint` in `devmesh/inventory.yaml`.
When the endpoint does not answer, dependent workloads SHALL stay running and report a degraded
state instead of restarting.

#### Scenario: Workstation is powered off

- **GIVEN** PK-Desktop is powered off
- **WHEN** the SDLC console receives a request that needs inference
- **THEN** the console pod stays `Running` and the response names the degraded GPU backend

### Requirement: Migration from k3d preserves data and verifies row counts

`task devmesh:migrate` SHALL copy the databases `pocket_id` and `website` from
`k3d-mentolder-dev` to devmesh and SHALL compare the row count of every table between source and
target. It SHALL exit `1` on any difference and SHALL NOT modify the source.

#### Scenario: Row counts match

- **GIVEN** a completed dump and restore
- **WHEN** the comparison runs
- **THEN** every table has the same row count in source and target and the command exits 0

#### Scenario: A table differs

- **GIVEN** a table whose target row count differs from the source
- **WHEN** the comparison runs
- **THEN** the command exits 1, names the table and leaves the source database unchanged

### Requirement: Ticket tooling refuses devmesh as a write target

`scripts/ticket.sh`, `scripts/vda/ticket/_ticket-core.sh`, `scripts/factory/lib.sh` and
`scripts/ticket-mcp-node` SHALL refuse any write when the resolved kubeconfig context is
`devmesh` or points to a devmesh API server, and SHALL name `fleet` as the database of record.
Reads SHALL remain allowed.

#### Scenario: Write against devmesh is refused

- **GIVEN** `TICKET_CTX=devmesh`
- **WHEN** `bash scripts/ticket.sh create --type chore --title x --description y` runs
- **THEN** it exits non-zero without writing and the message names `fleet`

#### Scenario: Renamed context pointing at devmesh is refused

- **GIVEN** a context named `scratch` whose server is a devmesh API server
- **WHEN** a ticket write runs with `TICKET_CTX=scratch`
- **THEN** it exits non-zero without writing

#### Scenario: Read against devmesh is allowed

- **GIVEN** `TICKET_CTX=devmesh`
- **WHEN** `bash scripts/ticket.sh get T900115` runs
- **THEN** it does not fail because of the context guard

### Requirement: The devmesh database is backed up daily

A CronJob SHALL write a daily `pg_dumpall` of the devmesh `shared-db` to a volume on a
`storage=true` node and SHALL keep fourteen days of dumps.

#### Scenario: Backup retention

- **GIVEN** fifteen daily dumps exist
- **WHEN** the backup job completes
- **THEN** the oldest dump is deleted and fourteen remain
