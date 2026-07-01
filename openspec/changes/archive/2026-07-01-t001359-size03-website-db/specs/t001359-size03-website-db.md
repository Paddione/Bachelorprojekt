## ADDED Requirements

### Requirement: Projects Domain Is Isolated From website-db.ts

The Project/SubProject/ProjectTask/PortalProject/ProjectAttachment domain,
plus its Portal customer-access functions and CSV/meeting-relation
helpers, SHALL live in dedicated modules (`projects-db.ts`,
`project-attachments-db.ts`, `project-portal-db.ts`,
`project-export-db.ts`) instead of `website-db.ts`, so that
`website-db.ts` stays under the G-SIZE03 line-count gate (≤ 3000 lines)
without duplicating any Projects-domain function or type across modules.

#### Scenario: website-db.ts stays under the G-SIZE03 threshold

- **GIVEN** the Projects domain has been extracted into `projects-db.ts`
  and its satellite modules
- **WHEN** `bash scripts/health-goals-check.sh --only=G-SIZE03` runs
- **THEN** `website-db.ts` reports a line count at or below 3000 and the
  gate passes

#### Scenario: No duplicate Projects-domain exports exist

- **GIVEN** `listMeetingsForProject`, `assignMeetingToProject`,
  `findProjectByName`, `listUnassignedMeetingsForCustomer`, and
  `getCustomerByEmail` were extracted to `project-export-db.ts` /
  `project-portal-db.ts`
- **WHEN** `website-db.ts` is inspected
- **THEN** it does not redefine these functions itself; it only
  re-exports `listAllCustomers`, `listAdminUsers`, and
  `getCustomerByEmail` from `project-portal-db.ts` for backward
  compatibility with callers that still import them from `website-db`

#### Scenario: Customer type has no website-db <-> projects-db cycle

- **GIVEN** `project-portal-db.ts` needs the `Customer` type shape
- **WHEN** its imports are inspected
- **THEN** it imports `Customer` from the neutral leaf module
  `customer-types.ts` (not from `website-db.ts`), so the module graph
  contains no `website-db.ts` → `project-portal-db.ts` →
  `website-db.ts` cycle (S2 quality gate)

#### Scenario: All Projects-domain modules stay under the S1 per-file limit

- **GIVEN** the Projects domain is split across `projects-db.ts`,
  `project-attachments-db.ts`, `project-portal-db.ts`, and
  `project-export-db.ts`
- **WHEN** `node scripts/code-quality/check.mjs` runs
- **THEN** each of the four modules is at or below the 600-line S1 limit
  for `.ts` files
