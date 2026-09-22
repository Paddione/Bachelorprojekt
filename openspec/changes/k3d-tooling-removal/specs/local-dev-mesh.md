## ADDED Requirements

### Requirement: The repository ships no local k3d cluster tooling

The repository SHALL NOT contain tooling that creates, starts, stops, resets or imports images
into a local k3d cluster, because the local development stack runs on the k3s cluster `devmesh`
(ADR-008) and the k3d binary no longer exists on any target host. Concretely, `k3d-config.yaml`,
`k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh` and
`scripts/dev-cluster-autostart.sh` SHALL NOT exist; `Taskfile.yml` SHALL NOT define the tasks
`cluster:create`, `cluster:delete`, `cluster:start`, `cluster:stop`, `cluster:status`, `up`,
`down`, `workspace:up`, `dev:reset`, `website:build:import` or `einvoice-sidecar:import`, and
SHALL NOT invoke `k3d image import`. The directory `k3d/` stays, because it holds the production
Kustomize base. Tools that document or verify the completed decommission (`scripts/devmesh/`)
are out of scope of this requirement.

#### Scenario: Removed tasks are absent while deploy tasks remain

- **GIVEN** the repository at `HEAD`
- **WHEN** `task --list-all` is run in the repository root
- **THEN** the output lists `workspace:deploy` and lists none of `cluster:create`,
  `cluster:delete`, `cluster:start`, `cluster:stop`, `cluster:status`, `workspace:up`,
  `dev:reset`, `website:build:import` or `einvoice-sidecar:import`

#### Scenario: Removed files are absent while the production base remains

- **GIVEN** the repository at `HEAD`
- **WHEN** the file system is inspected
- **THEN** `k3d/kustomization.yaml` exists and none of `k3d-config.yaml`,
  `k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh` or
  `scripts/dev-cluster-autostart.sh` exists

#### Scenario: No task imports images into k3d

- **GIVEN** `Taskfile.yml` defines the task `brett:build`
- **WHEN** `Taskfile.yml` is searched for `k3d image import`
- **THEN** there is no match
