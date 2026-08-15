---
title: "status-machine-ssot — Implementation Plan"
ticket_id: T007955
domains: [website, tests, tickets]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# status-machine-ssot — Implementation Plan

_Ticket: T007955_

## File Structure

```
components/website/src/lib/tickets/status.ts (NEW: SSOT module for ticket status vocabulary & helpers)
components/website/src/lib/tickets/__tests__/status.test.ts (NEW: unit tests for status module)
components/website/src/lib/tickets/admin.ts (MODIFIED: re-export / import TicketStatus from status.ts)
components/website/src/lib/tickets/transition.ts (MODIFIED: import TicketStatus, VALID_STATUSES, isValidStatus from status.ts)
components/website/src/lib/sdlc/tickets/cockpit-db.ts (MODIFIED: import TicketStatus from status.ts)
components/website/src/pages/sdlc/api/cockpit/ticket-status.ts (MODIFIED: import VALID_STATUSES from status.ts)
tests/unit/tickets-plan-staged-migration.bats (MODIFIED: verify status.ts SSOT)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Run unit test for the new status module before implementing it.
      expected: FAIL

```bash
cd components/website && pnpm vitest run src/lib/tickets/__tests__/status.test.ts
# expected: FAIL (red — status module and tests not yet implemented)
```

- [x] **Create Status SSOT Module (GREEN).**
      1. Create `components/website/src/lib/tickets/status.ts` defining `TICKET_STATUSES`, `TicketStatus`, `VALID_STATUSES`, and `isValidStatus`.
      2. Add unit tests in `components/website/src/lib/tickets/__tests__/status.test.ts`.

- [x] **Refactor Consumers to Import from SSOT (GREEN).**
      1. Update `components/website/src/lib/tickets/admin.ts` to import and re-export `TicketStatus` from `status.ts`.
      2. Update `components/website/src/lib/tickets/transition.ts` to import `TicketStatus`, `VALID_STATUSES`, and `isValidStatus` from `status.ts`.
      3. Update `components/website/src/pages/sdlc/api/cockpit/ticket-status.ts` to use `VALID_STATUSES` from `status.ts`.
      4. Update `components/website/src/lib/sdlc/tickets/cockpit-db.ts` to import `TicketStatus` from `status.ts`.
      5. Update `tests/unit/tickets-plan-staged-migration.bats` to check `status.ts`.

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

