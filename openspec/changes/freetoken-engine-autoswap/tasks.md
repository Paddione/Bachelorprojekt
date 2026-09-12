---
title: "freetoken-engine-autoswap — Implementation Plan"
ticket_id: T900155
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-engine-autoswap — Implementation Plan

_Ticket: T900155_

## File Structure

```
.opencode/plugin/freetoken-active.ts                    MODIFY  — repo SSOT sync (system-merge fix) + engine auto-swap
tests/spec/llm-local-dev/freetoken-engine-autoswap.bats ADD     — BATS coverage for auto-swap logic (T002416)
docs/runbooks/freetoken-native.md                       MODIFY  — document auto-swap behavior + degraded path
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      missing auto-swap behavior. The test must FAIL on the current branch.
      Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2
      picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/freetoken-engine-autoswap.bats
# expected: FAIL (red — the auto-swap logic is not yet implemented)
```

- [x] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

  1. **Repo SSOT sync (`freetoken-active.ts`).** Sync the stale repo copy
     `.opencode/plugin/freetoken-active.ts` with the live global copy
     `~/.config/opencode/plugin/freetoken-active.ts`, including the
     system-merge fix (all system messages merged into position 0,
     lines 163-183).
  2. **Event hook filter.** Add an `event` hook that filters
     `event.type === "session.next.model.switched"` and extracts the
     `ModelRef` (`{id, providerID, variant?}`).
  3. **Alias resolution.** Resolve the picked model against the plugin's
     alias→engine mapping table (engine model, port, args, contextLimit).
  4. **Dispatch logic.** Different engine model → `POST :1900/engine/switch`
     (or `/engine/start` if stopped), then update the context limit;
     same engine model → context-limit/name-only update, no engine call;
     non-freetoken → `POST /engine/stop`.
  5. **Degraded failure path.** On switch/stop failure: notify the user and
     keep the old engine running (non-blocking).
  6. **Fetch-wrapper safety net.** Verify the running engine model matches
     the expected model for the active alias; on mismatch, synchronously
     switch before proxying.

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
