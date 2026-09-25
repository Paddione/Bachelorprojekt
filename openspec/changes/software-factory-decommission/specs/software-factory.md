## REMOVED Requirements

### Requirement: Dispatcher-Tick-Execution

The system SHALL NOT execute automated dispatcher ticks or manage factory timers.

#### Scenario: Dispatcher timer is disabled and uninstalled

- **GIVEN** the repository has decommissioned the software factory
- **WHEN** systemd user services are inspected
- **THEN** neither `factory.timer` nor `factory.service` is active or enabled

### Requirement: Queue-Poll und Slot-Claim

The system SHALL NOT poll the backlog for autonomous dispatch or claim pipeline slots.

#### Scenario: No autonomous queue poll

- **GIVEN** tickets in `backlog` or `triage` status
- **WHEN** no interactive agent is running
- **THEN** no background process claims `pipeline_slot` or moves tickets to `in_progress`

### Requirement: Kill-Switch und Daily-Cap Guards

The system SHALL NOT evaluate factory kill-switches or daily factory budget caps.

#### Scenario: Factory control guards removed

- **GIVEN** platform database migrations are executed
- **WHEN** checking for runtime factory guards
- **THEN** tickets and pipelines run without querying `tickets.factory_control`

## ADDED Requirements

### Requirement: Software-Factory Subsystem Decommissioned

The software factory subsystem (systemd timer, runner pod, dispatcher pipelines, MCP server, and database control tables) SHALL be completely decommissioned and absent from active deployment.

#### Scenario: No factory units active

- **GIVEN** the dev host systemd environment
- **WHEN** checking `systemctl --user is-active factory.timer factory-mcp.service`
- **THEN** all factory services report inactive or unit not found

#### Scenario: No factory runner manifests in dev-stack

- **GIVEN** the Kubernetes dev-stack configuration in `k3d/dev-stack/kustomization.yaml`
- **WHEN** inspecting the resource list
- **THEN** `factory-runner.yaml` and `factory-runner-netpol.yaml` are not included

### Requirement: Independent Database Migration Execution

Database migrations for `shared-db` SHALL execute independently of any factory subsystem components via a decoupled migration runner.

#### Scenario: Run migrations via db-migrate

- **GIVEN** pending SQL migrations in `migrations/*.sql`
- **WHEN** executing `task db:migrate` (or legacy alias `task factory:migrate`)
- **THEN** the migrations are applied to `shared-db` and recorded in `public.factory_schema_migrations`
