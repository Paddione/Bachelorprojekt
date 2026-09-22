# local-dev-mesh

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-dev-mesh ergänzen._

## Requirements

### Requirement: Dev peers join the tailnet with role tags

Every devmesh server SHALL be a member of the tailnet with the tag `tag:devmesh`, and every
developer client SHALL be a member with the tag `tag:devclient`. The repository SHALL hold the
peer inventory in `devmesh/inventory.yaml`, one entry per peer with `name`, `role`, `tag`,
`lan_ip` and `tailnet_name`. Tailscale auth keys SHALL NOT be committed.

#### Scenario: Inventory lists every peer with its tag

- **GIVEN** `devmesh/inventory.yaml`
- **WHEN** the inventory is parsed
- **THEN** every entry with `role: server` carries `tag: tag:devmesh`
- **AND** every entry with `role: client` carries `tag: tag:devclient`

#### Scenario: No auth key in the repository

- **GIVEN** the repository tree
- **WHEN** it is searched for the Tailscale auth-key prefix `tskey-`
- **THEN** no tracked file outside `environments/.secrets/` contains a match

### Requirement: LAN path is preferred, the tailnet relay is the fallback

A developer client inside the home network SHALL reach every devmesh server over a direct
path. A client outside the home network SHALL reach the same servers through the tailnet
without any inbound port forwarded on the home router.

#### Scenario: Client at home uses the direct path

- **GIVEN** PK-Desktop is inside the home network and Tailscale is running
- **WHEN** `bash scripts/devmesh/tailnet-check.sh` runs
- **THEN** every server is reported as `direct`
- **AND** the command exits 0

#### Scenario: Client away from home falls back to the relay

- **GIVEN** a developer client outside the home network with Tailscale running
- **WHEN** the check runs
- **THEN** every server is reported as `direct` or `relay`
- **AND** the command exits 0

### Requirement: Tailnet access policy is versioned in the repository

The intended tailnet access policy SHALL live in `devmesh/tailnet-policy.hujson`. It SHALL
allow `tag:devclient` to reach `tag:devmesh` on tcp ports 22, 443 and 6443, SHALL allow
unrestricted traffic between `tag:devmesh` peers, and SHALL NOT contain any rule whose
destination is `tag:devclient`. The only path from `tag:devmesh` into a developer client SHALL
be a single rule to the GPU workstation host alias `gpu-host` on the port recorded as
`gpu_endpoint` in `devmesh/inventory.yaml`.

#### Scenario: Policy grants no general path into developer clients

- **GIVEN** `devmesh/tailnet-policy.hujson`
- **WHEN** the policy guard parses its access rules
- **THEN** no rule names `tag:devclient` or `*` as a destination
- **AND** a rule from `tag:devclient` to `tag:devmesh` covering ports 22, 443 and 6443 exists

#### Scenario: GPU endpoint is the only exception

- **GIVEN** `devmesh/tailnet-policy.hujson` and `devmesh/inventory.yaml`
- **WHEN** the policy guard collects rules whose source is `tag:devmesh` and whose destination is not `tag:devmesh`
- **THEN** exactly one such rule exists, its destination is `gpu-host` and its port equals the port of `gpu_endpoint`

### Requirement: The tailnet check separates findings from missing preconditions

`scripts/devmesh/tailnet-check.sh` SHALL ping every inventory entry with `role: server` —
developer clients are not checked, because laptops and tablets are regularly offline. It SHALL
exit `0` when every server answers, `1` when at least one server does not answer, and `2` when a
precondition is missing — the Tailscale CLI
is unavailable or the local Tailscale service is not in state `Running`.

#### Scenario: A peer does not answer

- **GIVEN** the Tailscale service is running and one server is powered off
- **WHEN** the check runs
- **THEN** it exits 1 and names the unreachable server

#### Scenario: Tailscale service is not running

- **GIVEN** the local Tailscale service reports state `NoState`
- **WHEN** the check runs
- **THEN** it exits 2 rather than 1
- **AND** the output names the service state, not an unreachable peer

<!-- merged from change delta local-dev-mesh.md (9a94071bca37) -->

### Requirement: No active reference to the k3d dev context remains

The repository SHALL contain no reference to the former local k3d dev context outside
`openspec/changes/`, `docs/superpowers/plans/`, `docs/superpowers/specs/archive/`, `docs/adr/`,
`k3d/docs-content-built/`, `scripts/migrations/`, `docs/spec-atlas.md` and
`scripts/devmesh/migrate-from-k3d.sh` (which names the archived dump file, not a context). The guard
`tests/spec/local-dev-mesh/no-k3d-context.bats` SHALL hold the search pattern itself, so that
this requirement does not need to spell it. Context defaults in the factory and ticket tooling
SHALL resolve to `fleet`.

