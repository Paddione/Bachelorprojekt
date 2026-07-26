# Proposal: t002193-billing-invoice-api

## Why

FA-21 billing E2E tests fail:
1. Invoice payment API returns non-200 status on first attempt
2. On retry, the page redirects to homepage (auth/session issue)
3. Page never settles after payment action (timeout)

## Root cause analysis needed

Two E2E tests affected:
- "partial payment then full payment toggles status @billing"
- "payment overshoot rejected @billing"

Possible causes:
- Billing API endpoint returns wrong HTTP status
- Session/auth redirect loop during payment flow
- Frontend doesn't handle API response correctly

## Changes needed

1. Investigate billing API endpoint (likely in website routes or brett backend)
2. Fix the non-200 response from payment API
3. Fix auth redirect loop after payment action
4. Verify both E2E tests pass

## Trade-offs
- Billing touches real payment flows. Production E2E testing needed.

## Risks
- Payment API changes could affect live billing if not carefully isolated.
