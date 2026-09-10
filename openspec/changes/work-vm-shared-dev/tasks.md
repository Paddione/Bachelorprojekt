---
title: "work-vm-shared-dev — Implementation Plan"
ticket_id: T900104
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# work-vm-shared-dev — Implementation Plan

_Ticket: T900104_

## File Structure

```
CHANGED:
  scripts/provision-dev-vm.sh
  prod/cloud-init-dev-vm.yaml
  scripts/install-dev-tools.sh
  environments/.secrets/.ssh/config
NEW:
  scripts/setup-shared-dev-repo.sh
  tests/spec/work-vm-shared-dev/work-vm-guards.bats
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS guard
      `tests/spec/work-vm-shared-dev/work-vm-guards.bats` asserting the NEW
      behavior: cloud-init ufw exposes NO 18080/18443/15432 ports, `install-dev-tools.sh`
      contains `gh`/`git-crypt`/`openspec` installs and a `DEV_USERS`-Liste,
      `setup-shared-dev-repo.sh` exists with group/ACL/ff-only-Timer steps, and
      `provision-dev-vm.sh` defaults to VMID 9003 / 10.0.0.27. On the current
      branch these assertions FAIL (old ports still open, tools missing, script
      absent).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/work-vm-shared-dev/
# expected: FAIL (red — the work VM provisioning does not exist yet)
```

- [ ] **Fix-Step (GREEN).** Implement in order:
      1. `scripts/provision-dev-vm.sh` — update default VMID/IP/WG for the fresh VM
         (9003 / 10.0.0.27 / 192.168.100.24), keep env-overrides, keep k3s-1-revival
         guard intact.
      2. `prod/cloud-init-dev-vm.yaml` — trim ufw to `22/tcp` + `51821/udp` (k3d
         Traefik 18080/18443 + Postgres 15432 rules removed), keep users
         `patrick`/`gekko` with the existing pubkeys and hardened sshd.
      3. `scripts/install-dev-tools.sh` — add pinned `gh` + `git-crypt` installs,
         `openspec` CLI install, replace single `DEV_USER` with `DEV_USERS` list
         loop (docker group + pnpm per user), keep k3d/go behind an opt-out flag
         (`SKIP_K3D_GO=1`) so the gekko-hetzner-2 path stays intact.
      4. `scripts/setup-shared-dev-repo.sh` (new, idempotent) — group `dev`,
         users to group, clone `--config core.sharedRepository=group` into
         `/srv/bachelorprojekt`, setgid + `setfacl -d -m g::rwX`, `umask 002`
         profile for both users, `git-crypt export-key` + unlock (key 640 root:dev),
         `git config merge.ours.driver true`, hooks install, ff-only systemd timer,
         `flock`-wrapped install helper.
      5. `environments/.secrets/.ssh/config` — aliases for the work VM
         (`work-vm` patrick variant, `work-vm/gekko` variant with `gekko_ed25519`).
      The BATS guards from the RED step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
