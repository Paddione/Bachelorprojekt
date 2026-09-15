## ADDED Requirements

### Requirement: Highly available control plane of three servers

The devmesh cluster SHALL run three k3s servers with embedded etcd: `gpu-metal` initialises
the cluster, `gpu-cluster` and `gpu-cluster2` join as servers. The k3s version SHALL be the
`k3s_version` pinned in `devmesh/inventory.yaml`.

#### Scenario: Cluster survives the loss of one server

- **GIVEN** all three servers are `Ready`
- **WHEN** one server is powered off
- **THEN** `kubectl --context devmesh get nodes` still answers from a remaining server
- **AND** the etcd member list shows two healthy members

#### Scenario: Installation script is idempotent

- **GIVEN** a host already running k3s at the pinned version in its inventory role
- **WHEN** `scripts/devmesh/k3s-install.sh` runs again for that host
- **THEN** it makes no change and exits 0

### Requirement: Node traffic uses LAN addresses with encrypted pod networking

Every devmesh node SHALL register its LAN address from `devmesh/inventory.yaml` as node IP and
SHALL use the flannel backend `wireguard-native`. The cluster SHALL use the pod network
`10.52.0.0/16` and the service network `10.53.0.0/16`, registered in
`docs/agent-guide/registry/networks.yaml`, so that devmesh addresses never coincide with the
fleet pod and service networks that the GPU workstation routes through `wg-gpu`. The API server
certificate SHALL list the LAN addresses and tailnet names of all servers.

#### Scenario: devmesh networks differ from fleet networks

- **GIVEN** `docs/agent-guide/registry/networks.yaml`
- **WHEN** the entries for the devmesh pod and service networks are read
- **THEN** their CIDRs are `10.52.0.0/16` and `10.53.0.0/16`
- **AND** neither overlaps `pod-cidr-fleet` or `service-cidr-fleet`

#### Scenario: Install flags for a joining server

- **GIVEN** the inventory entry for `gpu-cluster` with `k3s_role: server-join`
- **WHEN** `DRY_RUN=1 scripts/devmesh/k3s-install.sh gpu-cluster` runs
- **THEN** the printed command contains `--node-ip 10.10.10.2` and `--flannel-backend=wireguard-native`
- **AND** it does not contain `--cluster-init`

### Requirement: Preflight rejects unsuitable hosts before installation

`scripts/devmesh/preflight.sh <host>` SHALL exit `0` when the host is suitable, `1` when a
check fails, and `2` when a required tool is missing. It SHALL check memory, disabled swap,
active time synchronisation, free k3s ports, the rotational flag of the etcd data disk, and
reachability of the other servers on ports 6443 and 2379.

#### Scenario: A k3s port is occupied

- **GIVEN** a process listens on port 6443 on the host
- **WHEN** the preflight runs
- **THEN** it exits 1 and names the port and the owning process

#### Scenario: etcd would land on a rotational disk

- **GIVEN** the disk backing `/var/lib/rancher` reports `ROTA=1`
- **WHEN** the preflight runs
- **THEN** it exits 1 and names the disk

#### Scenario: A required tool is missing

- **GIVEN** `ss` is not on `PATH`
- **WHEN** the preflight runs
- **THEN** it exits 2 rather than 1

### Requirement: Stateful storage is pinned to a labelled node

The cluster SHALL use the `local-path` storage class. Exactly the nodes listed with the label
`storage=true` in the inventory SHALL carry that label, and stateful workloads SHALL select it.

#### Scenario: Storage label matches the inventory

- **GIVEN** the cluster is installed
- **WHEN** `kubectl --context devmesh get nodes -l storage=true -o name` runs
- **THEN** the result is exactly the inventory nodes labelled `storage=true`

### Requirement: The devmesh context reaches the API from home and away

`task devmesh:kubeconfig` SHALL merge a kubeconfig context named `devmesh` whose server is the
tailnet name of a devmesh server. The context SHALL work from a developer client inside and
outside the home network.

#### Scenario: Context works through the tailnet

- **GIVEN** a developer client with tailnet membership and the merged `devmesh` context
- **WHEN** `kubectl --context devmesh get nodes` runs
- **THEN** it lists all devmesh nodes

### Requirement: etcd snapshots are scheduled and reported

The servers SHALL take etcd snapshots every six hours and keep the latest twenty.
`task devmesh:status` SHALL report the age of the newest snapshot and exit non-zero when it is
older than twelve hours.

#### Scenario: Snapshot is overdue

- **GIVEN** the newest etcd snapshot is thirteen hours old
- **WHEN** `task devmesh:status` runs
- **THEN** it exits non-zero and names the snapshot age

### Requirement: The GPU workstation is not a cluster node

The WSL GPU host (PK-Desktop) SHALL NOT be registered as a devmesh node. GPU inference SHALL
stay a native process on that host.

#### Scenario: Node list excludes the workstation

- **GIVEN** the devmesh cluster
- **WHEN** its nodes are listed
- **THEN** no node name or address belongs to PK-Desktop
