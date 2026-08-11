# p2: Tests

## Target Files
- `tests/spec/factory/watchdog-red-green.bats`

## Role
tests

## Description

Write a BATS test that verifies the watchdog's attempt counter correctly distinguishes between `entered` events (no progress) and `done` events (real progress).

## Failing Test (RED)

```bash
# This test MUST fail before p1 is implemented — the counter currently resets
# on ANY phase event including 'entered'.
tests/unit/lib/bats-core/bin/bats tests/spec/factory/watchdog-red-green.bats
# expected: FAIL (counter resets on 'entered' event)
```

## Test Scenarios

### Scenario 1: entered event does NOT reset the counter

- Set up: a ticket with counter=2, MAX_ATTEMPTS=3, and a phase_event with state='entered' newer than the counter
- Action: run watchdog
- Assert: counter increments to 3 (NOT reset to 1)

### Scenario 2: partial-done event DOES reset the counter

- Set up: a ticket with counter=2 and a phase_event with state='partial-done' newer than the counter
- Action: run watchdog
- Assert: counter resets to 1

### Scenario 3: done event DOES reset the counter

- Set up: a ticket with counter=2 and a phase_event with state='done' newer than the counter
- Action: run watchdog
- Assert: counter resets to 1

### Scenario 4: blocked event DOES reset the counter

- Set up: a ticket with counter=2 and a phase_event with state='blocked' newer than the counter
- Action: run watchdog
- Assert: counter resets to 1

## Verification (GREEN)

After p1 is implemented, all scenarios must pass:
```bash
task test:changed
task freshness:regenerate
```

## Note
The BATS test file must be created at `tests/spec/factory/watchdog-red-green.bats`. If this file already exists from a previous planning attempt, overwrite it.