#### Scenario: Guard finds no active reference

- **GIVEN** the repository after this change
- **WHEN** `tests/spec/local-dev-mesh/no-k3d-context.bats` searches the tracked files outside
  the excluded paths
- **THEN** the search returns no match
- **AND** the same search run against an excluded archive path returns at least one match

#### Scenario: Factory context default

- **GIVEN** `FACTORY_CTX` is unset
- **WHEN** `scripts/factory/lib.sh` is sourced
- **THEN** `FACTORY_CTX` equals `fleet`

#### Scenario: Generated and historical paths stay excluded

- **GIVEN** `docs/spec-atlas.md` is generated from the specs and carries requirement titles
  verbatim, including the titles of removed requirements
- **WHEN** the guard builds its exclusion list
- **THEN** that file is excluded unconditionally, not while some change directory exists
- **AND** `scripts/devmesh/migrate-from-k3d.sh` is excluded, because the archived dump file is
  named after the cluster it came from

### Requirement: The fourth host joins devmesh as an agent

After the k3d teardown, `ws-ubuntu-1` SHALL join devmesh as a k3s agent with the tailnet tag
`tag:devmesh`, and the default `DEVMESH_PROFILE` SHALL be `full`.

#### Scenario: Four nodes after the join

- **GIVEN** the join completed
- **WHEN** `kubectl --context devmesh get nodes` runs
- **THEN** four nodes are `Ready` and `ws-ubuntu-1` has no control-plane role

<!-- merged from change delta local-dev-mesh.md (d5abbd95fb0e) -->

### Requirement: A devmesh host with a GPU offers it as a schedulable resource

A devmesh host that carries a GPU SHALL advertise it to the cluster as the extended
resource `nvidia.com/gpu`. The repository SHALL provide `dev-local/gpu/` as a
self-contained kustomize target holding the NVIDIA device plugin, applicable on its own
without rendering `dev-local/core`. Hosts with a GPU SHALL carry the node label
`gpu=true`, and the device plugin SHALL select on that label rather than running
cluster-wide.

#### Scenario: The node advertises the extended resource

- **GIVEN** a devmesh host labelled `gpu=true` with the container toolkit installed
- **WHEN** the device plugin from `dev-local/gpu/` is applied and becomes ready
- **THEN** the node's allocatable resources contain `nvidia.com/gpu` with a value of at least 1

#### Scenario: The GPU target stands alone

- **GIVEN** the repository tree
- **WHEN** `dev-local/gpu/` is built with kustomize
- **THEN** the build succeeds without resolving `dev-local/core` or `devmesh/inventory.yaml`

#### Scenario: The plugin is confined to GPU hosts

- **GIVEN** the device plugin manifest in `dev-local/gpu/`
- **WHEN** its pod spec is inspected
- **THEN** it carries a node selector requiring the label `gpu=true`

### Requirement: GPU enablement on a host is scripted and repeatable

The repository SHALL provide `scripts/devmesh/gpu-enable.sh`, which installs the
nvidia-container-toolkit on a target devmesh host, registers the nvidia runtime with
containerd and restarts k3s so that it picks the runtime up. The script SHALL be
idempotent: a second run against an already enabled host SHALL succeed without changing
state. Missing preconditions SHALL abort the run with exit code 2 and a message naming
the missing item, and SHALL NOT leave the host half-configured.

#### Scenario: Second run is a no-op

- **GIVEN** a host on which the script has already completed successfully
- **WHEN** the script runs again against the same host
- **THEN** it exits 0 and reports that the toolkit is already present
- **AND** it does not restart k3s

#### Scenario: A missing tool aborts before touching the host

- **GIVEN** an environment in which a required local tool is unavailable
- **WHEN** the script is invoked
- **THEN** it exits 2, names the missing tool, and issues no command against the host

#### Scenario: An unreachable host aborts the run

- **GIVEN** a target host that does not answer
- **WHEN** the script is invoked
- **THEN** it exits 2 and names the unreachable host

### Requirement: The status view reports GPU capacity

`scripts/devmesh/status.sh` SHALL report, per node, whether the cluster sees a GPU and how
many are allocatable. A node without a GPU SHALL be reported as such rather than omitted,
so that a missing device plugin is distinguishable from a host that has no card.

