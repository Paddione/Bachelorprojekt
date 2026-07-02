---
ticket_id: T001433
plan_ref: openspec/changes/admin-redesign/tasks.md
status: active
date: 2026-07-02
---

# Admin-Redesign — kompakt, funktional, in der Sprache der Front Page

## Kontext

Nach der Sidebar-Umstrukturierung (T001317, adminmenu-restructure) ist die Admin-Navigation
strukturell schlanker, aber visuell und funktional heterogen geblieben. Vier unkoordinierte
Stil-Inseln koexistieren im Admin-Bereich:

1. `admin-foundation.css` / `admin/ui/*` — Indigo-Primärfarbe (`--admin-primary: #818cf8`)
2. `factory-tokens.css` / Tailwind-Utilities — Brass/Ink (bereits als „Mentolder Design System
   bridge" dokumentiert)
3. `FactoryBudgetPage.svelte` — hartkodierte Hex-Werte im Style-Block
4. `DoraDashboard.svelte` — eigenes viertes Kachel-/Farbschema

Dazu kommen konkrete Funktions- und Layout-Mängel (Ist-Aufnahme per Live-Screenshots vom
2026-07-02, siehe `.lavish/admin-redesign-brainstorm.html`):

- Die `admin/ui/*`-Komponentenbibliothek ist praktisch unbenutzt (AdminCard 2×, AdminStatCard 1×,
  AdminTabs 3×, AdminFormField 1×, **AdminBadge 0×**); nur AdminPageHeader (40/78) verbreitet.
- Namenskollision: globale CSS-Klasse `.admin-card` (admin-premium.css, radius 16px) ≠
  Svelte-Komponente `AdminCard.svelte` (radius 12px).
- Drei redundante Pipeline-Analytics-Flächen (Dev-Status-Analytics-Tab, `/admin/factory-observability`,
  `/admin/factory-budget`) — zwei davon ohne Navigationslink; `/admin/architektur` ebenfalls verwaist.
- Factory-Floor: weiße Kill-Switch-Karte als Fremdkörper, grüne Factory-Buttons als vierte
  Akzentfarbe, Kanban-„Halle" mit überlappenden, unleserlichen Phasen-Labels, Floating
  Token-Budget-Panel ragt in den Content.
- Sidebar scrollt bei geöffnetem Werkstatt-Akkordeon (9 Items schieben Infrastruktur unter den Fold).
- Dashboard funktional dünn: vier KPI-Karten, statische Dienste-Kacheln, viel Leerraum.
- `PipelineSidekickView.svelte`: fertiges, getestetes Kompakt-Pipeline-Widget — nirgends eingebunden.
- Cockpit: Ticket-Zeilen zeigen den Ticket-Inhalt nicht; Emoji-Icons (📁💾🔗) in Buttons.

## Ziel

Der gesamte Admin-Bereich übernimmt die editoriale Design-Sprache der mentolder Front Page —
Ink-Flächen, Brass-Akzente, Newsreader-Serif für Titel, Geist-Mono-Kicker mit Letter-Spacing,
Hairline-Trenner — und wird dabei kompakter und funktional dichter.

## Entscheidungen (Brainstorming 2026-07-02, Lavish-Board)

| # | Frage | Entscheidung |
|---|-------|--------------|
| 1 | Scope | **Kern zuerst**: Token-Set durchsetzen + Kernflächen (Sidebar, Dashboard, Pipeline, Cockpit); übrige ~55 Seiten erben die Tokens automatisch, Feinschliff folgt inkrementell |
| 2 | Sidebar | **Dichter + strukturell straffen** — kein Scrollen bei offenem Akkordeon |
| 3 | Analytics-Flächen | **Eine Pipeline-Seite mit Tabs**; Alt-Routen redirecten |
| 4 | Floor-Ansicht | **Conveyor only** — Kanban-Modus entfällt |
| 5 | Tokens | **Brass/Ink überall** — factory-tokens.css wird Admin-weite Basis, Indigo verschwindet |
| 6 | Ticket-Inhalte | **Expand-Row im Cockpit** |
| 7 | Dashboard-Widgets | **Pipeline-Kompakt-Widget + Postfach-Vorschau** |
| — | DORA (User-Annotation) | **`/admin/dora` entfällt ersatzlos**; CFR-Messung bleibt via `scripts/vda.sh cfr` |

## Design

### D1 — Token-Fundament

`factory-tokens.css` wird die Admin-weite Token-Basis. `admin-foundation.css` behält die
`--admin-*`-Namen, definiert sie aber als **Alias-Schicht** auf die Brass/Ink-Werte
(`--admin-primary: var(--brass)`, `--admin-bg: var(--ink-900)`, Statusfarben → Sage/Danger …).
Dadurch erben alle Admin-Seiten, die `--admin-*` konsumieren, den neuen Look ohne Einzeländerung.

- Ladereihenfolge in `AdminLayout.astro`: factory-tokens.css wird vor admin-foundation.css
  geladen (Basis → Alias), admin-premium.css konsumiert nur noch Token-Werte.
- `.admin-card`-Kollision: die globale Klasse in `admin-premium.css` und `AdminCard.svelte`
  konsumieren dieselben `--admin-card-radius/-padding`-Tokens (eine Wertequelle).
- Chart-Farben ausschließlich aus `factory-chart-colors.ts`; die lokale `PHASE_COLORS`-Kopie in
  `FactoryObservability.svelte` und die Hex-Hardcodes in `FactoryBudgetPage.svelte` entfallen.
- `AdminBadge.svelte` (bisher 0 Verwendungen) wird in Brass/Sage/Danger-Varianten restyled und
  zum Standard-Chip für Status/Phase in Cockpit-Expand-Row und Pipeline-Tabs. Kein Löschen.
- Kore-Brand: `kore-app.css` erhält Overrides für die `--admin-*`-Aliase (Copper-Palette), damit
  korczewski-Instanzen konsistent umschalten — bisher blieben `admin/ui/*`-Komponenten dort
  mentolder-farbig.
- Fremdfarben werden getilgt: kein Cyan (Observability-Badges), kein Grün/Violett
  (Dashboard-Dienst-Icons), kein Orange (Promoten-Button), keine blauen Card-Borders.

### D2 — Sidebar (AdminSidebarNav.astro, AdminLayout.astro)

- Item-Höhe reduziert (~44px → ~34px), Icon-Größe 16px, kompaktere vertikale Rhythmik.
- Sektions-Labels als Mono-Kicker mit Hairline davor (Front-Page-Muster „— PRAXISNAH.").
- Aktiver Zustand: Brass-Marker (linke Kante) + Brass-Text statt Indigo-Flächenfüllung.
- Werkstatt-Akkordeon bleibt; Abnahmekriterium: **alle Sektionen inkl. geöffnetem Akkordeon
  passen ohne Sidebar-Scroll in einen 900px-Viewport**.
- Sidebar-Item „Pipeline" (→ `/admin/pipeline`) in der Infrastruktur-Sektion; der bisherige
  Dashboard-Shortcut „Dev Status" wird zu „Pipeline", der „DORA"-Shortcut entfällt.
- Von den Änderungen berührte Inline-`style=""`-Attribute im `AdminLayout.astro` wandern in die
  CSS-Schicht (kein Komplett-Rewrite des Layouts — nur was das Redesign ohnehin anfasst).

### D3 — Dashboard (admin.astro, AdminShortcuts.svelte)

- **Pipeline-Kompakt-Widget**: `PipelineSidekickView.svelte` wird als Dashboard-Widget
  eingebunden (Lane-Leiste mit Auslastungs-Balken, SSE-live, Klick → `/admin/pipeline`).
  Die Komponente existiert samt Test — sie wird verdrahtet, nicht neu gebaut.
- **Postfach-Vorschau**: die neuesten offenen Inbox-Items (Titel, Alter, Direktlink) als
  kompakte Liste; nutzt die bestehende Inbox-Datenquelle, die heute das Sidebar-Badge speist.
- KPI-Zeile kompakter: Mono-Ziffern, Hairline-Trenner statt vier einzelner Boxen.
- Dienste-Kacheln kleiner, Icons monochrom Brass.
- Der Tailwind-Utility-Block „Infrastruktur & Dev" in `AdminShortcuts.svelte` wird auf
  Token-Klassen umgestellt (Konsistenz mit D1).

### D4 — Pipeline-Seite (`/admin/pipeline`, ersetzt `/dev-status`)

`dev-status.astro`/`DevStatusTabs.svelte` ziehen um nach `/admin/pipeline`. Tab-Bar wird
`AdminTabs.svelte` (statt eigener Tab-Implementierung). Tabs:

| Tab | Inhalt |
|-----|--------|
| Floor | Conveyor-Ansicht (einzige Floor-Ansicht; Kanban-Modus samt Toggle und `localStorage['ff-view']` entfällt) |
| Planung | bestehendes Planungsbüro |
| Analytics | bestehende KpiGrid/Throughput/Heatmap/ShippedBar mit Token-Palette |
| Kosten | **neu**: FactoryObservability + FactoryBudgetPage zusammengeführt (Kosten/Tokens/Provider-Charts + Budget-Limit-Verwaltung) |
| Steuerung | bestehendes Control Panel (1:1 übernommen) |
| Abhängigkeiten | bestehender Abhängigkeiten-Tab (1:1 übernommen) |

Nur der Kosten-Tab ist neu; Planung, Steuerung und Abhängigkeiten ziehen unverändert um.

Floor-Restyling (in `FactoryFloor.svelte` + Subkomponenten, per Extraktion — nicht inline
wachsen, S1-Headroom nur 114 LOC):

- Kill-Switch-Karte in Ink/Brass-Statuskarte (statt weißer Fremdkörper).
- Factory/Manuell-Buttons als Brass-Pill (statt grün), Promoten-Button ebenso (statt orange).
- Stationen nummeriert im Stil der Front-Page-Angebotsliste (Mono `01`–`06`, Hairlines,
  Serif-Stationsnamen); „Station frei"-Platzhalter dezenter.
- Token-Budget-Panel wird in den Kosten-Tab integriert (kein Floating-Panel mehr über dem Floor).
- Alle `data-testid`-Attribute (`floor-hall`, `floor-leitstand`, `floor-qa` …) bleiben unverändert.

Routen-Migration: `/dev-status`, `/admin/factory-observability`, `/admin/factory-budget`
→ 301-Redirect-Stubs auf `/admin/pipeline` (Muster wie bestehende Redirect-Stubs, z. B.
`admin/bugs.astro`). Externe Referenzen auf `/dev-status` (AdminShortcuts, `planungsbuero.astro`
→ `/dev-status?tab=planung`) werden umgezogen.

### D5 — Cockpit: Expand-Row (Cockpit.svelte / CockpitTable.svelte)

- Klick auf eine Ticket-Zeile klappt eine Detailfläche unter der Zeile auf:
  Beschreibung (gerendert), Phase-Stepper (bestehende `PhaseStepper`-Komponente),
  PR-/Plan-Links (`ticket_links`), letzte Phase-Events.
- Datenquelle: bestehende Ticket-Detail-API (lazy geladen beim Aufklappen, kein Vorab-Fetch
  der ganzen Liste).
- Emoji-Buttons (📁💾🔗) → Icon-Buttons aus `admin-icons.ts`; Indigo-Filter-Pills → Brass.
- Genau eine Zeile gleichzeitig offen (Accordion-Verhalten); Zustand nicht persistiert.

### D6 — DORA-Entfernung

- `website/src/pages/admin/dora.astro` wird zum 301-Redirect auf `/admin/pipeline?tab=analytics`;
  `DoraDashboard.svelte` und zugehörige tote Aufrufe entfallen.
- Dashboard-Shortcut „DORA" entfällt (D3).
- Die DORA/CFR-Datenerhebung (`scripts/vda.sh cfr`, CFR-Gate G-DORA03) bleibt unberührt —
  nur die UI-Fläche verschwindet.

## Nicht-Ziele

- Kein Redesign der ~55 übrigen Admin-Seiten in diesem Change (sie erben nur die Tokens).
- Kein Umbau der Datenmodelle, APIs oder der Factory-Pipeline-Logik (reines UI/UX-Redesign;
  einzige neue Datenzugriffe: Inbox-Vorschau und lazy Ticket-Detail für Expand-Row nutzen
  Bestehendes).
- Keine Änderung am Portal-/Kundenbereich oder an der öffentlichen Website.
- `/admin/architektur` bleibt unverlinkt (separates Aufräumthema, nicht Teil dieses Changes).

## Constraints

| Constraint | Konsequenz |
|-----------|------------|
| `FactoryFloor.svelte` 386/500 LOC | Kanban-Entfernung schafft Luft; neues Markup in Subkomponenten extrahieren |
| E2E-Selektoren (`floor-*` data-testids) | unverändert lassen; Kanban-bezogene Assertions in `fa-factory-floor.spec.ts` anpassen |
| Kore-Brand | Token-Overrides in `kore-app.css` müssen die neuen Aliase abdecken |
| Merge = Abschluss (T001092) | Ein Change, ein PR; Tasks im Plan so schneiden, dass jeder Zwischenstand grün ist |
| S3 (keine Brand-Literale) | Farben/Namen nur über Tokens/Props |

## Teststrategie

- **Vitest**: Expand-Row-Datenaufbereitung (Helper), Dashboard-Inbox-Vorschau (Helper),
  Token-Alias-Integrität (admin-foundation referenziert nur factory-tokens-Variablen —
  Snapshot/Regex-Test), `PipelineSidekickView`-Einbindung (bestehender Test bleibt grün).
- **Playwright**: `fa-factory-floor.spec.ts` auf Conveyor-only anpassen; Redirect-Checks für
  `/dev-status`, `/admin/dora`, `/admin/factory-observability`, `/admin/factory-budget`;
  Sidebar-No-Scroll-Kriterium (Viewport 900px, Akkordeon offen).
- **BATS** (`tests/spec/`): Delta-Szenarien zu den vier betroffenen SSOT-Specs
  (`website-core`, `software-factory`, `admin-cockpit`, `dora-dashboard`).
- `task test:inventory` nach Test-Änderungen regenerieren und committen.

## Risiken

- **Breite der Token-Umstellung**: Ein falscher Alias-Wert färbt viele Seiten gleichzeitig um.
  Gegenmaßnahme: Alias-Schicht in einem eigenen Task mit visueller Stichprobe (Dashboard,
  eine Formularseite, eine Tabellen-Seite) vor den Flächen-Tasks.
- **Kanban-Entfernung**: Nutzer mit `localStorage['ff-view']='kanban'` landen automatisch im
  Conveyor (Fallback im Code, kein Fehler).
- **Dev-Status-Umzug**: verstreute interne Links (`planungsbuero.astro`, AdminShortcuts,
  evtl. Docs) müssen per Grep vollständig gefunden werden; Redirect fängt Reste ab.

## Betroffene SSOT-Specs (OpenSpec-Deltas)

- `website-core` — Tokens, Sidebar, Dashboard, AdminLayout
- `software-factory` — Pipeline-Seite, Floor Conveyor-only, Kosten-Tab
- `admin-cockpit` — Expand-Row, Icon-Buttons
- `dora-dashboard` — Removal (Redirect, UI-Entfernung)
