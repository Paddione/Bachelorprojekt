## RENAMED Requirements

### Requirement: No remote cockpit and no tunnel into the home network

**Renamed-to:** Remote access to the SDLC surface only through the tailnet, without an inbound port

## MODIFIED Requirements

### Requirement: Remote access to the SDLC surface only through the tailnet, without an inbound port

The SDLC surface SHALL be reachable from the home network and from developer clients that are
members of the tailnet with the tag `tag:devclient`. There SHALL be no publicly reachable
endpoint for the SDLC surface and no port forwarded from the internet into the home network;
every tailnet connection SHALL be established outbound.

#### Scenario: SDLC is home-only for devices outside the tailnet

- **GIVEN** a user outside the home network whose device is not a tailnet member
- **WHEN** they try to reach the SDLC cockpit
- **THEN** no publicly reachable endpoint answers and no tunnel forwards the request

#### Scenario: Tailnet client outside the home network

- **GIVEN** a developer client outside the home network that is a tailnet member with `tag:devclient`
- **WHEN** it requests the SDLC cockpit
- **THEN** the request is served through the tailnet

#### Scenario: Home router forwards no port

- **GIVEN** the home router configuration
- **WHEN** its port forwards are listed
- **THEN** no forward targets a devmesh server
