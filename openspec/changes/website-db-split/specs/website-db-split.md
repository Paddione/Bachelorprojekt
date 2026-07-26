## ADDED Requirements

### Requirement: REQ-WEBSITE-DB-SPLIT-001 — Stage 1 Extraction With Re-Export Compatibility

`website/src/lib/website-db.ts` SHALL have its first functional half (Customer, Bug-Ticket,
Site-Settings, Vacation/Blackout, Legal-Pages) moved into a new module, with `website-db.ts` keeping
re-exports under the original names so no call site outside `website-db.ts` needs to change its
import path. This is Stage 1 of a two-stage split; Stage 2 (the remaining functions) is tracked in
the dependent change `website-db-split-stage2` (ticket T002150) and is out of scope here.

#### Scenario: Stage 1 extracts the first functional half without breaking imports

- **GIVEN** Customer, Bug-Ticket, Site-Settings, Vacation/Blackout, and Legal-Pages functions
  currently defined directly in `website-db.ts`
- **WHEN** they are moved into a new module and re-exported from `website-db.ts`
- **THEN** every existing import of these functions from `$lib/website-db` continues to resolve
  without a call-site change

### Requirement: REQ-WEBSITE-DB-SPLIT-002 — No Import Cycles After Stage 1

The module extracted in Stage 1 SHALL NOT introduce import cycles with `website-db.ts` or the
previously extracted `billing-db.ts`.

#### Scenario: Extracted module has no circular imports

- **GIVEN** the new Stage-1 module and `website-db.ts` after Stage 1
- **WHEN** their import graph is inspected
- **THEN** no cycle exists between them or with `billing-db.ts`
