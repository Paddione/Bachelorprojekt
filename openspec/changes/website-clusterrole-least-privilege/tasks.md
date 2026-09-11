---
title: "website-clusterrole-least-privilege — Implementation Plan"
ticket_id: T900114
domains: [security, k8s, manifests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-clusterrole-least-privilege — Implementation Plan

_Ticket: T900114_

## File Structure

```
k3d/website.yaml
k3d/website-test-runner-rbac.yaml
tests/spec/security/website-clusterrole-least-privilege.bats
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test suite reproducing the clusterwide write permissions. The test must FAIL on the current branch. Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/website-clusterrole-least-privilege.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Restrict the website ClusterRole to pure read-only verbs (remove pods: delete, argoproj.io, deployments: patch, jobs: create) and delegate write permissions to namespaced Roles in the website namespace and workspace namespace.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
