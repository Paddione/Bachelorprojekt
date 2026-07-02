# admin-redesign — Proposal

## Why

Der Admin-Bereich ist nach der Struktur-Umstrukturierung (T001317) visuell und funktional
heterogen: vier unkoordinierte Stil-Inseln (Indigo-Admin-Tokens, Brass-Factory-Tokens,
Hex-Hardcodes, DORA-Eigenschema), drei redundante Pipeline-Analytics-Flächen (zwei davon
unverlinkt), eine bei offenem Akkordeon scrollende Sidebar und ein funktional dünnes Dashboard.
Das Admin-UI soll die editoriale Design-Sprache der mentolder Front Page übernehmen (Ink, Brass,
Newsreader-Serif, Mono-Kicker, Hairlines) und dabei kompakter und funktional dichter werden.

## What Changes

- **Token-Konsolidierung**: `factory-tokens.css` wird Admin-weite Basis; `admin-foundation.css`
  wird zur Alias-Schicht (`--admin-primary` → Brass statt Indigo). `.admin-card`-Namenskollision
  aufgelöst; Chart-Farben nur noch aus `factory-chart-colors.ts`; `AdminBadge` restyled und als
  Standard-Chip eingesetzt; Kore-Overrides für die neuen Aliase.
- **Sidebar kompakter**: dichtere Items, Mono-Kicker-Sektionslabels mit Hairline, Brass-Marker
  für aktive Items; kein Sidebar-Scroll bei offenem Werkstatt-Akkordeon (900px-Viewport).
- **Dashboard dichter**: `PipelineSidekickView` (bisher verwaist) als Pipeline-Kompakt-Widget;
  neue Postfach-Vorschau; kompaktere KPI-Zeile; monochrome Dienst-Icons.
- **Eine Pipeline-Seite**: `/dev-status` zieht um nach `/admin/pipeline` (Tabs via `AdminTabs`);
  neuer Kosten-Tab führt FactoryObservability + FactoryBudgetPage zusammen; Floor wird
  **Conveyor-only** (Kanban-Modus entfällt) und in Front-Page-Sprache restyled;
  `data-testid`s bleiben. Alt-Routen (`/dev-status`, `/admin/factory-observability`,
  `/admin/factory-budget`) werden 301-Redirects.
- **Cockpit Expand-Row**: Klick auf eine Ticket-Zeile klappt Beschreibung, Phase-Stepper,
  PR-/Plan-Links und letzte Events auf; Emoji-Buttons → Icon-Buttons.
- **BREAKING (UI)**: `/admin/dora` entfällt ersatzlos (Redirect auf
  `/admin/pipeline?tab=analytics`); `DoraDashboard.svelte` wird entfernt. Die CFR-/DORA-Messung
  (`scripts/vda.sh cfr`) bleibt unberührt.

## Capabilities

### New Capabilities

<!-- keine — alle Änderungen modifizieren bestehende Capabilities -->

### Modified Capabilities

- `website-core`: Admin-Design-Token-Basis wechselt auf Brass/Ink-Alias-Schicht; Sidebar-Dichte-
  und No-Scroll-Requirement; Dashboard erhält Pipeline-Widget + Postfach-Vorschau.
- `software-factory`: Factory-Floor nur noch Conveyor-Ansicht; Pipeline-Flächen konsolidiert
  unter `/admin/pipeline` mit neuem Kosten-Tab; Alt-Routen redirecten.
- `admin-cockpit`: Ticket-Zeilen erhalten Expand-Row mit Ticket-Inhalt (Beschreibung,
  Phase-Stepper, Links, Events).
- `dora-dashboard`: UI-Fläche wird entfernt (Redirect); Messung bleibt CLI-only.

## Impact

- `website/src/styles/{admin-foundation,admin-premium,factory-tokens}.css`, `website/public/brand/korczewski/kore-app.css`
- `website/src/components/admin/AdminSidebarNav.astro`, `website/src/layouts/AdminLayout.astro`
- `website/src/pages/admin.astro`, `website/src/components/admin/AdminShortcuts.svelte`
- `website/src/pages/dev-status.astro` → `website/src/pages/admin/pipeline.astro`, `DevStatusTabs.svelte`
- `website/src/components/FactoryFloor.svelte` (+ Extraktion in Subkomponenten), `ConveyorBelt`/`StationColumn`
- `website/src/components/factory/{FactoryObservability,FactoryBudgetPage,factory-chart-colors.ts,…}`
- `website/src/components/assistant/PipelineSidekickView.svelte` (Einbindung)
- `website/src/components/admin/{Cockpit,CockpitTable}.svelte`, `website/src/components/admin/ui/AdminBadge.svelte`
- Entfernt: Kanban-Zweig im Floor, `DoraDashboard.svelte`; Redirect-Stubs: `dora.astro`, `factory-observability.astro`, `factory-budget.astro`, `dev-status.astro`
- Tests: `tests/e2e/specs/fa-factory-floor.spec.ts` (Conveyor-only), neue Redirect-/Sidebar-Checks, Vitest für Expand-Row/Inbox-Vorschau/Token-Aliase; `website/src/data/test-inventory.json` regenerieren
- Keine DB-Schema-Änderungen; keine API-Vertragsänderungen (nur lesende Wiederverwendung bestehender Endpunkte)
