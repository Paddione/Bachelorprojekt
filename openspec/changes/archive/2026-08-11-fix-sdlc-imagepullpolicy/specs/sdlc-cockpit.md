## ADDED Requirements

### Requirement: Das sdlc-console-Image wird immer frisch gezogen

The system SHALL set `imagePullPolicy: Always` on the `sdlc-console` container
whose image is `ghcr.io/paddione/website-sdlc:latest`. For `:latest` images this
is the canonical choice: the kubelet SHALL pull the current registry state on
every pod start instead of keeping the first locally-present layer. (T003740)

#### Scenario: The console pod picks up a newer :latest image

- **GIVEN** the manifest declares `imagePullPolicy: Always` on `sdlc-console`
- **WHEN** the deployment is restarted and a newer `:latest` image exists in the
  registry
- **THEN** the pod runs the newer image
- **AND** the manifest carries no `IfNotPresent` on that container

### Requirement: Ein dokumentierter Neustart-Handgriff fuer den lokalen Stack

The system SHALL provide a task `sdlc:refresh` that restarts the
`sdlc-console` deployment and waits for it to become ready, as a documented
manual alternative to the automatic pull. (T003740)

#### Scenario: The refresh task restarts and watches the console

- **GIVEN** a running SDLC stack on `k3d-mentolder-dev`
- **WHEN** `task sdlc:sdlc:refresh` is executed
- **THEN** the `sdlc-console` deployment is restarted
- **AND** the task waits until the deployment is ready
