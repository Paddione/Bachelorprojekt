## ADDED Requirements

### Requirement: WireGuard mesh reconcile applies the registry to every node

The system SHALL provide a task that applies the peer set declared in
`wireguard/wg-mesh-nodes.yaml` to every node of an environment, so that adding a participant to
the registry is sufficient to make every existing node know it. The task SHALL be idempotent,
SHALL offer a dry-run mode that changes nothing, and SHALL derive the WireGuard interface name
from the registry rather than hardcoding it.

#### Scenario: A newly declared participant reaches every existing node

- **GIVEN** the `fleet` block declares a participant that no node currently carries as a peer
- **WHEN** `task wg:reconcile ENV=fleet` is run
- **THEN** every node of that environment carries the new participant as a peer, both in its
  running interface and in its persisted `.conf`

#### Scenario: Reconcile is idempotent

- **GIVEN** every node already matches the registry
- **WHEN** `task wg:reconcile ENV=fleet` is run a second time
- **THEN** the command reports no change and the peer set of every node is unchanged

#### Scenario: Dry-run reports without changing

- **GIVEN** at least one node deviates from the registry
- **WHEN** `task wg:reconcile ENV=fleet DRY_RUN=1` is run
- **THEN** the output names the nodes that would change and the peers that would be added or
  removed, and no node's peer set is modified

### Requirement: WireGuard mesh drift is detected as a gate

The system SHALL provide a task that compares, per node, the running peer set against the peer set
rendered from `wireguard/wg-mesh-nodes.yaml`, so that a mesh diverging from its declaration is
detected instead of persisting unnoticed. The task SHALL exit non-zero on drift and SHALL name the
affected nodes and peers. Without cluster access it SHALL skip with exit 0, matching the behaviour
of `scripts/fleet-membership-check.sh`.

#### Scenario: Asymmetric mesh is reported

- **GIVEN** one node carries a peer that the other nodes of the same environment do not
- **WHEN** `task wg:drift ENV=fleet` is run
- **THEN** the command exits non-zero and names both the nodes missing the peer and the peer itself

#### Scenario: Matching mesh passes

- **GIVEN** every node's running peer set equals the set rendered from the registry
- **WHEN** `task wg:drift ENV=fleet` is run
- **THEN** the command exits zero

#### Scenario: No cluster access skips instead of failing

- **GIVEN** the nodes are not reachable
- **WHEN** `task wg:drift ENV=fleet` is run
- **THEN** the command exits zero and reports that the check was skipped

### Requirement: Reconcile and drift share one renderer

The system SHALL compute the expected peer set for both the reconcile task and the drift task from
a single shared code path, so that the state the drift check demands is exactly the state the
reconcile task produces.

#### Scenario: Both tasks agree on the expected peer set

- **GIVEN** an environment whose nodes deviate from the registry
- **WHEN** `task wg:reconcile ENV=<env>` is run and `task wg:drift ENV=<env>` is run afterwards
- **THEN** the drift check exits zero
