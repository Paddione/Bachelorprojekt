## ADDED Requirements

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
destination is `tag:devclient`.

#### Scenario: Policy grants no path into developer clients

- **GIVEN** `devmesh/tailnet-policy.hujson`
- **WHEN** the policy guard parses its access rules
- **THEN** no rule names `tag:devclient` as a destination
- **AND** a rule from `tag:devclient` to `tag:devmesh` covering ports 22, 443 and 6443 exists

### Requirement: The tailnet check separates findings from missing preconditions

`scripts/devmesh/tailnet-check.sh` SHALL exit `0` when every inventory peer answers, `1` when
at least one peer does not answer, and `2` when a precondition is missing — the Tailscale CLI
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
