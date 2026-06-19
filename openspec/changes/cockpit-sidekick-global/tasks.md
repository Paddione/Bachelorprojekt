# Tasks: cockpit-sidekick-global

_Ticket: T000953 · Plan: `docs/superpowers/plans/2026-06-19-cockpit-sidekick-global.md`_

## T1 — `CockpitSidekickView.svelte` erstellen

- [ ] Testdatei `website/src/components/assistant/CockpitSidekickView.test.ts` anlegen (rot)
- [ ] Test ausführen — muss FAIL sein
- [ ] `website/src/components/assistant/CockpitSidekickView.svelte` implementieren (Svelte 5 Runes)
  - Eigener Fetch von `/api/admin/cockpit/portfolio`
  - `cockpit:portfolio-mutated` → `loadPortfolio()` via `$effect`-Cleanup
  - Filter (`$state filter`), activeOnly (`$state`, localStorage `cockpit:activeOnly`), collapsed Set (`$state`, localStorage `cockpit:collapsed`)
  - `displayedProducts` als `$derived` mit gleicher Filter-Logik wie CockpitSidebar
  - `pickFeature(extId)`: `selectFeature(extId)` + Navigation-Logik (pathname-Check)
  - `featureAction` → POST `/api/admin/cockpit/feature-action` → `cockpit:portfolio-mutated` dispatchen
  - `batchFeatureAction` → POST `/api/admin/cockpit/feature-actions` → `cockpit:portfolio-mutated` dispatchen
  - `SuggestionBar` importieren aus `../admin/SuggestionBar.svelte`; `handleRoll`/`handleApply`/`handleReset`
  - Lade- und Fehlerzustand
- [ ] Tests ausführen — müssen PASS sein
- [ ] Commit: `feat(cockpit-sidekick): add CockpitSidekickView component [T000953]`

## T2 — `sidekick-nudge.ts` erweitern

- [ ] `SidekickView`-Union um `'cockpit'` ergänzen
- [ ] `KNOWN_VIEWS` um `'cockpit'` ergänzen
- [ ] Bestehende `sidekick-nudge.test.ts`-Tests müssen PASS bleiben
- [ ] Commit: `feat(cockpit-sidekick): add 'cockpit' to SidekickView union [T000953]`

## T3 — `PortalSidekick.svelte` + `SidekickHome.svelte` verdrahten

- [ ] `PortalSidekick.svelte`: `type View` um `'cockpit'` erweitern, Import von `CockpitSidekickView`, `titleMap: cockpit: 'Projekt-Cockpit'`, `drawer-body`-Branch `{:else if view === 'cockpit'}<CockpitSidekickView />`
- [ ] `SidekickHome.svelte`: `type View` um `'cockpit'` erweitern, Item 04 auf `id: 'cockpit'`, kein `href`, `sub: 'Container & Features'`
- [ ] `npx tsc --noEmit` — keine neuen Fehler
- [ ] Commit: `feat(cockpit-sidekick): wire CockpitSidekickView into PortalSidekick + SidekickHome item 04 [T000953]`

## T4 — `Cockpit.svelte` bereinigen + Event-Bridge

- [ ] `CockpitShell.integration.test.ts` auf Event-Bridge-Tests umstellen (sidebar-feature-Abhängigkeit entfernen, `cockpit:feature-selected`/`cockpit:portfolio-mutated` testen) — zuerst rot
- [ ] `Cockpit.svelte`: Import von `CockpitSidebar` entfernen, zweiten `onMount`-Block mit Window-Event-Listenern (feature-selected + portfolio-mutated) mit Cleanup ergänzen, `<CockpitSidebar .../>` + `<div class="layout">` entfernen, nur `<main class="main">` behalten, `.layout`-CSS-Regel entfernen
- [ ] Tests ausführen — müssen PASS sein
- [ ] Commit: `feat(cockpit-sidekick): remove CockpitSidebar from Cockpit, wire event bridge [T000953]`

## T5 — `CockpitSidebar.svelte` + `CockpitSidebar.test.ts` löschen

- [ ] `git rm website/src/components/admin/CockpitSidebar.svelte website/src/components/admin/CockpitSidebar.test.ts`
- [ ] `grep -r CockpitSidebar website/src/` — keine Treffer
- [ ] Vitest-Gesamtlauf für `admin/` — grün
- [ ] Commit: `chore(cockpit-sidekick): delete CockpitSidebar component and its test [T000953]`

## T6 — Finale Verifikation

- [ ] `task test:changed` — alle Tests grün
- [ ] `task test:inventory` — ggf. `website/src/data/test-inventory.json` mitcommitten
- [ ] `task freshness:regenerate` — generierte Artefakte aktualisieren und committen
- [ ] `task freshness:check` — S1–S4-Ratchet + Baseline-Assertion grün
- [ ] `bash scripts/openspec.sh validate` — OK
