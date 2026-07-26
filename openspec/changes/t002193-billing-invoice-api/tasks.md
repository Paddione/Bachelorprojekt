---
title: "t002193-billing-invoice-api — Implementation Plan"
ticket_id: T002193
domains: [billing, api]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002193-billing-invoice-api — Implementation Plan

## File Structure

Likely files to change (to be confirmed during investigation):
```
website/src/routes/api/billing/     (API routes — payment endpoint)
brett/src/routes/billing/           (backend billing routes)
```

## Partial Plans

### PP1: Root cause analysis
- Run failing E2E tests locally with traces enabled
- Check billing API endpoint behavior
- Identify the specific non-200 response path
- Determine auth redirect loop trigger
- Document exact fix needed

### PP2: Implementation
- Fix the API endpoint status code
- Fix auth/session handling in billing flow
- Update E2E tests if needed

### PP3: Verification
- Run FA-21 E2E tests: all pass
- Verify no regression on other billing flows
