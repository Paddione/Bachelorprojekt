---
date: 2026-06-16
slug: cockpit-views-overhaul
status: draft
domains: [website]
ticket_id: T000877
plan_ref: null
---

# Cockpit: Ticketübersicht, Ticketfokus & Feature-Auswahl überarbeiten

## Problem (am Live-System verifiziert, 2026-06-16)

Das Projekt-Cockpit (`/admin/cockpit`) wurde für „wenige Features mit wenigen
Tickets" gebaut, läuft aber gegen **841 Tickets** (818 davon `done` = 97 %),
**132 Features** und **13 Produkte**. Jede Liste ist flach und unbegrenzt, und
die häufigste PM-Aktion ist kaputt:

1. **Ticketübersicht (`CockpitTable` + `TicketRow`)**
   - Rendert das komplette Ticket-Set des gewählten Features auf einmal
     (live ~670 Zeilen) — keine Paginierung, keine Begrenzung → träge, unscanbar.
   - Erledigte Tickets (97 %) ertränken die wenigen aktiven; kein Default-Filter.
   - Keine Spaltenköpfe; Status/Priorität als rohe Enum-Strings (`in_progress`,
     `mittel`); kein Mengen-Überblick.
   - **Bug:** Der Status-Select bietet `done` an, aber `transitionTicket(id, status)`
     sendet keine `resolution`. Der Server (`transition.ts` Z. 44) verlangt für
     `done`/`archived` zwingend eine `resolution` → **400** → optimistisches Update
     rollt zurück. **Ein Ticket lässt sich aus dem Cockpit gar nicht erledigen.**
   - **Bug:** Priorität-Select kennt nur `niedrig/mittel/hoch` — `kritisch` fehlt
     (obwohl gültiger Wert + `prio-kritisch`-CSS existiert).
   - Toter Chip: „Offen" → Status `open`, den es in den Daten gar nicht gibt.

2. **Ticketfokus (`TicketDrawer`)**
   - Sehr karg: rohe Enum-Texte, drei **hartcodierte** Transitions
     (in_progress/in_review/done) unabhängig vom aktuellen Status; `done` schlägt
     wegen fehlender `resolution` fehl (siehe oben).
   - Priorität/Typ/Komponente nicht editierbar; kein Link zur Vollansicht
     (`/admin/tickets/[id]` mit Timeline/Kommentaren); toter Footer-Leerraum.

