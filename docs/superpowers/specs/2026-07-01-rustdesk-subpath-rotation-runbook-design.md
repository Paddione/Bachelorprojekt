---
ticket_id: T001382
plan_ref: openspec/changes/rustdesk-subpath-rotation-runbook/tasks.md
status: active
date: 2026-07-01
---

# rustdesk-subpath-rotation-runbook — Fix Design

## Root Cause

`k3d/rustdesk-stack/hbbs.yaml` (Deployment `hbbs`, namespace `rustdesk`) mounts the
RustDesk ed25519 signing keypair from Secret `rustdesk-secrets` using `subPath`:

```yaml
volumeMounts:
  - name: keys
    mountPath: /root/id_ed25519
    subPath: id_ed25519
    readOnly: true
  - name: keys
    mountPath: /root/id_ed25519.pub
    subPath: id_ed25519.pub
    readOnly: true
```

Kubernetes' kubelet does not live-update `subPath`-mounted files inside an already-running
container when the underlying Secret changes — this is a documented kubelet limitation
(subPath bind-mounts bypass the atomic `..data` symlink-swap that whole-volume mounts get).
Consequence: after rotating the `rustdesk-secrets` keypair (`task env:seal` + re-apply), the
running `hbbs` pod keeps using the stale key material until it is recreated.

## Investigated fix options

**(a) Restructure the mount (whole-secret + symlink) to get live-reload without restart.**
Ruled out after concrete verification:

- `hbbs`'s `workingDir` is `/root`, which is also where `hbbs` (rustdesk-server 1.1.15)
  writes its runtime sled/sqlite state. A whole-Secret volume mount is always read-only, so
  it cannot be mounted directly over `/root` without breaking that runtime state write path.
- The standard workaround (mount the whole Secret at a side directory, e.g.
  `/etc/rustdesk-keys`, and `ln -s` it into `/root/id_ed25519(.pub)` from a shell at
  container start) requires `/bin/sh` in the image. Verified empirically:
  ```
  $ docker run --rm --entrypoint sh rustdesk/rustdesk-server:1.1.15@sha256:10818ec0... -c 'true'
  OCI runtime create failed: ... exec: "sh": executable file not found in $PATH
  ```
  The image ships a static binary with no shell — confirmed via `docker manifest inspect`
  cross-arch layers and a direct `docker run --entrypoint sh` probe (exit 127, "executable
  file not found in $PATH").
- Workaround for the missing shell would require adding a second helper image
  (busybox/alpine) as an `initContainer` sharing an `emptyDir` at `/root` with the main
  container, plus mounting the whole Secret at a side path in *both* containers so the
  symlink target resolves in the main container's own mount namespace. This restructures a
  production, `hostNetwork: true`, `strategy: Recreate` relay pod's volume topology
  (an `emptyDir` in place of the container's writable root layer for its runtime db) for a
  marginal benefit: the actual acceptance bar (see ticket) explicitly allows
  "restart-to-reload" as normal UX, so full live-reload isn't a hard requirement.
- Crucially: this Deployment already uses `strategy: Recreate`. A `kubectl rollout restart`
  deletes the old pod and schedules a brand-new one; kubelet sets up ALL volume mounts for a
  new pod — including `subPath` ones — by reading the Secret's *current* content at mount
  time. The "subPath doesn't live-update" limitation only affects a file already mounted into
  a *running* container; it does not survive pod recreation. So a manual rollout restart
  already is a complete, correct fix for stale key material — it is just an *undocumented,
  unautomated manual step* today.

Given this, restructuring the mount to avoid the restart altogether is unjustified
complexity/risk on a production hostNetwork relay for a problem that a restart already
fully resolves.

**(b) Chosen: document the footgun as an explicit runbook + regression-guarding test.**
Add a new Requirement to `openspec/specs/rustdesk-server.md` (SSOT, alongside the existing
`REQ-RUSTDESK-RELAY-002` about keypair persistence) mandating
`kubectl --context fleet -n rustdesk rollout restart deployment/hbbs` after any
`rustdesk-secrets` rotation, and guard both (1) that `hbbs.yaml` still uses `subPath` (so a
future refactor away from `subPath` doesn't silently invalidate this runbook without
updating it) and (2) that the runbook text exists in the SSOT spec, via new `@test` cases in
`tests/spec/rustdesk-server.bats`.

## Fix approach

1. `openspec/specs/rustdesk-server.md` gets a new Requirement
   `REQ-RUSTDESK-RELAY-006 — Secret-Rotation-Runbook für hbbs subPath-Mount` with a Scenario
   describing the required manual rollout restart after rotation.
2. `tests/spec/rustdesk-server.bats` gets two new `@test` cases:
   - `hbbs.yaml` still mounts the keypair via `subPath` (guards the runbook's premise).
   - the SSOT spec contains the `rollout restart deployment/hbbs` runbook instruction.
3. No manifest/behavior change to `k3d/rustdesk-stack/hbbs.yaml` itself — this is a
   documentation + regression-test fix, matching CFR-Gate G-DORA03 (ticketed bug, no silent
   `fix()` commit).

## Edge cases / out of scope

- `resources:` and hostNetwork/port config in `hbbs.yaml` — untouched (explicitly out of
  scope per ticket).
- No live cluster action taken as part of this ticket (no rotation is being performed here);
  the runbook step itself is a live-cluster action for a future rotation, not part of this
  fix's verification.
- `hbbr` (the relay, not the ID server) has no equivalent keypair mount and is unaffected.
