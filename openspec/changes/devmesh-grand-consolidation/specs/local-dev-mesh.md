## ADDED Requirements

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

### Requirement: k3d-mentolder-dev is decommissioned after devmesh acceptance

`k3d-mentolder-dev` SHALL be torn down only after `scripts/devmesh/acceptance.sh`
passes on devmesh and data migration (`migrate-from-k3d.sh`) is verified.
FACTORY_CTX, Taskfile.sdlc, guards and CLAUDE.md rules SHALL point at devmesh,
and no live reference to the k3d context SHALL remain.

#### Scenario: Teardown is gated on acceptance

- **GIVEN** a failed or skipped devmesh acceptance run
- **WHEN** the decommission sequence is invoked
- **THEN** `k3d-teardown.sh` is not executed and the sequence exits non-zero

#### Scenario: No live k3d reference remains

- **GIVEN** the repository tree after decommission
- **WHEN** factory config, Taskfile and guards are searched for
  `k3d-mentolder-dev` / `mentolder-dev`
- **THEN** no match remains outside `openspec/changes/archive/` history