3. **Feature-Auswahl („featureselect")** — beide Bedeutungen betroffen:
   - **Sidebar (`CockpitSidebar`):** flacher Scroll von 133 Features über 14
     Produkte, ohne Suche/Collapse/Aktiv-Filter.
   - **Create-Modal (`TicketCreateModal`):** das Feature-`<select>` listet alle
     133 Features flach, nicht nach Produkt gruppiert.

**Kernbefund:** Das Leiden ist *Skalierung*, nicht Styling. Lösung = Filter,
sinnvolle Defaults, Gruppierung, Paginierung — plus der echte `resolution`-Fix.

## Ziel / Erfolgskriterien

- Übersicht zeigt standardmäßig nur **aktive** Tickets (nicht done/archived) und
  rendert maximal eine begrenzte Menge mit „Mehr anzeigen".
- Ein Ticket lässt sich aus **Tabelle und Drawer** zuverlässig auf „Erledigt"
  setzen (mit korrekter `resolution`).
- Status/Priorität/Typ überall mit **deutschen Labels**; `kritisch` wählbar.
- Drawer: state-bewusste Transitions, editierbare Priorität, Link zur Vollansicht.
- Feature-Auswahl: Sidebar mit Suche + Produkt-Collapse + Aktiv-Filter;
  Create-Modal mit nach Produkt gruppiertem Dropdown (`<optgroup>`).
- Alle bestehenden Vitest-Unit-Tests und der FA-29-E2E bleiben grün; neue Tests
  für jede Verhaltensänderung.

## Nicht-Ziele (YAGNI)

- Keine echte DOM-Virtualisierung (Bibliothek) — einfache Client-Paginierung genügt.
- Keine Reimplementierung von Timeline/Kommentaren/Attachments im Drawer — dafür
  verlinkt der Drawer auf die bestehende Vollansicht `[id].astro`.
- Kein Server-/API-/Schema-Umbau; reine Frontend-Änderungen + ein Body-Feld
  (`resolution`) im bestehenden `/transition`-Aufruf.
- Keine Änderung an `BulkBar`, `SuggestionBar`, `cockpit-db.ts`.

## Architektur

### Neues pures Modul: `website/src/lib/tickets/cockpit-labels.ts` (S2-safe)
Single Source of Truth für Enum-Darstellung + Transitions-Logik. Importiert nur
Typen, keine Runtime-Abhängigkeit (kein Store, keine UI) — analog `cockpit-types.ts`.

- `STATUS_LABELS`, `PRIORITY_LABELS`, `TYPE_LABELS`, `RESOLUTION_LABELS` (DE).
- `ALL_PRIORITIES = ['niedrig','mittel','hoch','kritisch']`.
- `WORKFLOW_STATUSES` — kuratierte Status für Row-Select (real existierende:
  triage, backlog, in_progress, in_review, blocked, done).
- `ACTIVE_STATUSES` / `isTerminal(status)` — done/archived = terminal.
- `statusLabel/priorityLabel/typeLabel/resolutionLabel(x)` — Fallback auf Rohwert.
- `defaultResolutionFor(type)` → `bug`→`'fixed'`, sonst `'shipped'`.
- `nextTransitions(status)` → zulässige Folge-Stati für den Drawer (state-aware).

Begründung: zentralisiert Enum-Wissen, hält jede Komponente schlank (S1) und
konsistent; pures Modul ist trivial unit-testbar (Coverage-Guard erfüllt).

### Datenfluss (unverändert)
`cockpit.astro` (SSR Portfolio) → `Cockpit.svelte` (lädt Feature-Tickets) →
`CockpitSidebar` (Feature wählen) + `CockpitTable` (Tickets) + `TicketDrawer` +
`TicketCreateModal`. Store `cockpitStore` bleibt unverändert.

## Komponenten-Änderungen

### `cockpit-table-actions.ts` (Bugfix)
`transitionTicket(id, status, resolution?)`: hängt `resolution` an den Body, wenn
gesetzt. Rückwärtskompatibel (Param optional) → bestehende Tests bleiben grün.

### `CockpitTable.svelte` (Ticketübersicht)
- Chips neu: **Aktiv** (Default, = nicht done/archived) · In Arbeit · Review ·
  Blockiert · Erledigt · Alle. Toter `open`-Chip entfällt. `statusFilter`-Default
  = `'active'` (Pseudo-Wert).
- **Paginierung:** nur erste `limit` (Default 50) der gefilterten Liste rendern;
  Button „Mehr anzeigen (N weitere)" erhöht `limit` um 50.
- **Spaltenkopf-Zeile** (sticky), gleiches Grid wie `TicketRow`:
  „ ", „ ", ID, Titel, Status, Priorität, Erstellt.
- **Mengen-Badge** in der Toolbar: „X sichtbar · Y aktiv · Z erledigt".
- `patchStatus`: bei Ziel done/archived `defaultResolutionFor(ticket.type)` mitgeben.
- Alle `data-testid` (table-search, status-chip, status-select, open-create,
  row-checkbox, bulk-status, cockpit-table) bleiben unverändert.

### `TicketRow.svelte`
- Status-/Priorität-`<option>`-Texte via `STATUS_LABELS`/`PRIORITY_LABELS`
  (Werte bleiben Enum). Priorität-Select nutzt `ALL_PRIORITIES` (inkl. `kritisch`).
- Grid, Testids, Drag/Keyboard unverändert.

### `TicketDrawer.svelte` (Ticketfokus)
- Kopf zeigt `extId` + Titel-Label (Titel weiter unten editierbar).
- Status & Priorität als **beschriftete Badges**; Priorität via Select editierbar
  (`patchPriority`); Typ/Komponente/Erstellt als Labels.
- **State-aware Transitions** aus `nextTransitions(ticket.status)`; bei
  done/archived erscheint ein `resolution`-Select (Default per Typ), der Wert geht
  in den `/transition`-Call. Buttons behalten `data-testid="drawer-transition"`
  (Test erwartet ≥ 3 → für nicht-terminale Stati erfüllt).
- **Vollansicht-Link** `/admin/tickets/${ticket.id}` (UUID; `getTicketDetail`
  filtert `WHERE t.id`). Footer-Leerraum entfernt; Footer = [Vollansicht] [Schließen].

### `CockpitSidebar.svelte` (featureselect — Navigation)
- **Suchfeld** oben filtert Features live nach Titel (+ extId) über alle Produkte;
  leere Produkte werden beim Filtern ausgeblendet.
- **Aktiv-Filter** (Checkbox „nur Features mit offener Arbeit"): blendet Features
  aus, deren `rollup.open + inProgress + blocked === 0` (alles erledigt/leer).
- **Produkt-Collapse**: Klick auf Produkt-Titel klappt dessen Feature-Liste
  ein/aus; Zustand in `localStorage`.
- Testids (cockpit-sidebar, sidebar-feature, sidebar-hamburger) + `onSelectFeature(extId)`
  unverändert. Datei wächst auf ~340 Z. (< 500 S1-Limit, nicht baselined).

### `TicketCreateModal.svelte` + `Cockpit.svelte` (featureselect — Dropdown)
- Modal akzeptiert optional `products: ProductNode[]`; wenn gesetzt, rendert das
  Feature-`<select>` `<optgroup label={product.title}>` mit dessen Features (Werte
  = `feature.id`). Ohne `products` → bisheriger flacher Fallback (Test bleibt grün).
- `Cockpit.svelte` übergibt `products={portfolio?.products ?? []}` zusätzlich zu
  `features`/`defaultFeatureId`.

## Tests (TDD — rot zuerst)

- **`cockpit-labels.test.ts`** (neu): Labels, `ALL_PRIORITIES` enthält `kritisch`,
  `defaultResolutionFor('bug')==='fixed'` / sonst `'shipped'`, `isTerminal`,
  `nextTransitions`.
- **`cockpit-table-actions.test.ts`**: `transitionTicket(id,'done','fixed')` sendet
  `resolution` im Body; `transitionTicket(id,'in_progress')` ohne `resolution`.
- **`CockpitTable.test.ts`**: Default-Ansicht blendet `done` aus; „Mehr anzeigen"
  erscheint > limit und erweitert; Spaltenkopf vorhanden. Bestehende bleiben grün.
- **`TicketRow.test.ts`**: Priorität-Optionen enthalten `kritisch`; Status-Label
  „In Arbeit" für `in_progress` sichtbar.
- **`TicketDrawer.test.ts`**: Priorität-Select PATCHt; „Erledigt" sendet
  `resolution`; Vollansicht-Link auf `/admin/tickets/<uuid>`. Bestehende grün.
- **`CockpitSidebar.test.ts`**: Suche filtert Feature-Liste; Aktiv-Filter blendet
  voll-erledigte Features aus; Produkt-Collapse. Bestehende grün.
- **`TicketCreateModal.test.ts`**: mit `products` rendert `<optgroup>`. Bestehende grün.
- **FA-29 E2E**: unverändert grün (selektiert weiter `done`, wartet auf /transition).

## Verifikation (CI-Äquivalent)
`task test:changed` → `task freshness:regenerate` → `task freshness:check`
(S1–S4-Ratchet) → bei Test-Änderungen `task test:inventory` + Commit des Inventars.

## Risiken
- S1: alle Dateien unter Limit halten; Logik in `cockpit-labels.ts` auslagern.
- Test-Stabilität: `data-testid` strikt beibehalten.
- E2E mutiert ein Live-Ticket (done) — war vorher 400, ist danach erfolgreich; kein
  Bruch der Assertion (`await resp` akzeptiert jede Response).
