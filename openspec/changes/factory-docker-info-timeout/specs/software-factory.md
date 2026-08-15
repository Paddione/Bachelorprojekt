## ADDED Requirements

### Requirement: Docker-Probe der Backend-Selektion zeitbegrenzt

The sandbox backend selection SHALL time-bound the Docker probe of the fallback
chain docker → k8s → off: `docker info` SHALL be invoked with a 10-second timeout
(`timeout 10 docker info`) in both `scripts/factory/sandbox-run.sh` (`resolve_mode`)
and `scripts/factory/wakeup.sh` (tick sandbox preflight), so that a non-responding
Docker daemon terminates the probe after at most 10 seconds, is treated as backend
unavailable, and the resolution falls through to the next backend instead of blocking
the factory tick indefinitely.

#### Scenario: Docker-Daemon haengt — Fallback laeuft zeitbegrenzt weiter

- **GIVEN** the Docker daemon does not respond (socket exists, `docker info` hangs) and the local cluster is unreachable
- **WHEN** the sandbox backend is resolved (`FACTORY_SANDBOX=auto`)
- **THEN** the probe terminates within approximately 10 seconds and the mode resolves to `off` (command runs unsandboxed); the factory tick is not blocked beyond the timeout bound

#### Scenario: Docker-Daemon antwortet

- **GIVEN** `docker info` succeeds within the 10-second timeout
- **WHEN** the sandbox backend is resolved
- **THEN** the mode resolves to `docker` as before (unchanged behavior)
