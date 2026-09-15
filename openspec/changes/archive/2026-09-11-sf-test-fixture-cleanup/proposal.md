# Proposal: sf-test-fixture-cleanup

## Why

The T002610 scheduling test makes an `SF-TEST` row dispatch-visible by changing
`is_test_data` to false. If `schedule.sh` or an assertion fails before the flag
is restored, the shared teardown cannot identify that row through its
registered real-fixture cleanup path. The stranded row can then enter the live
factory queue.

## What

- Use the existing `seed_real_feature` helper for the queue-visible orphan
  scenario so the fixture is registered before fallible test operations.
- Remove the temporary `is_test_data=false` mutation and restoration window.
- Add a regression guard that keeps the test on the registered fixture path.

_Ticket: T900057_
