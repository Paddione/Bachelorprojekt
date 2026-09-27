## ADDED Requirements

### Requirement: The role pi receives explicit grants only

The registry SHALL accept `pi` as a valid role in `scripts/toolset/check.mjs` and
`scripts/toolset-context.sh`. For the role `pi`, the wildcard `all` SHALL NOT grant access:
`scripts/toolset-context.sh pi` SHALL emit only non-suppressed instances whose `roles` list
contains `pi` literally. The Pi harness SHALL NOT be a render target of `sync.mjs`; it reads
its grants from the registry at run time.

#### Scenario: Wildcard instances are withheld from pi

- **GIVEN** an instance with `roles: [all]` and an instance with `roles: [pi]`
- **WHEN** `scripts/toolset-context.sh pi` runs
- **THEN** it exits 0, the output contains the second instance id and does not contain the first

#### Scenario: pi is a known role for the gate

- **GIVEN** a canonical instance with `roles: [pi]`
- **WHEN** `node scripts/toolset/check.mjs` runs
- **THEN** it reports no unknown-role error for that instance
