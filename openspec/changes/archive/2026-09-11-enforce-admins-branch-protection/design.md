# Design: Administrator branch-protection enforcement

## Root cause

`scripts/gh-branch-protection.sh` reads `enforce_admins.enabled` from the current GitHub
response and places that value unchanged into the replacement payload. A historical `false`
value therefore survives every apply, even though the CI/CD SSOT and audit script require
administrator enforcement.

## Decision

The apply script will set `ENFORCE_ADMINS=true` unconditionally. This is the smallest safe
change: the API payload already uses a full replacement, so explicitly setting the policy closes
the bypass without changing status-check selection, review options, restrictions, or merge mode.
The existing audit script remains the runtime assertion and the focused BATS test guards against
regressing to live-value preservation.

## Alternatives considered

- Preserve the live value and only improve the audit: rejected because repeated application would
  leave the known bypass open.
- Add an operator-only flag: rejected because the repository policy must be idempotent and safe
  for scheduled and manual invocations alike.

## Rollout

Merge the code through the normal pull-request path, then apply the resulting policy with the
admin-scoped GitHub token and run the live checker. No production workload or Kubernetes
resource is changed.
