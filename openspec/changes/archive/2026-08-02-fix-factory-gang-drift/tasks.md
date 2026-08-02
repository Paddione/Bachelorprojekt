---
title: "fix-factory-gang-drift — Implementation Plan"
ticket_id: T002129
domains: [factory]
status: active
---

# fix-factory-gang-drift — Implementation Plan

_Ticket: T002129_

## Problem

`dispatcher-bridge.sh:96` calls `pipeline.mjs` which runs tasks strictly sequentially
(for-await loop at pipeline.mjs:337-356). The parallel gang/partial code from T002074
(`parallel()` over partials, `read-partials`, `partial-order.cjs`) exists only in
`pipeline.js` (lines 142-175, 315) but has been orphaned since commit `eecbd3c67`
renamed the entrypoint from `.js` to `.mjs`. `READMe.md:32` still references pipeline.js
as "Runnable".

**Impact:** Parallel partial-plan pipeline is inert in the factory live path;
`slot_count` / `claim-gang` is bookkeeping without actual execution parallelism.

## File Structure

- `scripts/factory/pipeline.mjs` — port gang/parallel logic + env-driven model selection
- `scripts/factory/dispatcher-bridge.sh` — update refs if needed
- `Readme.md` — update "Runnable" reference

## Tasks

### Task 1: Port parallel gang logic to pipeline.mjs

1. Read the current parallel code in `pipeline.js` (lines 142-175, 315)
2. Port the `parallel()` function, `read-partials`, and `partial-order.cjs` integration
   into `pipeline.mjs`
3. Add env-driven model selection (`FACTORY_LLM_*` → port :18235 from T002102-p3)
4. Verify the sequential for-await loop at pipeline.mjs:337-356 wraps the parallel
   gang logic instead

```bash
# RED: test that gang mode runs in parallel
bats tests/spec/factory-gang-parallel.bats
# expected: FAIL (test doesn't exist yet — red)
```

```bash
# GREEN: implement the port, test passes
bats tests/spec/factory-gang-parallel.bats
# expected: PASS
```

### Task 2: Update Readme.md

Update line 32 to reference pipeline.mjs instead of pipeline.js.

```bash
grep -n "pipeline.js" Readme.md
# fix the reference
```

### Task 3: Run quality gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Verification

```bash
# Verify the fix: dispatcher-bridge should now call pipeline.mjs with gang support
grep -n "pipeline\." scripts/factory/dispatcher-bridge.sh | head -5
# expected: pipeline.mjs
```
