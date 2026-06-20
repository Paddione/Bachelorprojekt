# Tasks: openspec-ticket-status-display

Plan: `docs/superpowers/plans/2026-06-20-openspec-ticket-status-display.md`

- [ ] **Task 1** — Create `scripts/openspec-status-map.sh` (generator script)
- [ ] **Task 2** — Wire into `Taskfile.yml` freshness lifecycle (`openspec:status-map` task, `freshness:regenerate`, `freshness:check` FILES)
- [ ] **Task 3** — Extend `scripts/openspec.sh` propose/apply/archive to auto-regenerate map
- [ ] **Task 4** — Add `OpenSpecProposal` type + `openspecProposals` field to `TicketRow` in `cockpit-types.ts`
- [ ] **Task 5** — Import status map in `cockpit-db.ts` and merge onto `TicketRow` objects via `mergeOpenSpec()`
- [ ] **Task 6** — Render OpenSpec badges in `TicketRow.svelte` + add badge tests in `TicketRow.test.ts`
- [ ] **Task 7** — Add "OpenSpec" column header to `CockpitTable.svelte` + header test in `CockpitTable.test.ts`
- [ ] **Task 8** — Extend `.claude/skills/ticket-ops/SKILL.md` Step 1.1 with OpenSpec status enrichment
- [ ] **Task 9** — Verification: `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `bash scripts/openspec.sh validate`
