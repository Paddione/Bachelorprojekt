# Proposal: rustdesk-subpath-rotation-runbook

## Why

`k3d/rustdesk-stack/hbbs.yaml` mounts the RustDesk ed25519 signing keypair from Secret
`rustdesk-secrets` using `subPath` (`mountPath: /root/id_ed25519`, `subPath: id_ed25519`, and
the `.pub` counterpart). Kubernetes' kubelet does not live-update `subPath`-mounted files in
an already-running container when the backing Secret changes — a documented kubelet
limitation (subPath bind-mounts bypass the atomic `..data` symlink-swap that whole-volume
mounts get). Rotating `rustdesk-secrets` therefore silently has no effect on the running
`hbbs` pod, and nothing in the repo documents or automates the required remediation step.

This is a regression-class operational bug (T001382, Bug-Triage-Konvention CFR-Gate
G-DORA03), not a new feature.

Investigated and ruled out a mount-restructuring fix (whole-Secret mount at a side path +
symlink into `/root/id_ed25519`, to get true live-reload without a restart): the
`rustdesk/rustdesk-server:1.1.15` image has no `/bin/sh` (verified via
`docker run --rm --entrypoint sh ... -c 'true'` → exit 127, "executable file not found in
$PATH"), ruling out an in-container symlink step without adding a second helper image as an
`initContainer` and restructuring `/root` (also `hbbs`'s `workingDir` for its runtime
sled/sqlite state) into a shared `emptyDir`. That is meaningful complexity/risk on a
production, `hostNetwork: true`, `strategy: Recreate` relay pod for marginal benefit: this
Deployment's `strategy: Recreate` means a `kubectl rollout restart` already deletes and
recreates the pod, and kubelet sets up ALL volume mounts for a brand-new pod — including
`subPath` ones — by reading the Secret's *current* content at mount time. The "subPath
doesn't live-update" limitation only applies to a file already mounted into a *running*
container; it does not survive pod recreation. A manual rollout restart today is already a
complete, correct remediation — it's just undocumented and unautomated.

## What

- New Requirement `REQ-RUSTDESK-RELAY-006` in the SSOT spec
  (`openspec/specs/rustdesk-server.md`) documenting the Secret-Rotation Runbook: after any
  `rustdesk-secrets` rotation (`task env:seal` + re-apply), a
  `kubectl --context fleet -n rustdesk rollout restart deployment/hbbs` MUST be run, because
  the keypair is `subPath`-mounted and does not live-update in a running pod.
- Two new failing→passing BATS assertions in `tests/spec/rustdesk-server.bats` (already
  written, red-confirmed against the current spec):
  - `hbbs.yaml` still mounts the keypair via `subPath` (guards the runbook's premise so a
    future mount refactor doesn't silently leave stale documentation behind).
  - the SSOT spec contains the `rollout restart deployment/hbbs` runbook instruction.
- Explicit non-goals: no change to `k3d/rustdesk-stack/hbbs.yaml` itself (no manifest/behavior
  change — this is a documentation + regression-test fix); no `resources:`/hostNetwork/port
  changes (out of scope per ticket); no live-cluster rotation performed as part of this
  ticket (the runbook step is for a *future* rotation).

_Ticket: T001382_
