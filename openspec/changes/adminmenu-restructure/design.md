## Context

`AdminSidebarNav.astro` ist eine ~105-zeilige deklarative Datei: ein `navSections`-Array mit 4 Sektionen und insgesamt ~18 Items. Die Nav hat seit der initialen Implementierung Items akkumuliert ohne Priorisierung. Werkstatt-Sektion hat 8 gleichwertige Einträge auf oberster Ebene. Dev-/Infra-Tools (Platform Hub, Dev Status, DORA, Repo Health) sind für Nicht-Entwickler im täglichen Workflow irrelevant.

## Goals / Non-Goals

**Goals:**
- Sidebar auf das täglich Relevante reduzieren (weniger kognitive Last)
- Werkstatt-Tools hinter einem Akkordeon gruppieren (single entry point, trotzdem erreichbar)
- Dev-Tools auf das Admin-Dashboard verschieben (sichtbar für Admins, nicht störend)
- Content-Assets (Fragebögen-Templates, Vorlagen, Verträge) aggregiert erreichbar machen
- Prod-Postfach dauerhaft vor E2E-Testdaten schützen

**Non-Goals:**
- Pages für Mitglieder/Mandate/Kontierung löschen
- DB-Schema-Merge der Content-Typen (Phase 2)
- Lokalen State des Akkordeons persistieren
- Tabs in Plattform Hub für Dev Status / DORA / Repo Health

## Decisions

**Akkordeon-Implementierung: Script-Block statt Svelte**

Die Werkstatt-Sub-Items werden via `<script>`-Block in `AdminSidebarNav.astro` ein-/ausgeklappt (`classList.toggle`). Kein Svelte-Island nötig, kein Hydration-Overhead. Das Akkordeon startet serverseitig aufgeklappt wenn der aktive Pfad auf ein Sub-Item matcht (Astro-Prop `path` schon vorhanden). Nur ein `<details>`/`<summary>`-Element oder ein Button + versteckter Container.

Alternative verworfen: Svelte-Accordion-Komponente — zu viel Overhead für ein simples Toggle.

**Content-DB: UI-Aggregation, kein DB-Merge**

Die drei Content-Typen (Fragebögen-Templates, Vorlagen, Verträge) werden in `ContentDb.svelte` via parallele API-Calls aggregiert. Kein DB-Schema-Change in Phase 1. Vorteil: keine Migration, keine Downtime. Trade-off: 3 separate API-Calls statt eines Joins.

**Dashboard-Shortcuts: bestehende AdminShortcuts.svelte erweitern**

Platform Hub, Dev Status, DORA, Repo Health als neue Gruppe in der bestehenden Shortcut-Komponente. Kein neues Component nötig.

**Prod-Guard: NODE_ENV-Check in API-Endpunkten**

`is_test_data`-Flag wird nur gesetzt wenn `process.env.NODE_ENV !== 'production'` UND gültiger `X-E2E-Test`-Header. In Prod wird der Header ignoriert und `is_test_data` bleibt `false`. Einmaliger Cleanup der bestehenden Testdaten via Shell-Script.

## Risks / Trade-offs

- [Akkordeon startet zugeklappt] → aktiver Pfad-Check öffnet es automatisch; kein versteckter aktiver State
- [Content-DB ohne Edit-Flow] → Links zu den jeweiligen Detail-Pages sind ausreichend für Phase 1; User müssen für Edits dorthin navigieren
- [Dashboard-Shortcuts unsichtbar auf kleinen Viewports] → bestehende AdminShortcuts sind bereits responsive; gleiche Breakpoints gelten

## Migration Plan

1. DB-Cleanup-Script ausführen (einmalig nach Merge, vor erstem Prod-Deploy)
2. Normaler Deploy via `task workspace:deploy ENV=mentolder`
3. Rollback: Git-Revert auf main + Redeploy (keine DB-Schema-Änderung → einfach)
