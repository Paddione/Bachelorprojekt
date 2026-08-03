## ADDED Requirements

### Requirement: Cluster Membership Matches the Declared Node Registry

The system SHALL provide a check that compares the node set declared in `wireguard/wg-mesh-nodes.yaml` against the nodes actually registered in the `fleet` cluster, so that a node silently leaving the cluster is detected instead of persisting undetected for weeks.

#### Scenario: Declared node missing from the cluster is reported

- **GIVEN** `wireguard/wg-mesh-nodes.yaml` declares `gekko-hetzner-2` as a fleet node
- **AND** `kubectl --context fleet get nodes` does not list `gekko-hetzner-2`
- **WHEN** the membership check runs
- **THEN** it exits non-zero
- **AND** its output names `gekko-hetzner-2` as declared-but-absent

#### Scenario: Fully consistent node set passes

- **GIVEN** every node declared in `wireguard/wg-mesh-nodes.yaml` is registered in the cluster
- **WHEN** the membership check runs
- **THEN** it exits zero
- **AND** its output reports no drift

### Requirement: Dedicated Development Node Repels Production Workloads

The system SHALL mark the development node with the taint `role=dev:NoSchedule` and a matching label, so that production workloads can never be scheduled onto it by accident.

#### Scenario: Development node carries taint and label

- **GIVEN** `gekko-hetzner-2` has joined the fleet cluster as a worker
- **WHEN** its node object is inspected
- **THEN** it carries the label `role=dev`
- **AND** it carries the taint `role=dev` with effect `NoSchedule`

#### Scenario: Production pod without toleration is not scheduled onto the development node

- **GIVEN** the development node carries the `role=dev:NoSchedule` taint
- **WHEN** a pod without a matching toleration is scheduled
- **THEN** it is not placed on the development node

#### Scenario: Development stack tolerates the taint and targets the node

- **GIVEN** the rendered `workspace-dev` manifests
- **WHEN** their pod specs are inspected
- **THEN** each declares a toleration for `role=dev` with effect `NoSchedule`
- **AND** each declares node affinity requiring the label `role=dev`

### Requirement: Cluster Development Stack Has Its Own Environment File

The system SHALL resolve `DEV_DOMAIN` for the fleet-rendered development stack from an environment file distinct from the one describing the local k3d environment, so that a local environment without a public domain cannot disable the cluster development stack.

#### Scenario: Renderer sources the cluster development environment

- **GIVEN** `environments/dev-cluster.yaml` declares a non-empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the rendered `dev/` directory contains the development stack workloads
- **AND** the rendered output is not the empty placeholder kustomization

#### Scenario: Local environment file no longer controls the cluster stack

- **GIVEN** `environments/dev.yaml` declares no `DEV_DOMAIN`
- **AND** `environments/dev-cluster.yaml` declares a non-empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the development stack is still rendered

#### Scenario: Empty cluster development domain still disables the stack

- **GIVEN** `environments/dev-cluster.yaml` declares an empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the rendered `dev/` directory contains a valid but empty kustomization
- **AND** the renderer exits zero

### Requirement: Kubernetes API Is Reachable Through Every Control-Plane Node

The system SHALL include the public address of every control-plane node in the API server certificate, so that external cluster access does not depend on a single node.

#### Scenario: Each control-plane node declares its public address as a TLS SAN

- **GIVEN** the k3s configuration of a control-plane node
- **WHEN** `/etc/rancher/k3s/config.yaml` is inspected
- **THEN** it declares a `tls-san` entry containing that node's public address

#### Scenario: API certificate covers all control-plane addresses

- **GIVEN** the served API certificate of the fleet cluster
- **WHEN** its subject alternative names are inspected
- **THEN** they include the public address of each control-plane node
