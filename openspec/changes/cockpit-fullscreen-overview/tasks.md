# Tasks: cockpit-fullscreen-overview

> Plan: `docs/superpowers/plans/2026-06-20-cockpit-fullscreen-overview.md` · Ticket: T000953
> S1-Budgets (alle nicht-baselined, gegen statisches Limit): `[id].astro` 395 · Limit 400 → +5 (HART) · `ContainerDorPanel.svelte` 42 → ≤70 · `container-detail.ts` 101 → ≤108 · `TicketSpecProgress.svelte` NEU → ≤65.

## Task 1: container-detail.ts — `ContainerDor.lastenheftLocked`

- [ ] Failing-Test (`container-detail.test.ts`, `describe('getContainerDor')` erweitern): bestehender Fall asserted `lastenheftLocked===false`; neuer Fall mit `readiness:{lastenheft_locked:true}` → `lastenheftLocked===true`
- [ ] `container-detail.ts`: `import { isLastenheftLocked } from './lastenheft'`; Interface `ContainerDor` + `lastenheftLocked: boolean`; Return `lastenheftLocked: isLastenheftLocked(readiness)`
- [ ] Test grün; `wc -l` ≤ 108
- [ ] Commit `feat(cockpit): derive ContainerDor.lastenheftLocked from readiness [T000953]`

## Task 2: TicketSpecProgress.svelte (NEU)

- [ ] Neue Präsentations-Insel; Props `{ ticket:{description:string|null}, dor:ContainerDor, hasPlan:boolean, hasPr:boolean }` via `$props`; `import type { ContainerDor }` (S2-sicher, kein TicketDetail-Import)
- [ ] 10-Punkte-Checkliste (✓ grün / ○ amber): Beschreibung, Value Prop, Anforderungen erfasst, Lastenheft verriegelt, spec_skizziert, offene_fragen_geklaert, abhaengigkeiten_klar, aufwand_geschaetzt, Plan vorhanden (`hasPlan`), PR erstellt (`hasPr`)
- [ ] Header `Fertig: X/10` + Fortschrittsbalken (`role=progressbar`); 2-spaltig ab `sm`
- [ ] Typecheck sauber; `wc -l` ≤ 65
- [ ] Commit `feat(cockpit): add TicketSpecProgress checklist component [T000953]`

## Task 3: ContainerDorPanel.svelte — dyn. Label + Lock-Badge + Leer-Fallback

- [ ] Anforderungs-Sektion ersetzen: Heading `dor.lastenheftLocked ? 'Lastenheft' : 'Pflichtenheft'`
- [ ] Badge: locked → green `🔒 verriegelt · KI-bereit`; unlocked → amber `✏ Entwurf`
- [ ] Leere-Liste-Fallback: `requirementsList.length===0` → amber `⚠ Keine Anforderungen erfasst` (kein leer-leeres Panel) — AC-1/2/3
- [ ] Typecheck sauber; `wc -l` ≤ 70
- [ ] Commit `feat(cockpit): dynamic Pflichtenheft/Lastenheft label + lock badge in DoR panel [T000953]`

## Task 4: [id].astro — Insel einbinden, Reihenfolge, Leer-Hinweis (S1-kritisch ≤400)

- [ ] Import `TicketSpecProgress` ergänzen
- [ ] Beschreibungs-`:else` → amber `⚠ Noch leer — keine Beschreibung erfasst.`
- [ ] `<TicketSpecProgress client:load>` nur bei `isContainer && containerDor` (`hasPlan=containerPlan!==null`, `hasPr=containerPlan?.prNumber!=null`)
- [ ] Reihenfolge (AC-5): Beschreibung → TicketSpecProgress → ContainerDorPanel → TicketPlanPanel → ContainerChildrenList → GrillingStepper → ProjectQuestionnairesPanel → Verknüpfungen → Verlauf → Anhänge
- [ ] Keine duplizierten GrillingStepper/ProjectQuestionnairesPanel-Blöcke (grep-Count == 2)
- [ ] Typecheck sauber; `wc -l` ≤ **400** (HART, kein Baseline-Spielraum)
- [ ] Commit `feat(cockpit): reorder fullscreen sections + spec progress island [T000953]`

## Task 5: Finale Verifikation (CI-Äquivalent)

- [ ] `task test:changed` grün
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` grün (S1–S4-Ratchet + Baseline-Key-Count)
- [ ] `wc -l` aller vier Dateien innerhalb Budget; regenerierte Artefakte committen