#### Scenario: Status separates "no GPU" from "GPU not offered"

- **GIVEN** a cluster in which one node carries a GPU and others do not
- **WHEN** `scripts/devmesh/status.sh` runs
- **THEN** every node appears with its GPU count
- **AND** a node carrying a card but advertising no `nvidia.com/gpu` is marked as such

<!-- merged from change delta local-dev-mesh.md (c1fe4357461c) -->

### Requirement: Cluster nodes meet the Longhorn preconditions

Every devmesh server SHALL satisfy the Longhorn 1.11.2 preconditions before
installation: `open-iscsi` installed with `iscsid` running and `iscsi_tcp`
loaded, NFSv4 client (`nfs-common`), `cryptsetup` with `dm_crypt`,
`device-mapper`, ext4/XFS support and active mount propagation. A script
`scripts/devmesh/longhorn-prereqs.sh` SHALL establish them idempotently.

#### Scenario: Preconditions converge on a second run

- **GIVEN** a devmesh server where preconditions were established once
- **WHEN** `bash scripts/devmesh/longhorn-prereqs.sh <host>` runs again
- **THEN** it exits 0 without changing the system (idempotent)

#### Scenario: Missing iscsid is reported as failed precondition

- **GIVEN** a server without running `iscsid`
- **WHEN** the preconditions check runs
- **THEN** it exits non-zero and names the missing component

### Requirement: Longhorn is the default StorageClass on devmesh

Longhorn 1.11.2 (per `environments/versions.yaml` SSOT) SHALL be installed on
context `devmesh`, `local-path` SHALL lose its default flag, and every node's
disks SHALL be registered in the Longhorn node configuration. The legacy
installer `k3d/dev-cluster/longhorn-install.sh` (v1.7.2, context `devc`) SHALL
be replaced.

#### Scenario: Only Longhorn carries the default flag

- **GIVEN** context `devmesh` after installation
- **WHEN** StorageClasses are listed
- **THEN** exactly one has the `is-default-class` annotation set to true and it
  is the Longhorn class

#### Scenario: No reference to the dead context remains

- **GIVEN** the repository tree
- **WHEN** it is searched for `devc` in Longhorn install paths
- **THEN** no match remains outside archived history

### Requirement: git-crypt unlocks via GPG users in dev-shell

The dev-shell image SHALL contain `gnupg` and `pinentry-tty`, the GPG keys of
patrick and gekko SHALL be enrolled via `git-crypt add-gpg-user` (key files
committed under `.git-crypt/keys/`), and `git-crypt unlock` SHALL work without
a symmetric keyfile. The GPG private key material SHALL live under `/home/dev`
with the threat model from the key-distribution runbook.

#### Scenario: Unlock works without keyfile

- **GIVEN** a fresh clone on an onboarded machine with GPG key available
- **WHEN** `git-crypt unlock` runs without any keyfile present
- **THEN** it exits 0 and encrypted paths decrypt

#### Scenario: Image contains gnupg

- **GIVEN** `docker/dev-shell/Dockerfile`
- **WHEN** it is searched for `gnupg`
- **THEN** at least one match exists

### Requirement: devmesh hosts the CPU-bound LLM and database services
<!-- bats: local-dev-mesh/llm-services.bats -->

The devmesh stack SHALL provide a `llm-services` component that runs the LLM proxy, the bge-mcp
shim and the mcp-postgres server in one Deployment built from the `mcp-node` image. The
component SHALL expose them through one Service on ports 18235, 13001 and 13005. The GPU-bound
backends SHALL stay on the Windows side of the dev workstation.

#### Scenario: The rendered stack contains the component

- **GIVEN** the devmesh stack is rendered with `scripts/devmesh/render-stack.sh`
- **WHEN** the output is inspected
- **THEN** it contains the `llm-services` Deployment and a Service exposing ports 18235, 13001
  and 13005

#### Scenario: Only the three services start in the component

- **GIVEN** the `llm-services` Deployment sets the supervisor service selection
- **WHEN** the `mcp-node` supervisor starts
- **THEN** it starts the LLM proxy, mcp-postgres and bge-mcp, and no other server

### Requirement: The GPU endpoint exposes one port per workstation GPU service
<!-- bats: local-dev-mesh/llm-services.bats -->

The `llm-gateway-host` Service SHALL declare one named port for every GPU service listed in
`gpu_endpoint.ports` of the devmesh inventory, and its EndpointSlice SHALL point all of them at
the tailnet address of the GPU workstation.

#### Scenario: Every inventory port is rendered

