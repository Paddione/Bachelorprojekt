## ADDED Requirements

### Requirement: Endpoint availability is decided by HTTP status

The system SHALL determine LLM endpoint availability from the HTTP status code, not from the
exit code of the request tool alone. An endpoint answering with a 5xx status SHALL be treated
as unavailable.

#### Scenario: A server answering 500 is not treated as available

- **GIVEN** an HTTP server that responds to every request with status 500
- **WHEN** the endpoint availability check is executed against it
- **THEN** the check reports the endpoint as unavailable
- **AND** a server responding with status 200 is reported as available

### Requirement: The long-context probe proves its own context size

The system SHALL reject a long-context probe result whose prompt did not reach the intended
size. The probe SHALL read the prompt size reported by the server rather than assuming it from
the constructed input.

#### Scenario: A probe whose filler did not take effect fails instead of passing

- **GIVEN** a probe request whose filler text produced fewer tokens than the configured minimum
- **WHEN** the probe evaluates the server response
- **THEN** the probe fails with an explicit message about the missing context size
- **AND** it does not report the string-recall result as valid

### Requirement: The long-context probe targets the configured loadout port

The system SHALL address the probe at the port declared for the loadout under test in the
loadout registry, so that a port change in the registry cannot silently disable the probe.

#### Scenario: Probe endpoint and loadout registry agree

- **GIVEN** the loadout registry declares a port for the chat loadout under test
- **WHEN** the probe endpoint is resolved
- **THEN** the resolved port equals the declared port
- **AND** no decommissioned port is referenced

### Requirement: Loadout sampling and chat template arguments reach the server

The system SHALL pass sampling parameters and chat template arguments declared in a loadout to
the model server process. Loadouts that declare none of these fields SHALL produce an unchanged
argument vector.

#### Scenario: Declared parameters appear in the server arguments

- **GIVEN** a loadout declaring sampling parameters and chat template arguments
- **WHEN** the server argument vector is built
- **THEN** the vector contains the corresponding server flags with the declared values

#### Scenario: A loadout without these fields is unaffected

- **GIVEN** a loadout that declares neither sampling parameters nor chat template arguments
- **WHEN** the server argument vector is built
- **THEN** the vector contains none of these flags
