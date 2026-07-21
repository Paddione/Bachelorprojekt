---
title: "factory-scout-backoff — Implementation Plan"
ticket_id: T002003
domains: [factory, dev-flow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-scout-backoff — Implementation Plan

_Ticket: T002003_

The factory dispatcher retries scout_weak tickets identically on every tick without backoff or escalation. After N consecutive scout_weak failures, the ticket should be escalated (attention_mode → needs_human) instead of retried forever.

## File Structure

```
scripts/factory/scout-quality-check.cjs   # MODIFY: add escalation counter logic
scripts/factory/pipeline.js               # MODIFY: read scout_weak retry count, handle escalation
scripts/factory/dispatcher.js             # MODIFY: handle scout_weak result with backoff
scripts/ticket.sh                         # READ-ONLY: retry-count get/incr already exist
tests/spec/factory-scout-backoff.bats     # NEW: BATS test for backoff behavior
```

## Tasks

### Task 1: Add scout_weak escalation threshold

In `scripts/factory/scout-quality-check.cjs`, after `runScoutGate` returns a `scout_weak` result, the pipeline should check the ticket's scout_weak retry count. If count >= 3, set `attention_mode='needs_human'` on the ticket and add a comment explaining the escalation.

Changes to `pipeline.js` (around the scout result handling, after line ~210):
- After receiving `scout_weak` status from `runScoutGate`, increment a counter on the ticket via `ticket.sh retry-count incr`
- If counter >= 3: `ticket.sh update-status --id <id> --attention-mode needs_human` and add escalation comment
- If counter < 3: log the retry attempt and return the scout_weak status (current behavior)

### Task 2: Add backoff to dispatcher for scout_weak tickets

In `scripts/factory/dispatcher.js`, when a pipeline returns `status: 'scout_weak'`, skip the ticket for the current tick instead of letting it be re-queued immediately. The schedule.sh `queue.sh` already filters on status, so the ticket stays in triage. Add a comment to the ticket noting the backoff.

In `dispatcher.js` Launch phase (around line 131-151), in the `.then()` handler:
- Check `r.result?.status === 'scout_weak'`
- If so, log "scout_weak backoff: skipping <ticket> this tick"
- The ticket remains in triage status, so queue.sh won't pick it up again until next tick

### Task 3: Write BATS test

Create `tests/spec/factory-scout-backoff.bats`:
- Test that `evaluateScoutQuality` with short spec returns `{weak: true, reasons: ['spec_too_short']}`
- Test that after 3 scout_weak outcomes, the ticket gets `attention_mode='needs_human'`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-scout-backoff.bats
# expected: FAIL (red — the escalation logic is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
