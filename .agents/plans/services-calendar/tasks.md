---
title: services-calendar — staged implementation plan
ticket_id: T901023
domains: [website, db, test]
status: ready
---

# services-calendar — Implementation Plan

Staged plan for T901023 (feat): services, availability and owner
appointment calendar. Held for `dev-flow-execute` (`stage-plan --hold`).
Builds on T901022 (owner guard, memberships, inbox brand column — all on
main). Decisions: Europe/Berlin fixed end-to-end in shared availability
code, static JSON catalogue, hours/buffers/holidays in `site_settings`
JSON, new `/owner/kalender` page, overlap via `claimSlot`, CalDAV stays
source of truth. Details: `design.md`, `proposal.md`, `intel.json`.

## File Structure

Union of all partial target files (disjoint per partial, D1):

- `components/website/src/lib/caldav.ts` (modify)
- `components/website/src/lib/appointments-db.ts` (modify)
- `components/website/src/lib/caldav-cache.ts` (modify)
- `components/website/src/pages/api/booking.ts` (modify)
- `components/website/src/pages/api/calendar/slots.ts` (modify)
- `components/website/src/pages/owner/kalender.astro` (new)
- `components/website/src/pages/api/owner/calendar/block.ts` (new)
- `components/website/src/pages/api/owner/bookings/phone.ts` (new)
- `components/website/src/pages/api/owner/bookings/[uid]/reschedule.ts` (new)
- `components/website/src/pages/api/owner/bookings/[uid]/cancel.ts` (new)
- `content/massage/leistungen.json` (new)
- `components/website/src/lib/business-settings.ts` (new)
- `components/website/src/lib/website-core-db.ts` (modify)
- `tests/spec/services-calendar.bats` (new)
- `components/website/src/lib/__tests__/business-settings.test.ts` (new)
- `components/website/src/lib/__tests__/booking-availability.test.ts` (new)

Regeneration side-effect (not a target file): test inventory via
`task test:inventory` updates
`components/website/src/data/test-inventory.json` (owned by partial p4).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-availability-core.md | impl | components/website/src/lib/caldav.ts, components/website/src/lib/appointments-db.ts, components/website/src/lib/caldav-cache.ts, components/website/src/pages/api/booking.ts, components/website/src/pages/api/calendar/slots.ts |  |
| p2 | tasks.d/p2-owner-calendar.md | impl | components/website/src/pages/owner/kalender.astro, components/website/src/pages/api/owner/calendar/block.ts, components/website/src/pages/api/owner/bookings/phone.ts, components/website/src/pages/api/owner/bookings/[uid]/reschedule.ts, components/website/src/pages/api/owner/bookings/[uid]/cancel.ts, content/massage/leistungen.json |  |
| p3 | tasks.d/p3-settings.md | impl | components/website/src/lib/business-settings.ts, components/website/src/lib/website-core-db.ts |  |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/services-calendar.bats, components/website/src/lib/__tests__/business-settings.test.ts, components/website/src/lib/__tests__/booking-availability.test.ts | p1,p2,p3 |

## Task 5: Final verification (all partials implemented)

Context. Runs after p1–p4 are implemented and committed. Executes the
mandatory repo verification sequence.

### Steps

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] Commit regenerated artifacts with explicit pathspecs.
- [ ] `task freshness:check`
- [ ] CQ02 any-count stays within limit:
  `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`

### Acceptance criteria

- All commands pass; Mentolder regression paths stable apart from the
  intended timezone correction; no S1–S4 ratchet violations; baseline
  key count unchanged; any-count within the CQ02 limit.
