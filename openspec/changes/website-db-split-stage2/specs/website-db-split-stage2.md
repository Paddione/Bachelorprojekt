## ADDED Requirements

### Requirement: REQ-WEBSITE-DB-SPLIT-STAGE2-001 — Stage 2 Extraction With Re-Export Compatibility

`website/src/lib/website-db.ts` SHALL have its second functional half (Time-Entries, Client-Notes,
Onboarding, Follow-ups, Admin-Shortcuts, DSGVO-Audit-Log, Invoice-Counter, Brett, Custom-Sections,
Content-Store) moved into a new module, with `website-db.ts` keeping re-exports under the original
names so no call site outside `website-db.ts` needs to change its import path. This requirement
builds on Stage 1 (T002149) having already been merged.

#### Scenario: Stage 2 extracts the second functional half without breaking imports

- **GIVEN** Time-Entries, Client-Notes, Onboarding, Follow-ups, Admin-Shortcuts, DSGVO-Audit-Log,
  Invoice-Counter, Brett, Custom-Sections, and Content-Store functions currently defined directly in
  `website-db.ts` (after Stage 1 has already removed the first-half functions)
- **WHEN** they are moved into a further new module and re-exported from `website-db.ts`
- **THEN** every existing import of these functions from `$lib/website-db` continues to resolve
  without a call-site change

### Requirement: REQ-WEBSITE-DB-SPLIT-STAGE2-002 — No Import Cycles After Stage 2

The module extracted in Stage 2 SHALL NOT introduce import cycles with `website-db.ts`, the Stage-1
module, or the previously extracted `billing-db.ts`.

#### Scenario: Extracted module has no circular imports

- **GIVEN** the Stage-1 module, the Stage-2 module, and `website-db.ts` after both stages
- **WHEN** their import graph is inspected
- **THEN** no cycle exists among them or with `billing-db.ts`
