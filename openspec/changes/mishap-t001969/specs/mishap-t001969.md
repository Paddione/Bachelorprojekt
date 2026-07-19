---
title: "mishap-t001969 — implementer monitor, ghcr secret, subagent timeout"
ticket_id: T001969
---

## ADDED Requirements

### Requirement: implementer subagent forbids background monitors during test runs

WHEN a subagent is invoked via the `dev-flow-execute` implementer role
AND the task involves running tests, CI polls, or any other long-running
verification
THEN the implementer MUST execute those calls synchronously with an
explicit timeout
AND MUST NOT start background tasks (e.g. `task test:changed` + poll)
that block on a monitor loop.

### Requirement: ghcr-pull-secret managed via SealedSecret

WHEN a Kubernetes manifest in `k3d/` references `imagePullSecrets: ghcr-pull-secret`
THEN the secret MUST be defined as a SealedSecret (not a manual
kubectl-apply) with `ownerReferences` to each referencing workload
AND a CronJob MUST run every 6 hours to validate the underlying token
is not expired.

### Requirement: background-agents timeout and fallback

WHEN `qwen35-iq4` is delegated via `.opencode/plugins/background-agents.ts`
THEN the default max run time MUST be at least 25 minutes
AND if the delegation returns empty output before timeout
THEN the plugin MUST retry once with `qwen35-hq` as fallback before
marking the delegation as failed.
