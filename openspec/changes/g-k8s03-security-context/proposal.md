# Proposal: g-k8s03-security-context

_Ticket: T001295_

## Why

Kubernetes Pod Security Standards (PSS) classify containers that run without a `securityContext` as Baseline-non-compliant and often as Privileged-equivalent. Without explicit security constraints, a compromised container process can escalate privileges, access the host kernel capabilities, or pivot within the cluster. Of the 34 Deployments in this workspace, three ship with neither a pod-level nor a complete container-level `securityContext`: `livekit-egress`, `sealed-secrets-controller`, and `sessions-server`. The `sealed-secrets-controller` is especially sensitive because it holds the cluster's private RSA key used to decrypt all SealedSecrets — any privilege escalation in that container could compromise every production secret.

Adding even a minimal `securityContext` closes the most common escalation vectors (privilege escalation via setuid/setgid binaries, dangerous Linux capabilities inherited from the container runtime default set) and satisfies the `G-K8S03` health-gate target of 0 uncovered Deployments.

## What

Three manifest files are edited in the `k3d/` base:

- **`k3d/livekit.yaml`** — The `livekit-egress` Deployment receives a container-level `securityContext` with `allowPrivilegeEscalation: false`. The `runAsNonRoot` constraint is intentionally omitted for this container because the official `livekit/egress` image launches Chromium and Xvfb as root; adding `runAsNonRoot: true` would cause an immediate pod startup failure. `allowPrivilegeEscalation: false` is sufficient to satisfy the measure-command check and closes the most critical vector.

- **`k3d/sealed-secrets-controller.yaml`** — The `sealed-secrets-controller` Deployment receives a container-level `securityContext` with the full minimal set: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`. The Bitnami image (UID 1001) is designed to run as non-root and supports all three constraints without modification.

- **`k3d/sessions-server.yaml`** — The `sessions-server` Deployment receives a container-level `securityContext` with `allowPrivilegeEscalation: false`. The `runAsNonRoot` constraint and a full `capabilities.drop: [ALL]` are omitted because the stock `nginx:1.27-alpine` image binds port 80 from the master process running as root, and dropping `NET_BIND_SERVICE` would prevent the container from starting. `allowPrivilegeEscalation: false` is the safe, non-breaking baseline for this image.

The `sealed-secrets-controller.yaml` file is applied outside the main `k3d/kustomization.yaml` flow (via `task sealed-secrets:install`), so no kustomize overlay patch is required — the base file itself is the canonical source.

## Impact

**Changed files:**
- `k3d/livekit.yaml` (container securityContext added to the `livekit-egress` Deployment)
- `k3d/sealed-secrets-controller.yaml` (container securityContext added to the `sealed-secrets-controller` Deployment)
- `k3d/sessions-server.yaml` (container securityContext added to the `sessions-server` Deployment)

**Risks:**
- `livekit-egress` is a media-recording container that internally runs a Chromium browser. The `allowPrivilegeEscalation: false` constraint should be compatible, but a smoke-test after deployment is advisable before recording a session.
- nginx in `sessions-server` requires the root process for port 80; the securityContext added here does not break that, but future hardening (moving to a non-privileged port or `NET_BIND_SERVICE`) is out of scope for this change.

**Out of scope:**
- Migrating `sessions-server` to a non-root nginx image or non-privileged port
- Adding `runAsNonRoot: true` to `livekit-egress`
- Adding `seccompProfile` or `AppArmor` annotations to any Deployment
- Modifying the 31 Deployments that already have a valid securityContext
