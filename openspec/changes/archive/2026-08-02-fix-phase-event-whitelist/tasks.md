---
title: "fix-phase-event-whitelist — Implementation Plan"
ticket_id: T002130
domains: [factory, tools]
status: active
---

# fix-phase-event-whitelist — Implementation Plan

_Ticket: T002130_

## Problem

`pipeline.js:173` writes phase events with state `"partial-done"`, but `ticket.sh:509`
only allows `entered|done|blocked` in the state validation. The resulting error is
silently swallowed in `pipeline-runner.js:146-150` (catch without re-raise).

**Impact:** Partial-completion telemetry is silently lost from
`tickets.factory_phase_events`, breaking the SDLC agent observation goal that depends
on complete phase events.

## File Structure

- `scripts/ticket.sh` — add `partial-done` to state whitelist (line ~509)
- `scripts/factory/pipeline-runner.js` — make catch fail-visible (log to stderr)
- `scripts/factory/pipeline.js` — update detail field if needed

## Tasks

### Task 1: Add "partial-done" to ticket.sh state whitelist

1. Find the state validation in ticket.sh (line ~509)
2. Add "partial-done" to the allowed states

```bash
# RED: test that partial-done is rejected before the fix
bats tests/spec/ticket-phase-whitelist.bats
# expected: FAIL (test doesn't exist yet — red)
```

```bash
# Verify current whitelist
grep -n "entered\|done\|blocked" scripts/ticket.sh | head -5
```

### Task 2: Make pipeline-runner.js error visible

Find the catch block at pipeline-runner.js:146-150 and add a `console.error()` or
`process.stderr.write()` before the silent catch, so phase-event write failures
are at least visible in logs.

```bash
grep -n "catch" scripts/factory/pipeline-runner.js | head -5
```

### Task 3: Run quality gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