- **GIVEN** `gpu_endpoint.ports` lists the workstation GPU services
- **WHEN** the stack is rendered
- **THEN** the Service and the EndpointSlice carry one port per listed service

### Requirement: The devmesh backend registry contains no loopback URLs
<!-- bats: local-dev-mesh/llm-services.bats -->

The devmesh database SHALL hold its own `tickets.llm_proxy_backends` table, seeded by a
migration. No seeded `base_url` SHALL use a loopback address, because loopback inside the pod
does not reach the workstation or the cluster services.

#### Scenario: The seed migration is checked for loopback URLs

- **GIVEN** the devmesh registry seed migration
- **WHEN** its `base_url` values are inspected
- **THEN** none of them contains `127.0.0.1` or `localhost`

<!-- merged from change delta local-dev-mesh.md (ac6fd9ad8785) -->

### Requirement: shared-db-backup toleriert den Pod-Startup-Netzwerk-Race

Das `shared-db-backup` CronJob-Script SHALL vor dem `pg_dumpall`-Lauf auf DB-Erreichbarkeit
warten (`pg_isready`-Retry-Schleife mit konfigurierbarem Wartebudget), statt beim ersten
Verbindungsversuch sofort aufzugeben. Damit uebersteht der Job den Container-Start-Race, bei
dem kube-proxy/CNI die Service-Routing-Regeln fuer eine frisch erzeugte Pod-Netns noch nicht
synchronisiert haben.

#### Scenario: DB wird erst nach ein paar Sekunden erreichbar

- **GIVEN** `pg_isready` gegen `$PGHOST` schlaegt bei den ersten Versuchen fehl (Startup-Race)
- **WHEN** `db-backup.sh` laeuft
- **THEN** wartet das Script (mit Sleep zwischen den Versuchen) und startet `pg_dumpall`
  erst, nachdem `pg_isready` Erfolg meldet — der Dump wird geschrieben

#### Scenario: DB bleibt dauerhaft nicht erreichbar

- **GIVEN** `pg_isready` gegen `$PGHOST` schlaegt bei jedem Versuch bis zum Wartebudget fehl
- **WHEN** `db-backup.sh` laeuft
- **THEN** bricht das Script nach Ausschoepfen des Wartebudgets mit Exit-Code != 0 ab, es
  bleibt kein Teil-Dump (`*.part`) liegen, und das Pruning der bestehenden Dumps wird nicht
  ausgefuehrt

<!-- merged from change delta local-dev-mesh.md (2d949ee0676f) -->

### Requirement: The k3d migration verifies row counts against the archived dump
<!-- bats: local-dev-mesh/migrate-from-k3d.bats -->

`scripts/devmesh/migrate-from-k3d.sh` SHALL take its source row counts from the archived
`pg_dumpall` dump of the former local k3d cluster, not from a kubeconfig context. The dump path
SHALL be overridable through `DEVMESH_SRC_DUMP`. The script SHALL count the rows of every `COPY`
block per database in that dump and compare them table by table against the devmesh
`shared-db`. The script SHALL NOT write to the dump and SHALL NOT offer a restore subcommand,
because a cluster dump can only be replayed with `DROP DATABASE` on the target.

#### Scenario: Counts are taken from the dump

- **GIVEN** a `pg_dumpall` dump containing `COPY` blocks for two databases
- **WHEN** the `counts` subcommand runs
- **THEN** one count file per database is written
- **AND** each line names a table and its row count from the dump

#### Scenario: Matching row counts pass

- **GIVEN** the devmesh database reports the same row count for every table in the dump
- **WHEN** the `verify` subcommand runs
- **THEN** it exits `0` and names each matching table

#### Scenario: A differing table is named and fails

- **GIVEN** one table in devmesh reports a different row count than the dump
- **WHEN** the `verify` subcommand runs
- **THEN** it exits non-zero and names that table with both counts

#### Scenario: A missing dump is a precondition, not a finding

- **GIVEN** `DEVMESH_SRC_DUMP` points at a path that does not exist
- **WHEN** the `preflight` subcommand runs
- **THEN** it exits `2` and names the missing path

#### Scenario: Production is refused as target

- **GIVEN** `DEVMESH_DST_CTX` is set to `fleet`
- **WHEN** any subcommand runs
- **THEN** it exits non-zero before the first `kubectl` call

<!-- merged from change delta local-dev-mesh.md (cf42bee2eb5f) -->

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

<!-- merged from change delta local-dev-mesh.md (811d1bf097a7) -->