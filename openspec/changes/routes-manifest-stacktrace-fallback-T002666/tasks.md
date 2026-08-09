---
title: "routes-manifest-stacktrace-fallback-T002666 — Implementation Plan"
ticket_id: T002666
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# routes-manifest-stacktrace-fallback-T002666 — Implementation Plan

_Ticket: T002666_

## File Structure

- `scripts/build-route-manifest.mjs` — Pass `stdio: ['pipe', 'pipe', 'pipe']` in `loadBrandSlugsViaTsx()` to prevent `tsx` execution errors leaking raw stacktraces to stderr. (Current S1: 64 lines / max 500 lines).
- `tests/spec/website-core.bats` — BATS test verifying `build-route-manifest.mjs` stdio handling. (Current S1: 448 lines / max 1000 lines).

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test in `tests/spec/website-core.bats` that verifies `scripts/build-route-manifest.mjs` configures stdio properly to suppress unhandled subprocess stacktraces on stderr.
      Run test command:
      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
      ```
      expected: FAIL (red — `scripts/build-route-manifest.mjs` does not yet set stdio on `execFileSync`).

- [x] **Fix-Step (GREEN).** Update `loadBrandSlugsViaTsx()` in `scripts/build-route-manifest.mjs` to specify `stdio: ['pipe', 'pipe', 'pipe']` on `execFileSync`.
      Run test command:
      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
      ```
      The test must pass (GREEN).

- [x] **Final Verification Task.** Run the three mandatory CI gates:
      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

