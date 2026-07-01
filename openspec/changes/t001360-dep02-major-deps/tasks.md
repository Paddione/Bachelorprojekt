---
title: "t001360-dep02-major-deps — Major Dependency Updates Plan"
ticket_id: T001360
domains: [quality, deps]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001360-dep02-major-deps — Major Dependency Updates Plan

_Ticket: T001360_

## File Structure

```
openspec/changes/t001360-dep02-major-deps/
  proposal.md       — why / what for this plan
  tasks.md          — task breakdown (this file)
  specs/            — future detailed specs
```

## Tasks

### T‑1: Audit current major dependency versions ✅

- [x] Audit filed at `specs/audit.md` (typescript 5→6, vitest 3→4 in scope; website majors deferred).
- Run the relevant dependency audit tool for this repo (e.g. `npm outdated` for Node packages, `go mod graph` for Go, or `task deps:audit`).
- For each major-level outdated dependency, record:
  - current version and latest version
  - semver major jump
  - changelog / breaking-change summary
- File the audit results as `openspec/changes/t001360-dep02-major-deps/specs/audit.md`.

### T‑2: Plan the update order and document each step

- Based on the audit, determine the dependency-update sequence that minimises conflict risk (e.g. bottom-up: transitive deps first, then direct deps; or by domain alignment).
- For each upgrade, decide whether a dedicated branch or in‑plan step is appropriate.
- Write the plan into `openspec/changes/t001360-dep02-major-deps/specs/update-plan.md`.

### T‑3: Implement and verify

- Execute the updates according to the order from T‑2.
- After each update, run `task test:changed` to validate the change.
- After all updates are complete, run:
  ```bash
  task freshness:regenerate
  task freshness:check
  ```
- Commit each self‑contained upgrade in a separate commit with a descriptive message (`chore(deps): upgrade X from a.b.c to x.y.z`).

## Verify

- [ ] Audit reflects the true state of the repo at branch HEAD.
- [ ] Update plan is conflict-free and preserves the existing test suite.
- [ ] `task test:changed` passes.
- [ ] `task freshness:regenerate && task freshness:check` passes.
