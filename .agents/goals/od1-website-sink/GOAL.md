# GOAL: OD-1 Website-Sink einfrieren (Bachelorprojekt)

## Objective
`components/website` als God-Sink entflechten: keine neuen Importe aus
`llm|coaching|code-quality → website`, `website/ports`-Fassade einführen,
`SessionResolver` + `Policy.isAdmin` aus `lib/auth.ts` extrahieren.

## Erfolgskriterien
- [ ] Boundary-Test verbietet neue `website`-Importe aus `llm|coaching|code-quality` (CI grün).
- [ ] `getSession` (`lib/auth.ts:259-318`) + `isAdmin` (`:251-257`) hinter Interface, Request-Cache, Negativ-Tests (`null/garbage/expired`) grün.
- [ ] `get_architecture(boundaries)`: `llm→website` (74) strikt fallend, kein neuer Cross-Import.
- [ ] `task test:changed` + `task freshness:check` + `task workspace:validate` grün.

## Nicht-Ziele
- Kein VideoVault-Split (→ `od2-videovault-split`), keine Cycle-Breaks (→ `od3-bachelor-cycles`).
- Keine llama.cpp-src-Änderungen (Upstream, DO-NOT-TOUCH).

## Abhängigkeiten
- Graph-Receipt 2026-11-06 (60.285/164.767, watched). Enabler: `od5-graph-refresh` (Home).
- `plan_refs: [.agents/plans/call-site-migration/tasks.md]` (Plan `call-site-migration` gestagt, Commit 863c36aac).

## Evidenz-Anker
- `components/website/src/lib/auth.ts:259-318` `…website.src.lib.auth.getSession` (fan-in 509).
- `components/website/src/lib/auth.ts:251-257` `…website.src.lib.auth.isAdmin` (fan-in 470).
- Boundaries: `llm→website 74`, `code-quality→website 21`, `coaching→website 15`.

health_goals: none (Abgeschlossenes Einmal-/Refactoring-Ziel ohne separaten Dauer-Probe; Vertragsinvariante über G-GOALS01 überwacht)
