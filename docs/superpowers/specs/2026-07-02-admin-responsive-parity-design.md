---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-02
---

# Design: Adminsuite Responsive-Parität (Desktop ⇄ Mobile)

## Problem

Die Adminsuite (`website/src/pages/admin/**`, Astro + Svelte) hat eine vollständig
responsive Shell (`AdminLayout.astro`: Off-Canvas-Sidebar, Mobile-Topbar, Burger),
aber der **Seiteninhalt** vieler Views ist einseitig:

- **Gruppe C — desktop-only:** breite `<table>`-Layouts und Multi-Spalten-Grids ohne
  jegliche Mobile-Anpassung (kein `overflow-x`-Wrapper, kein Karten-Kollaps, keine
  `@media`-Blöcke). Betroffen u. a.: `rechnungen.astro` (592), `projekte.astro` (408),
  `projekte/[id].astro` (923), `zeiterfassung.astro` (261), `termine.astro` (773),
  `kalender.astro` (412), `[clientId].astro` (745) + `portal/*Tab.astro`,
  `systemtest/board.astro` (419), `fragebogen/[assignmentId].astro` (619),
  `members*.astro`, sowie table-basierte Komponenten (`NewsletterAdmin.svelte` 556,
  `WissenHub.svelte` 366, `ContentDb.svelte` 149, `coaching/*` 106–598,
  `aktionen/*` 86–124, `ops/DatenbankTab.svelte` 178, `platform/HardwareTab.svelte` 95).
- **Gruppe E — mobile-first ohne Desktop-Optimierung:** schmale Single-Column-Formulare
  (`einstellungen/*`, `inhalte.astro`/`InhalteEditor.svelte` u. a.), die auf breiten
  Screens die Fläche nicht nutzen.
- Bereits paritätisch (kein Handlungsbedarf): Cockpit (Container-Query Tabelle→Karte via
  `mobile-cockpit.css`), Factory-Bereich (`FactoryFloor` + `MobileTabBar`), `clients.astro`,
  Redirect-Stubs.

## Constraints

1. **S1-LOC-Ratchet, Budget 0:** Alle großen Admin-Seiten sind exakt auf ihrer aktuellen
   Zeilenzahl gebaselined (`docs/code-quality/baseline.json`). Jede Netto-Zeile in diesen
   Dateien trippt CI. ⇒ Markup-Änderungen dort nur **zeilenneutral** (Klasse an bestehende
   Zeile anhängen) oder gar nicht (reines CSS-Targeting).
2. **Styling-Realität:** überwiegend Inline-`style`, Tailwind nur sporadisch. Zentrale
   CSS-Dateien + Klassen sind der gangbare Weg, kein Utility-Refactor.
3. **Konventionen:** Mobile-Grenze `767px`, Tablet `768–1023px`, Desktop `≥1024px`;
   Container-Queries (480/1024) nur im Cockpit-Muster. Keine Breakpoint-Tokens vorhanden.
4. Keine Brand-Domain-Literale in Code (S3); keine Verhaltens-/API-Änderungen.

## Entscheidung: Layered Approach

Drei Schichten, von „wirkt überall sofort" zu „gezielte UX-Aufwertung":

### Layer 1 — Globaler Responsive-Fallback (neues Stylesheet, 0 Markup-Änderungen)

Neue Datei `website/src/styles/admin-responsive.css`, eingebunden in
`AdminLayout.astro` (1 Import-Zeile, nicht gebaselined bzw. zeilenneutral einbaubar):

- **Mobile (`max-width: 767px`):**
  - Alle Tabellen im Admin-Content (`.admin-main table` bzw. äquivalenter
    Content-Wrapper-Selektor aus `admin-premium.css`) werden horizontal scrollbar:
    `display: block; overflow-x: auto; -webkit-overflow-scrolling: touch;
    max-width: 100%;` — jede desktop-only Tabelle wird damit sofort mobil *benutzbar*.
  - Touch-Targets: Buttons/Inputs im Admin-Content min. 44px Höhe.
  - Mehrspaltige Inline-Grids kollabieren defensiv (`grid-template-columns: 1fr` für
    als `.admin-grid-collapse` markierte Container — opt-in, keine Blind-Regel auf
    alle Grids, um Kalender/Slot-Picker nicht zu zerstören).
- **Desktop (`min-width: 1024px`):**
  - Aufwertung der mobile-first Views: als `.admin-form-wide` markierte
    Formular-Container bekommen `max-width` + 2-Spalten-Grid für Feldgruppen;
    Default-Regel: Content-Container erhalten eine sinnvolle `max-width` statt
    voller Viewport-Breite, wo heute unbegrenzt.

### Layer 2 — Generalisiertes Tabelle→Karte-Muster (opt-in)

Das Cockpit-Muster (`mobile-cockpit.css`, Container-Queries) wird als generische
opt-in-Klasse **`.admin-table-collapse`** in `admin-responsive.css` generalisiert:
unter 480px Container-Breite kollabiert die Tabelle zu Karten
(`thead` versteckt, `td` als Label/Wert-Zeilen via `data-label`-Attribut).
Angewendet auf die drei wichtigsten Alltags-Tabellen — **zeilenneutral** (Klasse und
`data-label` an bestehende Zeilen anhängen):

