## ADDED Requirements

### Requirement: REQ-NETPLAN-001 — Single registry declares every address range

The system SHALL declare every IP address range the project uses in
`docs/agent-guide/registry/networks.yaml`, and SHALL treat that file as the single source of
truth for address allocation. Each entry SHALL carry `id`, `cidr`, `owner`, `purpose`,
`status` (`active` or `retired`) and `source` (where the range is actually configured).
A range that is no longer in use SHALL remain declared with `status: retired` rather than being
deleted, so that a later reuse of the same range is still detected as a collision.

#### Scenario: Registry declares the known ranges

- **GIVEN** the registry `docs/agent-guide/registry/networks.yaml`
- **WHEN** its entries are listed
- **THEN** it contains entries for the home LAN `10.0.0.0/8`, the fleet overlay `10.20.0.0/24`,
  the pod CIDR range `10.42.0.0/16`, the service CIDR range `10.43.0.0/16`, the Tailscale range
  `100.64.0.0/10`, the Docker bridges `172.17.0.0/16`, `172.18.0.0/16` and `172.23.0.0/16`,
  and the mentolder mesh `192.168.100.0/24`

#### Scenario: A decommissioned range stays declared as retired

- **GIVEN** the korczewski cluster has been torn down
- **WHEN** the entry for its mesh `10.13.14.0/24` is inspected
- **THEN** the entry is present with `status: retired` and is not absent from the registry

### Requirement: REQ-NETPLAN-002 — Undeclared overlap fails the check

The system SHALL provide a fail-closed check that computes overlap between every pair of
declared ranges numerically, comparing network boundaries as integers rather than matching
text. The check SHALL exit non-zero and name both parties when two ranges overlap without a
declared `overlaps` entry.

#### Scenario: Two overlapping ranges without a declaration are rejected

- **GIVEN** a registry in which two entries overlap and neither declares the other under
  `overlaps`
- **WHEN** the check runs
- **THEN** it exits non-zero and its output names the `id` of both entries

#### Scenario: Overlap is detected across differing prefix lengths

- **GIVEN** a registry containing `10.0.0.0/8` and `10.42.5.0/24` with no `overlaps` declaration
- **WHEN** the check runs
- **THEN** it exits non-zero, because the two ranges overlap even though they share no common
  text prefix

#### Scenario: A registry free of undeclared overlap passes

- **GIVEN** a registry in which every overlapping pair declares the other under `overlaps`
- **WHEN** the check runs
- **THEN** it exits zero

### Requirement: REQ-NETPLAN-003 — Declared overlap is accepted and justified

The system SHALL accept an overlap when the entry declares it under `overlaps` with the
counterpart `with`, a `reason` and a `mitigation`. The check SHALL also verify the converse:
an `overlaps` entry whose named counterpart does not in fact overlap SHALL fail, so the field
cannot be used as a blanket exemption that would mask a later, genuine collision.

#### Scenario: Declared overlap passes the check

- **GIVEN** the entry for the mentolder mesh declares an `overlaps` entry naming the Hetzner
  private network, with a reason and a mitigation
- **WHEN** the check runs
- **THEN** it exits zero and does not report that pair

#### Scenario: An overlaps entry naming a non-overlapping range is rejected

- **GIVEN** an entry declares `overlaps` with a counterpart whose range does not intersect it
- **WHEN** the check runs
- **THEN** it exits non-zero and its output names the spurious declaration

#### Scenario: An overlaps entry naming an unknown id is rejected

- **GIVEN** an entry declares `overlaps` with an `id` that no registry entry carries
- **WHEN** the check runs
- **THEN** it exits non-zero and its output names the unknown `id`

### Requirement: REQ-NETPLAN-004 — Malformed ranges fail the check

The system SHALL reject a registry whose entries are not well formed: a `cidr` that is not
valid notation, a `cidr` whose network address does not match its prefix length, or a
duplicate `id`.

#### Scenario: A non-normalised CIDR is rejected

- **GIVEN** an entry declaring `10.42.5.7/24`, whose host bits are set
- **WHEN** the check runs
- **THEN** it exits non-zero and its output names the offending entry

#### Scenario: A duplicate id is rejected

- **GIVEN** two entries carrying the same `id`
- **WHEN** the check runs
- **THEN** it exits non-zero and its output names the duplicated `id`

### Requirement: REQ-NETPLAN-005 — Generated map documents the plan

The system SHALL generate `docs/agent-guide/maps/networks-map.md` from the registry, listing
every range with its owner, purpose, status and any declared overlap, and SHALL keep it under
the same freshness guarantee as the other generated maps so that hand edits and drift are
detected.

#### Scenario: The map reflects the registry

- **GIVEN** the registry contains an entry for the fleet overlay `10.20.0.0/24`
- **WHEN** the map is regenerated
- **THEN** `docs/agent-guide/maps/networks-map.md` contains a row for `10.20.0.0/24` naming its
  owner and purpose

#### Scenario: Drift between registry and map is detected

- **GIVEN** the registry has been changed without regenerating the map
- **WHEN** the freshness check runs
- **THEN** it reports the map as stale
