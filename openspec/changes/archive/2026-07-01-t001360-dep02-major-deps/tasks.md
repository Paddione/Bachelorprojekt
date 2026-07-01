---
title: "t001360-dep02-major-deps — Major Dependency Updates Plan"
ticket_id: T001360
domains: [quality, deps]
status: completed
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

- [x] Audit filed at `audit.md` (vitest 3→4 in scope; typescript 6 blocked by madge peer range; website majors deferred).
- Run the relevant dependency audit tool for this repo (e.g. `npm outdated` for Node packages, `go mod graph` for Go, or `task deps:audit`).
- For each major-level outdated dependency, record:
  - current version and latest version
  - semver major jump
  - changelog / breaking-change summary
- File the audit results as `openspec/changes/t001360-dep02-major-deps/specs/audit.md`.

### T‑2: Plan the update order and document each step ✅

- [x] Update order documented at `update-plan.md` (single-commit root npm bump; conflict-free).
- Based on the audit, determine the dependency-update sequence that minimises conflict risk (e.g. bottom-up: transitive deps first, then direct deps; or by domain alignment).
- For each upgrade, decide whether a dedicated branch or in‑plan step is appropriate.
- Write the plan into `openspec/changes/t001360-dep02-major-deps/specs/update-plan.md`.

### T‑3: Implement and verify ✅

- [x] vitest 3.2.6→4.1.9 upgraded in root `package.json` + lockfile; vitest/openspec/agent-guide/code-quality tests green; freshness regenerated. typescript 6 deferred (madge@8 `peerOptional typescript@^5.4.4` fails `npm ci`).
- Execute the updates according to the order from T‑2.
- After each update, run `task test:changed` to validate the change.
- After all updates are complete, run:
  ```bash
  task freshness:regenerate
  task freshness:check
  ```
- Commit each self‑contained upgrade in a separate commit with a descriptive message (`chore(deps): upgrade X from a.b.c to x.y.z`).

## Verify

- [x] Audit reflects the true state of the repo at branch HEAD.
- [x] Update plan is conflict-free and preserves the existing test suite.
- [x] `task test:changed` passes (only pre-existing, unrelated failures remain — see update-plan.md).
- [x] `task freshness:regenerate && task freshness:check` passes.
