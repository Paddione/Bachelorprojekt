## REMOVED Requirements

### Requirement: Dedicated work VM on the Proxmox dev host

Superseded by ADR-008: developers work on their own machines; see `dev-machine-onboarding`.

### Requirement: Shared project clone with group ownership

Superseded by `dev-machine-onboarding` — one clone per machine.

### Requirement: Up-to-date main without clobbering work

The pull timer and install lock only protected a shared clone, which no longer exists.

### Requirement: Toolchain deltas on install-dev-tools.sh

Superseded by `dev-machine-onboarding` — the toolchain is installed for the invoking user.

### Requirement: Script facts guarded by BATS

The guarded VM scripts are removed together with `tests/spec/work-vm-shared-dev/`.
