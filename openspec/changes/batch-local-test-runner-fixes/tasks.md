---
title: "batch-local-test-runner-fixes — Implementation Plan"
ticket_id: T004296
domains: [website, tests, ci, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-local-test-runner-fixes — Implementation Plan

_Ticket: T004296_

## File Structure

```
website/src/lib/sdlc/tickets/__tests__/cockpit-api.test.ts
website/src/lib/sdlc/tickets/__tests__/cockpit-api-actions.test.ts
Taskfile.yml
scripts/code-quality/gates/s2-cycles.mjs
tests/spec/batch-local-test-runner-fixes/runner-fixes.bats
```

## Tasks

- [ ] **P1 (T003963): Fix relative mock paths in Cockpit Vitest suite**
  - Update `vi.mock('../../../lib/auth')` → `vi.mock('../../../../lib/auth')` in `website/src/lib/sdlc/tickets/__tests__/cockpit-api.test.ts` and `cockpit-api-actions.test.ts`.
  - Update `vi.mock('../../../lib/tickets/cockpit-db')` → `vi.mock('../../../../lib/sdlc/tickets/cockpit-db')`.
  - Verify all 53 tests in `website/src/lib/sdlc/tickets/__tests__/` pass.

- [ ] **P2 (T003990): Add port 4321 reachability check for RUN_E2E_WEBSITE in Taskfile.yml**
  - Wrap `RUN_E2E_WEBSITE` in Taskfile.yml with `if (exec 3<>/dev/tcp/127.0.0.1/4321) 2>/dev/null; then ... else ... skip notice ... fi` identical to `RUN_E2E_SERVICES`.
  - Prevent 10+ min timeout when running `task test:changed` locally without active Astro dev server.

- [ ] **P3 (T004263): Robust madge executable resolution in s2-cycles.mjs**
  - Search for `madge` executable across `join(repoRoot, 'node_modules', '.bin', 'madge')`, `join(process.cwd(), 'node_modules', '.bin', 'madge')`, or resolve via `which madge` / PATH before invoking.
  - Provide fallback / clean diagnostic instead of raw ENOENT crash.

- [ ] **P4: Integration BATS tests for local test runner fixes**
  - Add `tests/spec/batch-local-test-runner-fixes/runner-fixes.bats` covering the Taskfile reachability guard and s2-cycles madge resolution.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run vitest on cockpit tests to confirm failure on current base:

```bash
pnpm --prefix website test:unit src/lib/sdlc/tickets/__tests__/
# expected: FAIL (red — the mock paths are currently incorrect)
```

- [ ] **Fix-Step (GREEN).** Apply fixes P1, P2, P3, P4. Vitest and BATS must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

