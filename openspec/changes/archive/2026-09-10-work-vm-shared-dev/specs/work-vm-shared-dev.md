## ADDED Requirements

### Requirement: Dedicated work VM on the Proxmox dev host

The provisioning tooling SHALL create a dedicated Debian 12 cloud-init VM on the
Proxmox host `dev` (`scripts/provision-dev-vm.sh`, env-overridable VMID/IP/WireGuard
values), with a fresh VMID/IP as the default (VMID 9003, LAN 10.0.0.27 — the old
k3d-era VMID 9002/10.0.0.26 was rejected: stale k3d purpose, unknown state). The VM
SHALL enroll users `patrick` and `gekko` with their existing SSH pubkeys, harden
sshd (no password auth, `AllowUsers patrick gekko`), enable fail2ban, and restrict
ufw to SSH (22/tcp) — the k3d Traefik/Postgres ports of the old dev-vm cloud-init
(18080/18443/15432) SHALL NOT be opened. The VM SHALL NOT join the fleet cluster
and SHALL NOT run a k3d cluster.

#### Scenario: Provision a fresh work VM

- **GIVEN** the Proxmox host `dev` is reachable and `scripts/provision-dev-vm.sh` runs with default parameters
- **WHEN** the script completes
- **THEN** a VM with VMID 9003, static IP 10.0.0.27 and hostname `mentolder-dev` exists and boots
- **AND** both users `patrick` and `gekko` can log in via SSH with their existing keys
- **AND** the firewall exposes only SSH (22/tcp) besides WireGuard mesh (51821/udp)

### Requirement: Shared project clone with group ownership

The provisioning SHALL create a single shared git clone at `/srv/bachelorprojekt`
owned by a `dev` group that both users belong to, using `core.sharedRepository=group`,
setgid directories and default ACLs so new files inherit group write access
(`setfacl -d -m g::rwX`), with `umask 002` configured for both users. The clone
SHALL be git-crypt-unlocked once (per-clone lock, key file `640 root:dev`), install
the repo hooks and the `merge.ours` driver, and configure per-user git identity and
`gh` authentication in each user's home. The shared clone is the single source of
truth: any change any user sees is always the current state.

#### Scenario: Both users share one working tree

- **GIVEN** a provisioned work VM with the shared clone at `/srv/bachelorprojekt`
- **WHEN** user A commits a change and user B lists the files
- **THEN** user B sees user A's change without any pull (same working tree)
- **AND** `git-crypt status` shows `environments/.secrets/**` as unlocked for both

### Requirement: Up-to-date main without clobbering work

The main checkout SHALL be kept pull-only: a systemd timer runs `git pull --ff-only`
in the shared clone on a schedule, aborting loudly on divergence instead of
clobbering local changes. Parallel work SHALL happen in git worktrees
(`.worktrees/<slug>`) per repo convention, visible to both users. Concurrent
`npm install`/`pnpm install` runs SHALL be serialized via a `flock`-based wrapper
to protect the shared `node_modules`.

#### Scenario: Timer pull fails safe on dirty tree

- **GIVEN** an uncommitted local change in the shared clone
- **WHEN** the ff-only pull timer fires
- **THEN** the pull fails with a clear error and leaves the working tree untouched

### Requirement: Toolchain deltas on install-dev-tools.sh

`scripts/install-dev-tools.sh` SHALL additionally install `gh` and `git-crypt`, and
SHALL accept a list of dev users so both `patrick` and `gekko` are added to the
`docker` group and get `pnpm`. OpenSpec tooling SHALL be provided via the repo's
own wrapper `scripts/openspec.sh` (node-based, no separate binary — repository
convention). The script SHALL remain runnable for the gekko-hetzner-2 k3d path
(k3d/go stay, gated by env flags).

#### Scenario: Install toolchain for both users

- **GIVEN** `install-dev-tools.sh` runs with `FORCE=1 TARGET_HOST=mentolder-dev DEV_USERS="patrick gekko"`
- **WHEN** the script finishes
- **THEN** both users are in the `docker` group and `gh`, `git-crypt` are on PATH
- **AND** `task`, `node` 22, `npm`, `pnpm`, `kubectl` are present
- **AND** the script documents the openspec wrapper path (`scripts/openspec.sh`) instead of installing a separate binary

### Requirement: Script facts guarded by BATS

Tests under `tests/spec/work-vm-shared-dev/` SHALL assert the script facts without
provisioning a real VM (repo guard pattern, T002416): cloud-init enrolls both pubkey
fingerprints, install-dev-tools.sh contains gh/git-crypt and the DEV_USERS switch, ufw section does
not expose k3d/Postgres ports, and the shared-repo setup creates the group, ACLs and
ff-only timer.

#### Scenario: Guard detects regressed cloud-init

- **GIVEN** a regression re-introduces the 18080/18443 ufw rules into `prod/cloud-init-dev-vm.yaml`
- **WHEN** the BATS guard runs in CI
- **THEN** it fails with a message naming the offending firewall rule
