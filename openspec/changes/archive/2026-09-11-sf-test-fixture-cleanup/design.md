---
ticket_id: T900057
plan_ref: openspec/changes/sf-test-fixture-cleanup/tasks.md
status: active
date: 2026-09-03
---

# SF-TEST fixture cleanup hardening

## Root cause

The T002610 schedule test creates a `seed_test_feature`, marks it
`is_test_data=false`, and restores the flag only after `schedule.sh` returns
successfully. `_sf_teardown` registers only `seed_real_feature` IDs for guarded
cleanup. A failure or timeout in that window leaves a marker-bearing `SF-TEST`
row dispatchable, which is the state observed in T016490.

## Fix

Use `seed_real_feature` for the scenario that intentionally needs queue
visibility. That helper creates the correct data classification, establishes
readiness, records the ID before later fallible operations, and matches
`_sf_teardown`'s guarded `purge_real_feature` contract. A source-contract BATS
guard prevents the test from returning to temporary production reclassification.

## Scope

Only the affected scheduling test and generated test inventory change. Runtime
factory scheduling code and the shared fixture helpers remain unchanged.
