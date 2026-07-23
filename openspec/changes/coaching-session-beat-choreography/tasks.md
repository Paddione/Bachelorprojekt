---
title: coaching-session-beat-choreography
ticket_id: T002138
domains: [website]
status: planning
---

# coaching-session-beat-choreography — Implementation Plan

## File Structure

- `website/src/lib/coaching-session-prompts.ts` (geändert, Split geplant — siehe P1)
- `website/src/lib/coaching-session-db.ts` (geändert)
- `website/src/components/admin/coaching/SessionWizard.svelte` (geändert, Split geplant — siehe P2)
- `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` (geändert)
- `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts` (geändert)
- `website/src/pages/admin/coaching/sessions/[id].astro` (geändert)
- `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` (geändert)
- Details je Partial in `tasks.d/pX-*.md`

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|---------------|------------|
| p1 | tasks.d/p1-data-model.md | impl | website/src/lib/coaching-session-prompts.ts, website/src/lib/coaching-session-db.ts | |
| p2 | tasks.d/p2-wizard-ui.md | impl | website/src/components/admin/coaching/SessionWizard.svelte, website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts, website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts | p1 |
| p3 | tasks.d/p3-export.md | impl | website/src/pages/admin/coaching/sessions/[id].astro, website/src/pages/api/admin/coaching/sessions/[id]/complete.ts | p1 |
| p4 | tasks.d/p4-tests.md | tests | website/src/lib/coaching-session-prompts.test.ts, website/src/lib/coaching-session-db.test.ts, tests-e2e (neu) | p1, p2, p3 |

Kontext für alle Partials: `design.md` (Architektur/Beat-Modell), `proposal.md` (Why/What),
`intel.json` (Symbole, DB-Spalten, S1-Budgets).

## Verify (final, nach allen Partials)

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
