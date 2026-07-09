---
title: "factory-provider-baseurl-routing — Implementation Plan"
ticket_id: T001681
domains: [factory, testing]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-provider-baseurl-routing — Implementation Plan (Archived)

## Summary
Resolved silent loss of local-provider routing when harness agent() primitive receives custom modelIds with baseUrl set.

## Changes Implemented

### Task 1: Guard helper `resolveAgentModel` in build-loop.cjs
- Added pure function to route model args through guard logic
- Ensures only valid harness tiers (sonnet, opus, haiku, fable) passed to agent()
- Logs dropped custom modelIds with appropriate fallback tier

### Task 2: Wire the guard into all 5 pipeline.js call sites
- Batch sub-features (tier from provision)
- Plan decompose (tier from provision)  
- Implement task loop (tier from provision)
- Review lenses ('opus' tier)
- Review coordinator ('opus' tier)

### Task 3: Migration scope correction
- Narrowed local-qwen35 seed migration to ticket-triage only
- Removed factory-scout/factory-plan/lavish-artifact (they call harness agent() which has no baseUrl support)

## Verification
- All 19 tests pass including 4 resolveAgentModel acceptance tests (RED → GREEN)
- CI checks green after auto-merge

---
**Archived**: 2026-07-09 — implementation complete, merged to main.
