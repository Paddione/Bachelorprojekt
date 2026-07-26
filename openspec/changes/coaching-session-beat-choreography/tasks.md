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
| p4 | tasks.d/p4-compat-fixups.md | impl | website/src/pages/api/demo/coaching-sim.ts, website/src/lib/session-tools.ts | p1 |
| p5 | tasks.d/p5-tests.md | tests | website/src/lib/coaching-session-prompts.test.ts, website/src/lib/coaching-session-db.test.ts, tests-e2e (neu) | p1, p2, p3, p4 |

**Nachtrag (Plan-Review):** `coaching-sim.ts` (öffentlicher Demo-Endpunkt, Requirement "Rate-limited
Hermes Proxy" in `openspec/specs/coaching-sessions-polish-guide.md`) nutzt `getStepDef(...).inputs`/
`.userTemplate` direkt (altes flaches `StepDefinition`-Shape) und `session-tools.ts` liest
`row.coach_inputs` roh aus der DB mit der alten `Record<string,string>`-Annahme — beide sind reale,
von P1 gebrochene Konsumenten, die in keinem der ursprünglichen 3 Partials abgedeckt waren. P4 schließt
diese Lücke vor den Tests (P5).

Kontext für alle Partials: `design.md` (Architektur/Beat-Modell), `proposal.md` (Why/What),
`intel.json` (Symbole, DB-Spalten, S1-Budgets).

## Verify (final, nach allen Partials)

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
