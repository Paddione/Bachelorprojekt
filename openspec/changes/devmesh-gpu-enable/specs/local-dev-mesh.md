## ADDED Requirements

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
