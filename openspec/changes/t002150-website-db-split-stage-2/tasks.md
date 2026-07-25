# OpenSpec Proposal: T002150 Website-DB Split Stage 2

## Summary
Extract domain modules from `website-db.ts` to achieve full modularization:
- `website/src/lib/time-entries-db.ts` (time entries, client notes, onboarding, follow-ups)
- `website/src/lib/portal-tools-db.ts` (admin shortcuts, dsgvo audit, invoice counter, brett claim)
- `website/src/lib/custom-sections-db.ts` (custom website sections)
- `website/src/lib/content-store-db.ts` (service_page_config, content-store readContent/writeContent/listVersions)
- Move `listBugTickets` to `website-core-db.ts`
- Reduce `website-db.ts` to re-exports (< 600 lines)
- Remove `website-db.ts` from `s1.ignore` in `docs/code-quality/gates.yaml`

## Tasks

- [ ] Task 1: Extract `time-entries-db.ts`
- [ ] Task 2: Extract `portal-tools-db.ts`
- [ ] Task 3: Extract `custom-sections-db.ts`
- [ ] Task 4: Extract `content-store-db.ts`
- [ ] Task 5: Move `listBugTickets` to `website-core-db.ts`
- [ ] Task 6: Reduce `website-db.ts` to re-exports
- [ ] Task 7: Update `docs/code-quality/gates.yaml`
