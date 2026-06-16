---
date: 2026-06-16
slug: cockpit-views-overhaul
status: draft
domains: [website]
ticket_id: null
spec_ref: docs/superpowers/specs/2026-06-16-cockpit-views-overhaul-design.md
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Cockpit-Views-Overhaul

Branch: `feature/cockpit-views-overhaul` · Spec: siehe `spec_ref`.
TDD pro Task: erst Test (rot), dann Implementierung (grün). Targeted-Run:
`cd website && pnpm vitest run <datei>`.

**S1-Budget:** Keine der Cockpit-Dateien ist baselined → frisches Limit (~500
Zeilen .ts/.svelte). Aktuelle Größen 81–255 Z.; Enum-/Transitions-Logik wandert
in das neue pure Modul `cockpit-labels.ts`, damit alle Komponenten < ~350 bleiben.

---

## Task 1 — `cockpit-labels.ts` (pures Modul, SSOT für Enum-Darstellung)
**Test zuerst:** `website/src/lib/tickets/cockpit-labels.test.ts`
- `ALL_PRIORITIES` enthält `kritisch`.
- `statusLabel('in_progress')==='In Arbeit'`; unbekannt → Rohwert.
- `defaultResolutionFor('bug')==='fixed'`; `defaultResolutionFor('feature')==='shipped'`.
- `isTerminal('done')===true`; `isTerminal('in_progress')===false`.
- `nextTransitions('in_progress')` enthält `done` und `blocked`, nicht `in_progress`.

**Implementierung:** Datei mit `import type` nur (S2-safe). Exporte:
`STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS, RESOLUTION_LABELS,
ALL_PRIORITIES, WORKFLOW_STATUSES, ACTIVE_STATUSES, isTerminal,
statusLabel, priorityLabel, typeLabel, resolutionLabel, defaultResolutionFor,
nextTransitions`. `RESOLUTION_VALUES` als Typ-Hilfe.

## Task 2 — `cockpit-table-actions.ts` resolution-Bugfix
**Test:** ergänze `cockpit-table-actions.test.ts` — `transitionTicket('t1','done','fixed')`
→ Body enthält `resolution:'fixed'`; `transitionTicket('t1','in_progress')` → kein `resolution`.
**Impl:** Signatur `transitionTicket(id, status, resolution?)`; Body bedingt um
`resolution` ergänzen. Rückwärtskompatibel.

## Task 3 — `CockpitTable.svelte` (Übersicht)
**Test:** `CockpitTable.test.ts` — Default blendet `done` aus (Ticket mit status
`done` nicht sichtbar bis Chip „Alle"/„Erledigt"); „Mehr anzeigen" bei > limit;
Spaltenkopf (`data-testid="table-header"`) vorhanden. Bestehende Tests grün halten
(Default „Aktiv" zeigt `open`+`in_progress` → 2 Zeilen).
**Impl:** Chips = Aktiv(Default)/In Arbeit/Review/Blockiert/Erledigt/Alle;
`visible` filtert `active` = nicht terminal; Client-`limit` (50) + „Mehr anzeigen";
Spaltenkopf-Grid; Mengen-Badge; `patchStatus` gibt bei done/archived
`defaultResolutionFor(t.type)` mit. Testids unverändert.

## Task 4 — `TicketRow.svelte`
**Test:** `TicketRow.test.ts` — Priorität-Optionen enthalten `kritisch`;
`in_progress`-Option zeigt „In Arbeit".
**Impl:** Option-Texte via Label-Maps; `ALL_PRIORITIES` für Priorität; Status-Set
= `WORKFLOW_STATUSES` mit Labels. Grid/Testids unverändert.

## Task 5 — `TicketDrawer.svelte` (Fokus)
**Test:** `TicketDrawer.test.ts` — Priorität-Select PATCHt (`/api/admin/tickets/t1`);
„Erledigt" sendet `resolution` im Body; Vollansicht-Link `href` enthält
`/admin/tickets/t1`. Bestehende Tests grün (≥3 `drawer-transition`, Titel/Desc PATCH).
**Impl:** Kopf extId+Titel; Status/Priorität als Badges (`statusLabel`/`priorityLabel`);
Priorität-Select editierbar; `nextTransitions(status)` → Buttons; done/archived →
`resolution`-Select (Default `defaultResolutionFor(type)`) → an `transitionTicket`;
Footer [Vollansicht öffnen → /admin/tickets/${ticket.id}] [Schließen]; Leerzeile weg.

## Task 6 — `CockpitSidebar.svelte` (featureselect Navigation)
**Test:** `CockpitSidebar.test.ts` — Suchfeld (`data-testid="feature-filter"`)
filtert auf passende Features; Aktiv-Filter-Checkbox blendet voll-erledigte Features
aus; Produkt-Titel-Klick togglet Collapse. Bestehende Tests grün.
**Impl:** lokaler `filter`-String + `activeOnly`-Bool + `collapsed`-Set (localStorage);
`displayedProducts` derived (Features nach Titel/extId + Aktiv-Filter, leere Produkte
raus); Produkt-Heading als Button mit Collapse. `onSelectFeature(extId)`/Testids unverändert.

## Task 7 — `TicketCreateModal.svelte` + `Cockpit.svelte`
**Test:** `TicketCreateModal.test.ts` — mit `products`-Prop rendert `<optgroup>`
(Label = Produkt-Titel) und Option-Wert = `feature.id`. Ohne `products` flacher
Fallback (bestehende Tests grün).
**Impl:** Modal nimmt optional `products: ProductNode[]`; `<optgroup>`-Rendering;
`Cockpit.svelte` reicht `products={portfolio?.products ?? []}` durch.

## Task 8 — Verifikation & PR
1. `cd website && pnpm vitest run` (alle Cockpit-Tests grün).
2. Repo-Root: `task test:changed`.
3. `task freshness:regenerate` && `task freshness:check` (S1–S4-Ratchet).
4. `task test:inventory` (Test-Inventar regenerieren) + Commit, falls geändert.
5. Commit pro Task (oder gebündelt), Push, `gh pr create`, sofort
   `gh pr merge <n> --squash --auto`.
6. Ticket anlegen/verlinken (`scripts/ticket.sh`), Plan stagen.

## Manuelle Verifikation (nach Deploy)
`/admin/cockpit` auf mentolder: Default-Ansicht zeigt nur aktive Tickets; ein
Ticket auf „Erledigt" setzen funktioniert (kein Rollback); Sidebar-Suche findet ein
Feature; Create-Modal-Dropdown ist nach Produkt gruppiert; Drawer-Vollansicht-Link
öffnet `[id].astro`.
