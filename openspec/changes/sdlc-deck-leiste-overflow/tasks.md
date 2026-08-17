---
title: "sdlc-deck-leiste-overflow — Implementation Plan"
ticket_id: T011498
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-deck-leiste-overflow — Implementation Plan

_Ticket: T011498_

## File Structure

```
components/website/src/components/leitstand/DeckLeiste.svelte        (geändert: container-type)
components/website/src/components/sdlc/factory/ControlPanel.svelte   (geändert: @container-Kompakt-Regel)
components/website/src/components/sdlc/factory/FactoryObservability.svelte (geändert: @container-Kompakt-Regel)
components/website/src/components/sdlc/factory/FactoryBudgetPage.svelte    (geändert: @container-Kompakt-Regel)
tests/spec/sdlc-cockpit/deck-kompakt-layout.bats                     (neu: RED-Guard, bereits im Stage-Commit)
```

## Kontext

Symptom, belegte Ursache und Entscheidung stehen in `design.md` dieses Change-Ordners.
Kurzform: Die Z5-DeckLeiste (`minmax(240px, 320px)` in `cockpit.astro`) bettet drei
Vollbreiten-Komponenten ein, deren `@media`-Breakpoints die Viewport-Breite messen und
auf Desktop nie greifen — das ControlPanel-Grid (`repeat(2, 1fr)`) overflowt den
Viewport horizontal. Fix: `.deck-leiste__body` wird `container-type: inline-size`;
die drei Komponenten stellen per `@container (max-width: 480px)` auf einspaltige,
kompakte Layouts um.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Guard liegt bereits im Stage-Commit
      (`tests/spec/sdlc-cockpit/deck-kompakt-layout.bats`) und ist auf diesem
      Branch rot — alle vier Tests scheitern an der jeweiligen Kern-Assertion
      (`container-type` bzw. `@container` fehlt), die Positiv-Anker halten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-kompakt-layout.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix 1 — DeckLeiste wird Query-Container.** In
      `components/website/src/components/leitstand/DeckLeiste.svelte` erhält
      `.deck-leiste__body` die Deklaration `container-type: inline-size;`
      (bestehende `flex: 1; min-height: 0;` bleiben). Kein weiterer Umbau.

- [ ] **Fix 2 — ControlPanel kompakt im schmalen Container.** In
      `components/website/src/components/sdlc/factory/ControlPanel.svelte` eine
      `@container (max-width: 480px)`-Regel ergänzen: `.control-panel` mit
      reduziertem Padding (`0.5rem`) und Gap (`0.75rem`); `.control-panel__grid`
      auf `grid-template-columns: 1fr` und Gap `0.75rem`. Die bestehende
      `@media (max-width: 768px)`-Regel bleibt unverändert (Mobile-Pfad).

- [ ] **Fix 3 — FactoryObservability kompakt.** In
      `components/website/src/components/sdlc/factory/FactoryObservability.svelte`
      eine `@container (max-width: 480px)`-Regel ergänzen: `.kpi-row` und
      `.skeleton.kpi-row` auf `grid-template-columns: 1fr`; `.phase-label` und
      `.phase-val` ohne `min-width` (auf `min-width: 0`); Tabellen-Wrapper der
      `.timeline-table` mit `overflow-x: auto`.

- [ ] **Fix 4 — FactoryBudgetPage kompakt.** In
      `components/website/src/components/sdlc/factory/FactoryBudgetPage.svelte`
      eine `@container (max-width: 480px)`-Regel ergänzen: `.factory-budget-page`
      mit `padding: 0.5rem`; `.dashboard-grid` bleibt einspaltig
      (`grid-template-columns: 1fr`); Wrapper der `.data-table` mit
      `overflow-x: auto`, damit breite Tabellen im Deck scrollen statt zu
      overflowen.

- [ ] **GREEN-Nachweis.** Der BATS-Guard aus dem RED-Step läuft grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/deck-kompakt-layout.bats
```

- [ ] **Visueller Nachweis.** Dev-Stack: `/sdlc/cockpit?deck=plattform` öffnen —
      die Deck-Karten (Kill Switch, Dry Run, Slot Cap, Daily Cap, Context Budget,
      Spawn Harness, Lavish Delegation) stehen einspaltig in der Leiste,
      `document.documentElement.scrollWidth` überschreitet `innerWidth` nicht.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
