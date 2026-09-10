## MODIFIED Requirements

### Requirement: The proxy serves remote backends only

The LLM proxy SHALL run as a container of the `dev-pod` deployment and SHALL route to remote
backends only. The loadout machinery — transient systemd user units and the `exclusiveGroup`
arbitration that kept loadouts from evicting each other from the GPU — SHALL be removed.

#### Scenario: No GPU is available to route to

- **GIVEN** every node of the `fleet` cluster reports no GPU capacity
- **WHEN** the proxy resolves a model name to a backend
- **THEN** it selects among remote backends, and no code path attempts to start a local loadout

#### Scenario: The proxy outlives the workstation

- **GIVEN** the proxy runs in the cluster rather than on the workstation
- **WHEN** the workstation is powered off
- **THEN** consumers of the proxy continue to resolve models, so that scheduled work does not
  depend on an interactive machine being awake

### Requirement: The purpose section describes the running state

The spec's Purpose section carried a status note declaring that it described the historical
rather than the running state. With the proxy moved into the cluster, the Purpose SHALL
describe the running state and the note SHALL be removed.

#### Scenario: Purpose and deployment agree

- **GIVEN** the Purpose section previously described systemd user units on the WSL dev host
- **WHEN** the proxy runs as a `dev-pod` container against remote backends
- **THEN** the Purpose describes that arrangement, and carries no note deferring its own accuracy
