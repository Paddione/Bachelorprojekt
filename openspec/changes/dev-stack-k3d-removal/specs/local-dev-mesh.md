## MODIFIED Requirements

### Requirement: The repository ships no local k3d cluster tooling

The repository SHALL NOT contain tooling that creates, starts, stops, resets or imports images
into a local k3d cluster, because the local development stack runs on the k3s cluster `devmesh`
(ADR-008) and the k3d binary no longer exists on any target host. Concretely, `k3d-config.yaml`,
`k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh`,
`scripts/dev-cluster-autostart.sh`, `taskfiles/Taskfile.staging.yml`, `scripts/staging-id.sh`,
`k3d/staging-stack/`, `k3d/dev-stack/cert-manager.yaml` and `k3d/dev-stack/traefik-tls.yaml`
SHALL NOT exist; `Taskfile.yml` SHALL NOT define the tasks
`cluster:create`, `cluster:delete`, `cluster:start`, `cluster:stop`, `cluster:status`, `up`,
`down`, `workspace:up`, `dev:reset`, `website:build:import`, `einvoice-sidecar:import`,
`dev:build:website`, `dev:build:brett`, `dev:apply`, `dev:deploy` or `dev:firewall:open`, and
neither `Taskfile.yml` nor any file under `taskfiles/` SHALL invoke `k3d image import`. The
directory `k3d/` stays, because it holds the production Kustomize base, and `k3d/dev-stack/`
stays, because Flux renders it into `workspace-dev` on `fleet`. Tools that document or verify
the completed decommission (`scripts/devmesh/`) are out of scope of this requirement.

#### Scenario: Removed tasks are absent while deploy tasks remain

- **GIVEN** the repository at `HEAD`
- **WHEN** the task list is read with `task --list-all --json` in the repository root
- **THEN** it lists `workspace:deploy` and `dev:redeploy:website` and lists none of
  `cluster:create`, `cluster:delete`, `cluster:start`, `cluster:stop`, `cluster:status`,
  `workspace:up`, `dev:reset`, `website:build:import`, `einvoice-sidecar:import`,
  `dev:build:website`, `dev:build:brett`, `dev:apply`, `dev:deploy`, `dev:firewall:open` or any
  task starting with `staging:`

#### Scenario: Removed files are absent while the production base remains

- **GIVEN** the repository at `HEAD`
- **WHEN** the file system is inspected
- **THEN** `k3d/kustomization.yaml` and `k3d/dev-stack/kustomization.yaml` exist and none of
  `k3d-config.yaml`, `k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh`,
  `scripts/dev-cluster-autostart.sh`, `taskfiles/Taskfile.staging.yml`,
  `scripts/staging-id.sh`, `k3d/staging-stack`, `k3d/dev-stack/cert-manager.yaml` or
  `k3d/dev-stack/traefik-tls.yaml` exists

#### Scenario: No task imports images into k3d

- **GIVEN** `Taskfile.yml` defines the task `brett:build`
- **WHEN** `Taskfile.yml` and every file under `taskfiles/` are searched for `k3d image import`
- **THEN** there is no match

## ADDED Requirements

### Requirement: Dev redeploy pulls the CI-built dev image

The tasks `dev:redeploy:website` and `dev:redeploy:brett` SHALL NOT build images locally. They
SHALL restart the corresponding Deployment in `NS_DEV` (default `workspace-dev`) on `CTX_DEV`
(default `fleet`) and wait for the rollout, so that the cluster pulls the `:dev` image that CI
publishes to ghcr.io (`build-website.yml`, `build-brett.yml`). Because `:dev` is a mutable tag,
the Deployments in `k3d/dev-stack/website-dev.yaml` and `k3d/dev-stack/brett-dev.yaml` SHALL set
`imagePullPolicy: Always`; with `IfNotPresent` a restart would keep the cached image.

#### Scenario: Redeploy restarts without a local build

- **GIVEN** the repository at `HEAD`
- **WHEN** `task --dry dev:redeploy:website` is run
- **THEN** the printed commands contain `rollout restart` and contain neither `docker build` nor
  `ssh`

#### Scenario: Dev deployments always pull the mutable tag

- **GIVEN** `k3d/dev-stack/website-dev.yaml` and `k3d/dev-stack/brett-dev.yaml`
- **WHEN** their container specs are read
- **THEN** each container that uses a `:dev` image sets `imagePullPolicy: Always`

### Requirement: Dev secrets are materialised by an explicit task

`workspace-dev` receives the Secrets `ghcr-pull-secret`, `shared-db-dev-secrets` and
`workspace-secrets` from no Flux source. The task `dev:secrets` SHALL create or update them in
`NS_DEV` on `CTX_DEV` from `environments/.secrets/<ENV>.yaml`, and SHALL be callable on its own.
It SHALL NOT write into any namespace other than `NS_DEV`, and SHALL NOT write objects that Flux
owns in `workspace-dev` (e.g. the ConfigMap `sish-authorized-keys`), because `CTX_DEV` defaults
to the production cluster `fleet`.

#### Scenario: The secrets task stays inside the dev namespace

- **GIVEN** the repository at `HEAD`
- **WHEN** `task --dry dev:secrets` is run
- **THEN** the printed commands target `workspace-dev`, and contain neither `-n cert-manager`,
  `helm` nor `sish-authorized-keys`
