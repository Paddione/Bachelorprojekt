## MODIFIED Requirements

### Requirement: The proxy serves remote backends only
<!-- bats: local-dev-mesh/llm-services.bats -->

The LLM proxy SHALL run as a process of the `llm-services` Deployment in the `devmesh` cluster
and SHALL route only to backends it reaches over the network: cluster services, the GPU
workstation through `llm-gateway-host`, and external APIs. The loadout machinery — transient
systemd user units and the `exclusiveGroup` arbitration that kept loadouts from evicting each
other from the GPU — SHALL remain removed. The proxy SHALL NOT run as a systemd user unit on the
workstation or inside the fleet `dev-pod`.

#### Scenario: The proxy resolves a workstation GPU model

- **GIVEN** the devmesh registry lists a workstation model under `llm-gateway-host:<port>`
- **WHEN** the proxy resolves that model name
- **THEN** it forwards the request to the workstation over the tailnet, and no code path
  attempts to start a local loadout

#### Scenario: The proxy outlives the workstation

- **GIVEN** the proxy runs in the devmesh cluster rather than on the workstation
- **WHEN** the workstation is powered off
- **THEN** the proxy keeps serving cluster and remote backends and reports the workstation
  backends as unavailable
