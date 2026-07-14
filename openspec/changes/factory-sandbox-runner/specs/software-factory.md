## ADDED Requirements

### Requirement: Sandboxed Command Execution for the Implement Phase

The system SHALL execute the Implement-phase build and verify commands (`task workspace:validate`, `task test:all`, `task freshness:regenerate` in `pipeline.js` and the `runTaskVerifyLoop` in `build-loop.cjs`) inside an isolated sandbox provided by `scripts/factory/sandbox-run.sh`, instead of running them directly as a host process. The runner SHALL select an execution backend via the fallback chain **docker → k8s → off**, overridable with the `FACTORY_SANDBOX=docker|k8s|off` environment variable. When Docker is available (`docker info` succeeds) it SHALL run the command in a dedicated sandbox image with the target worktree bind-mounted; when Docker is unavailable it SHALL fall back to a Kubernetes Job in the local cluster with equivalent semantics; when neither is available (or `FACTORY_SANDBOX=off`) it SHALL run the command unsandboxed on the host and emit warning telemetry. The runner SHALL NOT mount the main repository checkout or the `environments/.secrets/` directory into the sandbox. The egress policy SHALL be default-deny with an allowlist (Anthropic API, npm registry, GitHub, and staging/prod endpoints), where the prod domain is resolved from `PROD_DOMAIN` / `k3d/configmap-domains.yaml` and never hardcoded as a brand-domain literal.

#### Scenario: Docker backend selected when the daemon is reachable

- **GIVEN** `FACTORY_SANDBOX` is unset and `docker info` succeeds
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the resolved mode is `docker`; the command runs in the sandbox image with the worktree bind-mounted; neither the main checkout nor `environments/.secrets/` is mounted

#### Scenario: Fallback to a k8s Job when Docker is unavailable

- **GIVEN** `FACTORY_SANDBOX` is unset and `docker info` fails while the local cluster is reachable
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the resolved mode is `k8s`; the command runs as a Kubernetes Job with the worktree as its volume and the same secret/main-checkout mount exclusions

#### Scenario: Off escape-hatch runs unsandboxed with warning telemetry

- **GIVEN** `FACTORY_SANDBOX=off`
- **WHEN** `scripts/factory/sandbox-run.sh <worktree> "task test:all"` is invoked
- **THEN** the command runs directly on the host (today's behavior); a warning is written to stderr; and warn telemetry (`factory.sandbox.off`) is emitted via `otel-emit.sh`

#### Scenario: Refusal to sandbox the main checkout

- **GIVEN** the worktree argument equals the main repository checkout path
- **WHEN** `scripts/factory/sandbox-run.sh <main-checkout> "task test:all"` is invoked
- **THEN** the runner exits non-zero without mounting the main checkout into any container
