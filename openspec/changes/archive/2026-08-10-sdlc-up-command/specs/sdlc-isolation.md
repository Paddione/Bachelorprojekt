## ADDED Requirements

### Requirement: Single Entry Point for the Local SDLC Stack

The repository SHALL provide a task `sdlc:up` that brings the local SDLC stack from a cold
machine to a verified running state in one invocation, and a task `sdlc:down` that shuts it
down again.

`sdlc:up` SHALL orchestrate the existing tasks rather than reimplement them, in the order
cluster → stack → llm-proxy → health gate, and SHALL terminate with a non-zero exit status if
any stage fails.

Rationale: die Einzelschritte existieren bereits; was fehlte, war die Reihenfolge und die
Verifikation. Ein `sdlc:up`, das seine Bausteine dupliziert, würde bei jeder Änderung an
`sdlc:deploy` auseinanderlaufen.

#### Scenario: Cold start brings the stack up

- **GIVEN** no k3d cluster `mentolder-dev` exists and the llm-proxy is not running
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the cluster is created, the SDLC stack is deployed, the llm-proxy is started
- **AND** the command exits 0 only after the health gate reports every component ready

#### Scenario: Repeated invocation is idempotent

- **GIVEN** the SDLC stack is already running and healthy
- **WHEN** the operator runs `task sdlc:up` a second time
- **THEN** the command does not fail on the already-existing cluster
- **AND** it exits 0 without recreating or restarting the cluster

#### Scenario: Shutdown reverses the startup order

- **GIVEN** the SDLC stack is running
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the llm-proxy is stopped before the cluster is deleted

### Requirement: The `dev:` Task Namespace Stays Reserved for the Staging Stack

The task namespace `dev:` SHALL continue to address the persistent staging stack defined in
`taskfiles/Taskfile.dev-stack.yml`. Tasks that operate on the local SDLC stack SHALL NOT be
added under the `dev:` prefix.

Rationale: beide Stacks laufen im selben Cluster-Kontext `k3d-mentolder-dev`. Ein `dev:up`,
das den SDLC-Stack startet, stünde direkt neben `dev:deploy`, das den Staging-Stack aufspielt —
gleiches Präfix, zwei verschiedene Systeme, gleicher Kontext.

#### Scenario: No SDLC entry point under the staging prefix

- **GIVEN** the task definitions in `taskfiles/`
- **WHEN** the task list is inspected
- **THEN** no task named `dev:up` or `dev:down` exists
- **AND** the SDLC entry points are reachable as `sdlc:up` and `sdlc:down`

### Requirement: Health Gate Reports Diagnosable Failure

`sdlc:up` SHALL verify readiness through a health gate that names the component that failed
and the observed state, rather than reporting a generic failure or reporting success on a
partially started stack.

The health gate SHALL check that the cluster context is reachable, that the deployments
`shared-db`, `pocket-id`, `sdlc-console`, `bge-embed` and `bge-rerank` are available, and that
the llm-proxy answers its status probe.

#### Scenario: A failed component is named

- **GIVEN** the cluster is up but the deployment `pocket-id` never becomes available
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command exits non-zero
- **AND** the output names `pocket-id` and its observed state

#### Scenario: A partially started stack is not reported as success

- **GIVEN** one of the checked components is not ready
- **WHEN** the health gate runs
- **THEN** it exits non-zero

### Requirement: The Astro Dev Server Is a Separate, Blocking Task

The Astro dev server SHALL be started by its own task `sdlc:dev` with `BUILD_TARGET=sdlc`, and
SHALL NOT be started by `sdlc:up`.

Rationale: der Devserver blockiert das Terminal bis zum Abbruch. In `sdlc:up` aufgenommen,
terminierte dieser nie und verlöre damit seinen Exit-Status als Erfolgssignal.

#### Scenario: Startup terminates

- **GIVEN** a cold machine
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command returns control to the shell instead of blocking

#### Scenario: Dev server task carries the SDLC build target

- **GIVEN** the task `sdlc:dev`
- **WHEN** it is invoked
- **THEN** it runs the Astro dev server with `BUILD_TARGET=sdlc`
