# local-dev-mesh

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-dev-mesh ergänzen._

## Requirements

### Requirement: Dev peers join the tailnet with role tags

Every devmesh server SHALL be a member of the tailnet with the tag `tag:devmesh`, and every
developer client SHALL be a member with the tag `tag:devclient`. The repository SHALL hold the
peer inventory in `devmesh/inventory.yaml`, one entry per peer with `name`, `role`, `tag`,
`lan_ip` and `tailnet_name`. Tailscale auth keys SHALL NOT be committed.

#### Scenario: Inventory lists every peer with its tag

- **GIVEN** `devmesh/inventory.yaml`
- **WHEN** the inventory is parsed
- **THEN** every entry with `role: server` carries `tag: tag:devmesh`
- **AND** every entry with `role: client` carries `tag: tag:devclient`

#### Scenario: No auth key in the repository

- **GIVEN** the repository tree
- **WHEN** it is searched for the Tailscale auth-key prefix `tskey-`
- **THEN** no tracked file outside `environments/.secrets/` contains a match

### Requirement: LAN path is preferred, the tailnet relay is the fallback

A developer client inside the home network SHALL reach every devmesh server over a direct
path. A client outside the home network SHALL reach the same servers through the tailnet
without any inbound port forwarded on the home router.

#### Scenario: Client at home uses the direct path

- **GIVEN** PK-Desktop is inside the home network and Tailscale is running
- **WHEN** `bash scripts/devmesh/tailnet-check.sh` runs
- **THEN** every server is reported as `direct`
- **AND** the command exits 0

#### Scenario: Client away from home falls back to the relay

- **GIVEN** a developer client outside the home network with Tailscale running
- **WHEN** the check runs
- **THEN** every server is reported as `direct` or `relay`
- **AND** the command exits 0

### Requirement: Tailnet access policy is versioned in the repository

The intended tailnet access policy SHALL live in `devmesh/tailnet-policy.hujson`. It SHALL
allow `tag:devclient` to reach `tag:devmesh` on tcp ports 22, 443 and 6443, SHALL allow
unrestricted traffic between `tag:devmesh` peers, and SHALL NOT contain any rule whose
destination is `tag:devclient`. The only path from `tag:devmesh` into a developer client SHALL
be a single rule to the GPU workstation host alias `gpu-host` on the port recorded as
`gpu_endpoint` in `devmesh/inventory.yaml`.

#### Scenario: Policy grants no general path into developer clients

- **GIVEN** `devmesh/tailnet-policy.hujson`
- **WHEN** the policy guard parses its access rules
- **THEN** no rule names `tag:devclient` or `*` as a destination
- **AND** a rule from `tag:devclient` to `tag:devmesh` covering ports 22, 443 and 6443 exists

#### Scenario: GPU endpoint is the only exception

- **GIVEN** `devmesh/tailnet-policy.hujson` and `devmesh/inventory.yaml`
- **WHEN** the policy guard collects rules whose source is `tag:devmesh` and whose destination is not `tag:devmesh`
- **THEN** exactly one such rule exists, its destination is `gpu-host` and its port equals the port of `gpu_endpoint`

### Requirement: The tailnet check separates findings from missing preconditions

`scripts/devmesh/tailnet-check.sh` SHALL ping every inventory entry with `role: server` —
developer clients are not checked, because laptops and tablets are regularly offline. It SHALL
exit `0` when every server answers, `1` when at least one server does not answer, and `2` when a
precondition is missing — the Tailscale CLI
is unavailable or the local Tailscale service is not in state `Running`.

#### Scenario: A peer does not answer

- **GIVEN** the Tailscale service is running and one server is powered off
- **WHEN** the check runs
- **THEN** it exits 1 and names the unreachable server

#### Scenario: Tailscale service is not running

- **GIVEN** the local Tailscale service reports state `NoState`
- **WHEN** the check runs
- **THEN** it exits 2 rather than 1
- **AND** the output names the service state, not an unreachable peer

<!-- merged from change delta local-dev-mesh.md (9a94071bca37) -->

### Requirement: A devmesh host with a GPU offers it as a schedulable resource

A devmesh host that carries a GPU SHALL advertise it to the cluster as the extended
resource `nvidia.com/gpu`. The repository SHALL provide `dev-local/gpu/` as a
self-contained kustomize target holding the NVIDIA device plugin, applicable on its own
without rendering `dev-local/core`. Hosts with a GPU SHALL carry the node label
`gpu=true`, and the device plugin SHALL select on that label rather than running
cluster-wide.

#### Scenario: The node advertises the extended resource

- **GIVEN** a devmesh host labelled `gpu=true` with the container toolkit installed
- **WHEN** the device plugin from `dev-local/gpu/` is applied and becomes ready
- **THEN** the node's allocatable resources contain `nvidia.com/gpu` with a value of at least 1

#### Scenario: The GPU target stands alone

- **GIVEN** the repository tree
- **WHEN** `dev-local/gpu/` is built with kustomize
- **THEN** the build succeeds without resolving `dev-local/core` or `devmesh/inventory.yaml`

#### Scenario: The plugin is confined to GPU hosts

- **GIVEN** the device plugin manifest in `dev-local/gpu/`
- **WHEN** its pod spec is inspected
- **THEN** it carries a node selector requiring the label `gpu=true`

### Requirement: GPU enablement on a host is scripted and repeatable

The repository SHALL provide `scripts/devmesh/gpu-enable.sh`, which installs the
nvidia-container-toolkit on a target devmesh host, registers the nvidia runtime with
containerd and restarts k3s so that it picks the runtime up. The script SHALL be
idempotent: a second run against an already enabled host SHALL succeed without changing
state. Missing preconditions SHALL abort the run with exit code 2 and a message naming
the missing item, and SHALL NOT leave the host half-configured.

#### Scenario: Second run is a no-op

- **GIVEN** a host on which the script has already completed successfully
- **WHEN** the script runs again against the same host
- **THEN** it exits 0 and reports that the toolkit is already present
- **AND** it does not restart k3s

#### Scenario: A missing tool aborts before touching the host

- **GIVEN** an environment in which a required local tool is unavailable
- **WHEN** the script is invoked
- **THEN** it exits 2, names the missing tool, and issues no command against the host

#### Scenario: An unreachable host aborts the run

- **GIVEN** a target host that does not answer
- **WHEN** the script is invoked
- **THEN** it exits 2 and names the unreachable host

### Requirement: The status view reports GPU capacity

`scripts/devmesh/status.sh` SHALL report, per node, whether the cluster sees a GPU and how
many are allocatable. A node without a GPU SHALL be reported as such rather than omitted,
so that a missing device plugin is distinguishable from a host that has no card.

#### Scenario: Status separates "no GPU" from "GPU not offered"

- **GIVEN** a cluster in which one node carries a GPU and others do not
- **WHEN** `scripts/devmesh/status.sh` runs
- **THEN** every node appears with its GPU count
- **AND** a node carrying a card but advertising no `nvidia.com/gpu` is marked as such

<!-- merged from change delta local-dev-mesh.md (c1fe4357461c) -->