1. `pages/admin/rechnungen.astro` (Rechnungsliste)
2. `pages/admin/projekte.astro` (Projektliste)
3. `pages/admin/zeiterfassung.astro` (Zeiterfassung; nicht gebaselined, 261 Zeilen —
   kleines Budget vorhanden)

Alle übrigen Gruppe-C-Tabellen bleiben beim Layer-1-Scroll-Fallback (bewusster
YAGNI-Schnitt; weitere Kollaps-Kandidaten sind Follow-up-Tickets).

### Layer 3 — ui/-Bausteine intrinsisch responsive

`website/src/components/admin/ui/` (nicht gebaselined, Budget vorhanden):

- `AdminTabs.svelte` (139): Tab-Leiste horizontal scrollbar auf Mobile
  (`overflow-x: auto`, keine Umbrüche, Scroll-Snap).
- `AdminStatCard.svelte` (112) / `AdminCard.svelte` (70): volle Breite + kompakte
  Paddings unter 767px.
- `AdminPageHeader.svelte` (105): Header-Zeile bricht auf Mobile um
  (Titel + Aktionen stacken statt overflow).

Diese Bausteine werden von vielen Views gerendert — der Effekt ist zentral.

## Nicht-Ziele

- Kein per-View-Neudesign aller 30+ Admin-Views (Follow-ups).
- Keine Änderungen an Cockpit/Factory (bereits paritätisch).
- Keine API-/Verhaltensänderungen, keine neuen Abhängigkeiten.
- Keine Breakpoint-Token-Einführung (separates Refactor, außerhalb Scope).

## Fehlerbehandlung / Risiken

- **Risiko globaler Tabellen-Regel:** `display: block` auf `<table>` ändert
  Tabellen-Semantik fürs Layout. Gegenmaßnahme: Regel nur unter 767px, nur im
  Admin-Content-Scope; Views mit eigenem Mobile-Layout (Cockpit) sind über ihre
  Container-Query-Styles spezifischer bzw. werden per `:not()`-Ausnahme
  (`[data-container="cockpit"]`) ausgenommen.
- **Risiko Grid-Kollaps-Blindregel:** vermieden — Kollaps ist opt-in
  (`.admin-grid-collapse`).
- **Budget-0-Verstöße:** Pflicht-Check pro geänderter Datei im Plan
  (`wc -l` vor/nach == identisch für gebaselinte Dateien).

## Teststrategie

- **BATS** (`tests/spec/<parent-spec>.bats`): `admin-responsive.css` existiert, ist in
  `AdminLayout.astro` referenziert, enthält die Kern-Selektoren
  (`.admin-table-collapse`, Mobile-Table-Fallback, `min-width: 1024px`-Block);
  Budget-0-Dateien zeilenneutral (Zeilenzahl-Assertion gegen Baseline).
- **Bestandssicherung:** `task test:changed`, `task freshness:regenerate`,
  `task freshness:check`, `task test:inventory` nach Teständerungen.
- **Manuell/E2E (Follow-up):** visueller Smoke auf 375px/1440px für rechnungen,
  projekte, zeiterfassung, einstellungen.

## Betroffene Dateien (mit S1-Status)

| Datei | Zeilen | Baseline | Änderung |
|---|---|---|---|
| `website/src/styles/admin-responsive.css` | neu | — | Layer 1+2 Regeln (~120–160 Zeilen) |
| `website/src/layouts/AdminLayout.astro` | 263 | nicht gebaselined | +1 Import |
| `website/src/pages/admin/rechnungen.astro` | 592 | 592 (**Budget 0**) | zeilenneutral: Klassen/`data-label` |
| `website/src/pages/admin/projekte.astro` | 408 | 408 (**Budget 0**) | zeilenneutral: Klassen/`data-label` |
| `website/src/pages/admin/zeiterfassung.astro` | 261 | nicht gebaselined | Klassen/`data-label`, minimales Wachstum ok |
| `website/src/components/admin/ui/AdminTabs.svelte` | 139 | nicht gebaselined | Mobile-Scroll |
| `website/src/components/admin/ui/AdminStatCard.svelte` | 112 | nicht gebaselined | Mobile-Kompakt |
| `website/src/components/admin/ui/AdminCard.svelte` | 70 | nicht gebaselined | Mobile-Kompakt |
| `website/src/components/admin/ui/AdminPageHeader.svelte` | 105 | nicht gebaselined | Mobile-Stack |
| ausgewählte `einstellungen/*`-Container | 57–175 | nicht gebaselined | `.admin-form-wide`-Klasse |

## Erfolgskriterien

1. Jede Admin-View mit Tabelle ist auf 375px-Viewport ohne horizontales
   Body-Scrolling benutzbar (Tabelle scrollt intern oder kollabiert zu Karten).
2. Rechnungen/Projekte/Zeiterfassung zeigen unter 480px Container-Breite Karten
   statt gequetschter Tabellen.
3. Einstellungs-/Formular-Views nutzen auf ≥1024px die Breite (kein einspaltiger
   Schlauch über volle Viewport-Breite).
4. CI grün inkl. S1-Ratchet (Budget-0-Dateien zeilenneutral).
