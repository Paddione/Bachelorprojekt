---
ticket_id: T011498
plan_ref: openspec/changes/sdlc-deck-leiste-overflow/tasks.md
status: active
date: 2026-08-17
---

# Design: sdlc-deck-leiste-overflow

_Ticket: T011498_

## Problem

Auf `/sdlc/cockpit?deck=plattform` ragt die rechte Deck-Leiste (Z5) horizontal über den
Viewport hinaus: die zweite Kartenspalte des ControlPanels (DRY RUN, DAILY CAP,
SPAWN HARNESS) und der StatusStrip sind abgeschnitten, die Seite bekommt horizontalen
Overflow. Reproduziert am 2026-08-17 auf `web.localhost`, Viewport 1513×812.

## Ursache (belegt)

`DeckPlattform.svelte` (T008016/E4) bettet drei für volle Seitenbreite gebaute
Komponenten in die Grid-Spalte `minmax(240px, 320px)` von `.ls-main`
(`cockpit.astro:138`) ein:

| Komponente | Breiten-Problem |
|---|---|
| `ControlPanel.svelte` | `.control-panel__grid` mit `repeat(2, 1fr)` + 1.5rem Gap/Padding; Grid-Items schrumpfen nicht unter `min-content` |
| `FactoryObservability.svelte` | `.kpi-row` mit `repeat(4, 1fr)`; `.phase-label`/`.phase-val` mit `min-width: 5rem` |
| `FactoryBudgetPage.svelte` | `padding: 2rem`, `max-width: 1400px`, breite `.data-table` |

Alle drei tragen `@media (max-width: …)`-Breakpoints (500/768/900/1024 px), die die
**Viewport**-Breite messen — auf Desktop greifen sie nie, obwohl der Container nur
~320 px breit ist. Das Grid overflowt seine Spalte; kein Vorfahre clippt horizontal.

## Entscheidung: CSS Container Queries

`.deck-leiste__body` wird Query-Container (`container-type: inline-size`). Die drei
Komponenten erhalten `@container`-Regeln, die unterhalb einer Container-Breite von
480 px auf einspaltige, kompakte Layouts umstellen. Da ausschließlich das
Plattform-Deck diese Komponenten einbindet (verifiziert per grep, einzige
Verwendungsstelle `DeckPlattform.svelte`) und `@container`-Regeln ohne
Container-Vorfahren inert sind, ist der Umbau nebenwirkungsfrei.

Spec-Bezug: `openspec/specs/sdlc-cockpit.md` definiert die Panel-Größe „Deck" als
*kompakte* Z5-Kartengröße — der Ist-Zustand verletzt das; dieser Change setzt es um.

### Verworfene Alternativen

- **DeckLeiste-Spalte verbreitern:** verschiebt das Problem nur; Z4 verliert Fläche.
- **`overflow-x: hidden` auf der Leiste:** versteckt Inhalte statt sie zu layouten.
- **Viewport-Media-Queries nachschärfen:** kann Container- und Viewport-Breite
  prinzipiell nicht unterscheiden (Deck ist schmal bei breitem Viewport).

## Risiken

- Browser-Support für `@container` ist in allen Evergreen-Browsern gegeben
  (Chrome/Edge 105+, Firefox 110+, Safari 16+); das Cockpit ist development-only.
- `FactoryBudgetPage`-Tabellen bleiben auch einspaltig breit → zusätzlich
  `overflow-x: auto` auf dem Tabellen-Wrapper innerhalb der Kompakt-Regel.
