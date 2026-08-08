---
title: "flux-artifact-versioning — Implementation Plan"
ticket_id: T002706
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# flux-artifact-versioning — Implementation Plan

_Ticket: T002706_

## File Structure

```
.github/workflows/render-fleet-artifact.yml
Taskfile.yml
environments/fleet-korczewski.yaml
environments/fleet-mentolder.yaml
environments/schema.yaml
prod-fleet/korczewski/brett-patch.yaml
prod-fleet/mentolder/brett-patch.yaml
prod-fleet/website-korczewski/website-patch.yaml
prod-fleet/website-mentolder/website-patch.yaml
scripts/flux-render-artifact.sh
scripts/resolve-image-digest.sh
tests/spec/flux-artifact-versioning/flux-artifact-versioning.bats
tests/spec/flux-render-security/immutable-image-refs.bats
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/flux-render-security/immutable-image-refs.bats
# expected: FAIL (red — website & brett images render with :latest instead of @sha256:)
```

- [x] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

