## ADDED Requirements

### Requirement: WSL Docker Credential Helper Auto-Heal in setup.sh

The system SHALL check `~/.docker/config.json` when `scripts/setup.sh` is executed within WSL. If `"credsStore": "desktop.exe"` or `"credsStore": "desktop"` is configured, the system SHALL automatically remove `credsStore` from the JSON to prevent failed docker operations due to broken Windows helper invocation.

#### Scenario: credsStore is removed in WSL
- **GIVEN** we are running inside a WSL environment
- **AND** `~/.docker/config.json` contains `"credsStore": "desktop.exe"` or `"credsStore": "desktop"`
- **WHEN** we execute `scripts/setup.sh`
- **THEN** the script automatically removes `credsStore` from `~/.docker/config.json`

### Requirement: Stable Container DNS in WSL

The system SHALL configure `--dns 1.1.1.1` (or equivalent reliable DNS server) for container executions under WSL to prevent DNS query flakiness and `ENOTFOUND` errors.

#### Scenario: Renovate runs with custom DNS
- **GIVEN** the self-hosted Renovate runner workflow configuration in `.github/workflows/renovate.yml`
- **WHEN** docker run is executed
- **THEN** it specifies `--dns 1.1.1.1`

#### Scenario: Sandbox runs with custom DNS in WSL
- **GIVEN** the sandbox runner script `scripts/factory/sandbox-run.sh`
- **WHEN** running container under WSL
- **THEN** it specifies `--dns 1.1.1.1`
