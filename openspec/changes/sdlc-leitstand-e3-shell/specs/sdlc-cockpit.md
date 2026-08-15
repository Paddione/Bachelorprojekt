## ADDED Requirements

### Requirement: Leitstand Zone Model

Das Cockpit organisiert seine Fläche als fünf Zonen mit je genau einem Zweck statt als
Command-Bar+Overview/Fokus+Rail-Layout. Z1–Z4 bilden eine permanente Struktur; nur Z5 schaltet
zwischen Nebendomänen (Decks) um.

The system SHALL organize the `/sdlc/cockpit` surface as five zones, each serving exactly one
purpose: Z1 Statusband (persistent top status band with a Help toggle), Z2 Attention-Strip
(persistent, surfaces blocked/stuck tickets and active cooldowns, never covered by any other
zone), Z3 Stationen-Achse (persistent nine-station value-stream axis: Triage, Planung, Scout,
Design, Plan, Implement, Verify, Deploy, Ship), Z4 Kontextzone (selection-driven: renders a KPI grid when nothing is
selected, a station list/PlanningOffice when a station is selected, or a ticket DetailPanel when a
ticket is selected), and Z5 Deck-Leiste (the side-module strip with a deck switcher for Qualität,
Plattform, KI, and Wissen). Z1 through Z4 SHALL remain structurally present regardless of the
current selection or the active Z5 deck; Z5 SHALL be the only zone whose displayed module set
changes.

#### Scenario: All zones are visible with nothing selected

- **GIVEN** the cockpit is loaded with no `station`, `ticket` or `deck` query parameter
- **WHEN** the shell renders
- **THEN** Z1, Z2, Z3, Z4 and Z5 all render
- **AND** Z4 shows the idle-state KPI grid

#### Scenario: Deck switch does not hide Z2 or Z3

- **GIVEN** the Z5 Deck-Leiste shows the KI deck active
- **WHEN** the user switches the active deck to Plattform
- **THEN** Z2 Attention-Strip and Z3 Stationen-Achse remain visible and unchanged
- **AND** only the Z5 module content changes

#### Scenario: Zone testids stay mapped to floor components

- **GIVEN** the zone shell renders with a station selected
- **WHEN** the DOM is inspected for `data-testid` attributes
- **THEN** the existing floor testids (`factory-floor`, `floor-leitstand`, `floor-hall`,
  `floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`) resolve inside the
  appropriate zone without being renamed

### Requirement: Cockpit Selection URL Scheme

Auswahl und Deck-Wahl werden als kombinierbare Query-Parameter auf `/sdlc/cockpit` abgebildet
statt als eigene Pfad-Modi. Alte Parameter werden auf das neue Schema gemappt statt entfernt.

The system SHALL express cockpit selection state as query parameters on `/sdlc/cockpit`:
`?station=<phase-slug>` selects a station on the Z3 axis, `?ticket=<id>` selects a ticket for the
Z4 DetailPanel, and `?deck=<qualitaet|plattform|ki|wissen>` selects the active Z5 deck; all three
SHALL be combinable in a single URL. The legacy `?mode=overview|fokus` and `?phase=<phase>`
parameters SHALL be mapped onto the new scheme by a normalization step: `phase=triage|planung|
deploy|ship` map to the same-named station, `phase=review` maps to `station=verify`,
`phase=bauen` maps to no station (the axis is always visible), `mode=insights` maps to
`deck=ki`, and `mode=overview` maps to an empty selection; explicit new parameters take
precedence over legacy ones when both are present. Legacy parameters are normalized rather
than being removed outright. Selection changes triggered from within the shell (station click,
ticket click, deck switch) SHALL update the URL via `history.pushState` and SHALL NOT trigger a
full page reload; the server SHALL still render the correct initial state for a direct or
deep-linked request.

#### Scenario: Deep link renders server-side correctly

- **GIVEN** a request to `/sdlc/cockpit?station=implement&deck=ki`
- **WHEN** the page is server-rendered
- **THEN** Z3 shows "Implement" as the selected station
- **AND** Z4 shows the Implement station content
- **AND** Z5 shows the KI deck active

#### Scenario: Legacy URL maps to the new scheme

- **GIVEN** a request to `/sdlc/cockpit?mode=fokus&phase=planung`
- **WHEN** the page resolves
- **THEN** the effective selection is `station=planung`
- **AND** the rendered content matches a direct `/sdlc/cockpit?station=planung` request

#### Scenario: Selection change causes no reload

- **GIVEN** the cockpit is open with no selection
- **WHEN** the user clicks a station on Z3
- **THEN** the URL updates to include `?station=<phase>` via `history.pushState`
- **AND** no full document reload occurs (the page's navigation/load event does not fire again)

### Requirement: Leitstand Purpose Registry

Jede Shell-Komponente deklariert ihren Zweck, ihre Datenquelle und ihre Aktionen maschinenlesbar,
damit Redundanz und mehrdeutige Zwecke auffallen statt sich anzusammeln.

The system SHALL maintain a purpose registry at
`components/website/src/lib/sdlc/leitstand-purpose-registry.ts` carrying one entry per shell
component (the Z1–Z5 zone components and their constituent panels/decks), each entry declaring
`zweck` (a human-readable one-sentence purpose string), `datenquelle` (the adapter/store/endpoint
the component reads from), and `aktionen` (the list of write actions the component can trigger,
possibly empty). Every `zweck` string SHALL be unique across the registry. The registry SHALL be
checked by an automated guard that fails when a shell component has no registry entry or when two
entries share the same `zweck` text.

#### Scenario: A fully covered, unique registry passes

- **GIVEN** every shell component under the cockpit zone tree has exactly one registry entry
- **AND** all `zweck` strings in the registry are pairwise distinct
- **WHEN** the purpose-registry guard runs
- **THEN** it passes

#### Scenario: Missing entry fails the guard

- **GIVEN** a shell component file exists under the cockpit zone tree with no corresponding
  registry entry
- **WHEN** the purpose-registry guard runs
- **THEN** it fails and names the component that is missing an entry

#### Scenario: Duplicate purpose text fails the guard

- **GIVEN** a registry that otherwise satisfies full coverage
- **AND** two of its entries carry the identical `zweck` string
- **WHEN** the purpose-registry guard runs
- **THEN** it fails and names both conflicting entries

## MODIFIED Requirements

### Requirement: Layout Engine Surface Organization

Das Cockpit organisiert seine Fläche nicht mehr als Command Bar plus Hauptfläche mit zwei Modi
(Overview/Fokus) und einer kontext-sensitiven Rail, sondern als fünf senkrecht gestapelte
Leitstand-Zonen: Z1 Statusband oben, darunter Z2 Attention-Strip, darunter Z3 Stationen-Achse,
darunter die Hauptfläche Z4 Kontextzone, mit Z5 Deck-Leiste als seitlicher Seitenmodul-Leiste neben
Z4. Die Positionierung ist damit ein Stapel aus vier permanenten Bändern plus einer seitlichen,
umschaltenden Leiste statt eines zweispaltigen Rail+Workspace-Layouts.

The system SHALL organize the `/sdlc/cockpit` surface as five zones arranged top-to-bottom: Z1
Statusband spanning the full width at the top, Z2 Attention-Strip directly beneath it, Z3
Stationen-Achse beneath that, Z4 Kontextzone as the main content area, and Z5 Deck-Leiste as a
side-module strip alongside Z4. The system SHALL NOT organize the surface as a Command Bar plus a
two-mode (Overview/Fokus) main area with a context-sensitive rail.

#### Scenario: Surface layout is a five-zone stack

- **GIVEN** the cockpit is loaded
- **WHEN** the layout engine computes the placement
- **THEN** Z1 is at the top spanning full width
- **AND** Z2 and Z3 follow beneath it
- **AND** Z4 occupies the main content area
- **AND** Z5 renders as a side-module strip

#### Scenario: Old Command-Bar/Rail structure no longer applies

- **GIVEN** the layout engine is loaded
- **WHEN** its DOM structure is inspected
- **THEN** no element carries the legacy `CommandBar` or `CockpitRail` role
- **AND** the five zone containers (Z1–Z5) are present instead

### Requirement: Pointer-Based Rearrangement

Die Pointer-Events-Mechanik zum Verschieben von Panels bleibt unverändert; die Begriffe "Catalog"
und "Workspace" entfallen, da diese Konzepte im Zonenmodell nicht existieren. Panels werden
stattdessen zwischen Z5-Deck-Karten und Z4-Kontextzonen-Slots bewegt bzw. innerhalb dieser
umsortiert.

The system SHALL move panels between the Z5 deck strip and Z4 Kontextzone slots, and reorder them
within a zone, using Pointer Events with pointer capture, SHALL NOT use the HTML5 drag-and-drop
API, and SHALL restore the pre-drag arrangement when the pointer interaction is cancelled. The
terms "catalog" and "workspace" SHALL NOT appear in the implementation or its data model, since
those layout concepts no longer exist.

#### Scenario: Cancelled drag restores the arrangement

- **GIVEN** a panel is being dragged from the Z5 deck strip toward a Z4 slot
- **WHEN** the pointer interaction is cancelled before release
- **THEN** the stored arrangement is identical to the arrangement before the drag started

#### Scenario: No catalog/workspace vocabulary remains

- **GIVEN** the panel rearrangement module
- **WHEN** its public API and data model are inspected
- **THEN** no identifier or option in that module is named `catalog` or `workspace`

### Requirement: Full-Surface Canvas Is One State In Two Layouts

Das Canvas-Panel lässt sich weiterhin zur Vollfläche aufziehen und zurückholen, ohne neu
aufgebaut zu werden; die Vollfläche gilt jetzt innerhalb von Z4 statt innerhalb von Card/Workspace.

The system SHALL toggle a canvas-type panel hosted in Z4 Kontextzone between its normal Z4 card
layout and a full-surface layout without destroying and recreating its panel instance, so that
unsaved canvas content and the modified marker survive the toggle in both directions.

#### Scenario: Canvas content survives the full-surface toggle

- **GIVEN** a canvas panel with unsaved content in its normal Z4 layout
- **WHEN** it is expanded to full surface and collapsed back
- **THEN** the same panel instance is still registered for that element
- **AND** the unsaved content and the modified marker are unchanged

### Requirement: Mobile Layout And Terminal Lock

Mobil gilt weiterhin dieselbe Zonenstruktur, nur senkrecht gestapelt statt eines eigenen
Bottom-Sheets für die Stationsnavigation (das eigenständige Mobile-Bottom-Sheet-Requirement
entfällt ersatzlos, siehe REMOVED Requirements). Das Terminal-Panel bleibt mobil gesperrt (D8).

The system SHALL, for mobile viewports, stack the five Leitstand zones vertically in the same
Z1→Z5 order used on desktop, without introducing a separate bottom-sheet or swipe-navigation
surface for station selection. The system SHALL refuse to place a terminal-type panel in Z4 or Z5
on mobile viewports, keeping it visibly locked with a stated reason rather than silently hiding
it.

#### Scenario: Terminal panel is locked, not silently dropped, on mobile

- **GIVEN** a mobile viewport and a terminal-type panel eligible for Z4
- **WHEN** the shell computes placement
- **THEN** the terminal panel is reported as locked with a stated reason
- **AND** it is not placed in Z4

#### Scenario: Zones stack vertically on mobile without a bottom sheet

- **GIVEN** a mobile viewport
- **WHEN** the Leitstand shell renders
- **THEN** Z1–Z5 are stacked vertically in order
- **AND** no bottom-sheet or swipe-navigation container is rendered for station selection

### Requirement: Layout Engine Stays Build-Free And Ships To Both Shells

Das K1-Kit bleibt buildfrei (D1) und wird jetzt von drei statt zwei Hüllen über dieselben Dateien
geladen: den beiden bestehenden K1-Belegartefakten sowie neu der Leitstand-Zonen-Shell.

The system SHALL ship the layout engine as a classic browser script without module syntax,
bundler step or npm dependency, and SHALL make it resolvable under `/cockpit/kit/` in the
repository checkout, in the dev server and inside the built website image, for all three consuming
shells: `reference-board.html`, `cockpit-shell.html`, and the Leitstand zone-model shell at
`/sdlc/cockpit`.

#### Scenario: Layout asset resolves in the image layout

- **GIVEN** the website image build copies `components/website/` and the `.lavish` sources
- **WHEN** the resulting file layout is inspected
- **THEN** the layout engine files resolve under `public/cockpit/kit/` and are non-empty

#### Scenario: The Leitstand shell loads the same kit files

- **GIVEN** `/sdlc/cockpit` is requested
- **WHEN** its network requests are inspected
- **THEN** it loads its panel runtime from the same `/cockpit/kit/` files as `cockpit-shell.html`
- **AND** no duplicated copy of the kit is loaded

### Requirement: Pipeline-Inhalt lebt als Panel im Cockpit

Die Fläche `/sdlc/cockpit` SHALL den `DevStatusTabs`-Baum durch das Leitstand-Zonenmodell (Z1–Z5)
ersetzen statt durch die frühere Command-Bar+Overview/Fokus-Architektur. Der `PipelinePanel`-
Wrapper entfällt weiterhin, da das Unified Panel System Svelte-Komponenten nativ unterstützt
(unverändert gegenüber dem Ursprungs-Requirement).

The system SHALL replace the `DevStatusTabs` tree at `/sdlc/cockpit` with the five-zone Leitstand
shell (Z1–Z5) instead of the Command-Bar/Overview-Fokus architecture. The `PipelinePanel` wrapper
component SHALL continue not to exist, since the Unified Panel System registers Svelte components
natively.

#### Scenario: PipelinePanel wrapper is removed

- **GIVEN** the repository after this change
- **WHEN** the component files are inspected
- **THEN** `PipelinePanel.svelte` no longer exists
- **AND** no component imports from `PipelinePanel.svelte`

#### Scenario: Station pre-selection survives the architectural change

- **GIVEN** a request to `/sdlc/cockpit?station=planung`
- **WHEN** the page is rendered
- **THEN** Z3 shows "Planung" as the selected station
- **AND** Z4 renders the Planung station content

### Requirement: K1-03 — Panel-Rahmen

`panel.css` definiert weiterhin Panel-Frame, Kopf, Body, Aktions-Slot (4 Zustände: verfügbar/
gesperrt/bestätigung offen/läuft) und Kontext-Slot. Die drei Größen heißen jetzt Deck/Kontext/
Vollbild statt Rail/Karte/Vollbild, da die Rail-Zone im Zonenmodell nicht mehr existiert — Deck
entspricht der kompakten Kartengröße in Z5, Kontext der Standardgröße in Z4. (D2–D6, D8, D12)

`panel.css` SHALL continue to define the panel frame, header, body, an action slot with four
states (available / locked / confirmation-pending / running), and a context slot. It SHALL define
three panel sizes named Deck, Kontext, and Vollbild — Deck for the compact Z5 deck-strip card
size, Kontext for the standard Z4 panel size, and Vollbild for the full-surface size — replacing
the former Rail/Karte/Vollbild naming, since the Rail zone no longer exists.

#### Scenario: Action slot exposes four states

- **GIVEN** a panel rendered with `panel.css`
- **WHEN** its action slot markup is inspected
- **THEN** exactly four state classes/attributes are defined: available, locked,
  confirmation-pending, running

#### Scenario: Panel sizes are named Deck/Kontext/Vollbild

- **GIVEN** `panel.css`
- **WHEN** its size variants are inspected
- **THEN** the three defined sizes are `deck`, `kontext`, and `vollbild`
- **AND** no size variant named `rail` exists

### Requirement: The cockpit header reports its actual data source

Das Verhalten bleibt unverändert: der Datenmodus wird aus dem tatsächlichen Adapter-Zustand
abgeleitet, kein Fixtext. Der Ort wandert vom Header ins Z1 Statusband.

The Leitstand SHALL indicate, within Z1 Statusband, whether it is serving live data or fixtures
based on the adapter's actual state. A fixed label SHALL NOT be used.

#### Scenario: Live data is labelled as live in Z1

- **GIVEN** the adapter is serving live endpoints
- **WHEN** Z1 Statusband renders
- **THEN** it does not claim fixture mode

### Requirement: Header-Status spiegelt Livedaten statt Fixtures

Das Status-Badge zeigt weiterhin den realen Datenmodus (Livedaten) an und nicht mehr "Fixtures
(K1)", sobald `adapter.js` Livedaten liefert — es sitzt jetzt in Z1 Statusband statt im
früheren Header.

Das Z1-Statusband-Badge SHALL den realen Datenmodus (Livedaten) anzeigen und nicht mehr "Fixtures
(K1)", sobald `adapter.js` Livedaten liefert.

#### Scenario: Badge zeigt Livedaten in Z1

- **GIVEN** das Cockpit lädt mit einem konfigurierten Adapter, der Livedaten liefert
- **WHEN** Z1 Statusband gerendert wird
- **THEN** zeigt das Status-Element den Livedaten-Status an
- **AND** es zeigt nicht "Fixtures (K1)"

### Requirement: Command Bar — Persistentes Status-Band

Die bisherige Command Bar wird zu Z1 Statusband: dasselbe Prinzip eines permanent sichtbaren
Statusbands, aber ohne Overview/Fokus-Umschalter — stattdessen mit einem Help-Toggle.

The system SHALL render a persistent Z1 Statusband at the top of the SDLC Leitstand that remains
visible regardless of the active station, ticket or deck selection. The Z1 Statusband SHALL
display cluster health status, watchdog state, active agent count, slot usage, pending PR count,
and the next factory tick countdown. It SHALL also host a Help toggle that opens the help/purpose
overlay affordance; it SHALL NOT host an Overview/Fokus mode toggle, since that mode distinction
no longer exists.

#### Scenario: Statusband is always visible

- **GIVEN** the SDLC Leitstand page is loaded
- **WHEN** any station/ticket/deck selection is active
- **THEN** Z1 is rendered and visible at the top of the page
- **AND** it displays at minimum: cluster health indicator, active agent count, and slot usage

#### Scenario: Cluster health is derived from live status

- **GIVEN** the target cluster is reachable
- **WHEN** Z1 fetches cluster status
- **THEN** it shows a green indicator with the cluster name
- **AND** when the cluster is unreachable, it shows a red indicator with an error message

#### Scenario: Help toggle opens without changing the selection

- **GIVEN** Z1 is rendered with a station selected
- **WHEN** the user clicks the Help toggle
- **THEN** the help/purpose overlay opens
- **AND** the current `station`/`ticket`/`deck` selection in the URL is unchanged

### Requirement: Overview-Modus — Lifecycle-Status auf einen Blick

Der bisherige Overview-Modus wird zum Leerlaufzustand von Z4: ohne Stations-/Ticket-Auswahl zeigt
Z4 ein KPI-Raster mit den Phasenzahlen; Attention-Daten liegen jetzt permanent in Z2, nicht mehr
modusabhängig.

The system SHALL render, in Z4 Kontextzone, a KPI grid aggregating the status of all nine
value-stream stations (Triage, Planung, Scout, Design, Plan, Implement, Verify, Deploy, Ship)
whenever no station and no ticket is selected. Each station SHALL display its ticket count by
status, including stations with zero tickets. The KPI grid SHALL contain a structural PR section;
populating it with live pull-request/CI data requires a PR-listing API that does not exist yet
and is deferred to the E4 change of epic T007553 — until then the section renders an explicit
empty marker and attempts no fetch. Blocked/stuck-ticket aggregation and active cooldowns SHALL
NOT be part of this KPI grid, since Z2 Attention-Strip already carries them permanently.

#### Scenario: All stations are displayed with counts

- **GIVEN** tickets exist across the nine stations and no selection is active
- **WHEN** Z4 renders its idle state
- **THEN** each of the nine stations is shown
- **AND** each station displays the count of tickets in that station
- **AND** stations with zero tickets are still visible

#### Scenario: PR section is present but deferred

- **GIVEN** no PR-listing API exists yet and no selection is active
- **WHEN** Z4 renders its idle state
- **THEN** the PR section is present with an explicit empty/deferred marker
- **AND** no request to a non-existent PR endpoint is attempted

#### Scenario: Attention data is not duplicated in the KPI grid

- **GIVEN** ticket T003120 is blocked
- **WHEN** Z4 renders its idle KPI grid
- **THEN** T003120 does not appear inside the KPI grid itself
- **AND** it is shown in Z2 Attention-Strip instead

### Requirement: Fokus-Modus — Drilldown in eine SDLC-Phase

Der bisherige Fokus-Modus wird zur Stations-Auswahl: ein Klick auf eine Station in Z3 setzt
`?station=` und lässt Z4 den passenden Inhalt zeigen (Liste/PlanningOffice statt eines separaten
Modus).

The system SHALL, when a station is selected via `?station=<phase>`, render the content relevant
to that station in Z4 Kontextzone. The station selection SHALL be reflected in the URL as the
`station` query parameter. Z4 SHALL reuse existing Svelte components where applicable
(FactoryFloor-derived list/lane components for the Fertigung stations (Scout through Deploy), PlanningOffice for Triage
and Planung).

#### Scenario: Station selection renders the relevant content in Z4

- **GIVEN** the "Implement" station is selected via `?station=implement`
- **WHEN** the page is rendered
- **THEN** Z4 shows the Implement station's list content (workpieces/lanes)
- **AND** the URL carries `?station=implement`

#### Scenario: Switching stations updates content and URL

- **GIVEN** `?station=planung` is active and PlanningOffice is shown in Z4
- **WHEN** the user selects the "Implement" station on Z3
- **THEN** Z4 switches to the Implement content
- **AND** the URL updates to `?station=implement` via `history.pushState` without a full reload

### Requirement: Kontext-sensitive lebendige Rail

Die bisherige kontext-sensitive Rail wird zur selektionsgetriebenen Z4 Kontextzone: ohne Auswahl
zeigt sie das KPI-Raster, bei Stations-Auswahl die Stationsliste/PlanningOffice, bei
Ticket-Auswahl das DetailPanel. Attention/Epics/Agents/Modelle sind nicht mehr rail-exklusiv —
Attention liegt permanent in Z2, die übrigen Karten wandern in die Z5 Decks.

The system SHALL render Z4 Kontextzone with content that adapts to the current selection rather
than to an Overview/Fokus mode: with no station and no ticket selected, Z4 SHALL show the KPI
grid; with a station selected, Z4 SHALL show that station's list/PlanningOffice content; with a
ticket selected, Z4 SHALL show the ticket DetailPanel. All Z4 content SHALL be populated from live
data sources via the adapter/`floorStore`, not from static HTML. Attention data, formerly shown
only in the rail during Overview mode, SHALL instead be shown permanently in Z2 regardless of the
Z4 selection.

#### Scenario: Z4 content changes with selection

- **GIVEN** no station and no ticket is selected
- **WHEN** Z4 is rendered
- **THEN** it shows the KPI grid
- **AND** when a ticket is subsequently selected via `?ticket=<id>`, Z4 switches to the DetailPanel
  for that ticket

#### Scenario: Z4 content adapts to the selected station

- **GIVEN** `?station=implement` is active
- **WHEN** Z4 is rendered
- **THEN** it shows implement-relevant data: slot usage, active workpieces, agent logs
- **AND** when the station changes to `planung`, Z4 shows DoR scores and queue depth instead

#### Scenario: Attention is visible independent of Z4 selection

- **GIVEN** a ticket DetailPanel is shown in Z4
- **WHEN** Z2 is inspected
- **THEN** blocked/stuck tickets and active cooldowns are still shown there, unaffected by the Z4
  selection

### Requirement: Unified Panel System

Panels werden weiterhin über ein einheitliches Panel-System gerendert, das sowohl die Legacy-
Kit-Panel-Laufzeit als auch Svelte-Komponenten als First-Class-Panel-Typen unterstützt; der
`PipelinePanel`-Wrapper bleibt entfernt. Die Begriffe "Rail-Panels" und "Workspace-Panels"
entfallen zugunsten von Z4- und Z5-Panels.

The system SHALL render all panels — Z4 Kontextzone panels and Z5 Deck-Leiste panels — through a
single panel system that supports both the legacy Kit panel runtime and Svelte components as
first-class panel types. The `PipelinePanel` wrapper component SHALL remain removed. A Svelte
component SHALL be registrable as a panel without needing a protective wrapper.

#### Scenario: Svelte components are registered as native panels

- **GIVEN** a Svelte component (e.g., a station list view) is registered as a Z4 panel
- **WHEN** the panel system initializes
- **THEN** the component is mounted into the panel frame without a `PipelinePanel` wrapper
- **AND** the panel's lifecycle (refresh, resize, destroy) works correctly

#### Scenario: The Panel.run() method no longer adopts the Svelte area

- **GIVEN** the panel system is initialized
- **WHEN** `Panel.run()` scans the DOM for `[data-panel-type]` elements
- **THEN** it does not clear the content of Svelte-registered panels
- **AND** Svelte panels are registered before the auto-initialization scan

### Requirement: Insights-Tab mit Trace-Recording

Das Trace-Recording-Backend bleibt unverändert: Agent-Entscheidungs-Traces, Factory-Lauf-
Ergebnisse und Partial-Plan-Outcomes werden weiterhin für nachgelagertes Finetuning aufgezeichnet.
Der Zugang zur Insights-Ansicht wandert vom Command-Bar-Button ins Z5 KI-Deck.

The system SHALL provide an Insights view accessible from the Z5 KI-Deck (rather than from a
Command Bar button). The Insights view SHALL display meaningful metrics (not the previous bloated
analytics KPIs) and SHALL record agent decision traces, factory run results, and partial plan
outcomes for downstream finetuning use.

#### Scenario: Insights is accessible from the KI deck

- **GIVEN** Z5 Deck-Leiste is showing the KI deck
- **WHEN** the user opens the Insights module within it
- **THEN** the Insights view is displayed
- **AND** it shows metrics computed from actual data (not the old Throughput/Heatmap/ShippedBar
  components)

#### Scenario: Trace recording captures agent actions

- **GIVEN** the factory executes a partial plan
- **WHEN** the execution completes
- **THEN** the outcome is recorded as a trace entry
- **AND** the trace entry includes: agent model, ticket ID, phase, duration, and result

## REMOVED Requirements

### Requirement: Layout Persistence Separate From Canvas Content

**Reason:** Im Zonenmodell ist die Anordnung strukturell fest — Z1–Z4 sind permanent und in
fester Reihenfolge, nur Z5 schaltet zwischen Decks um. Es gibt keine frei anordenbare
Panel-Arrangement mehr, deren Ansichtsvorliebe von Canvas-Inhalt getrennt persistiert werden
müsste, und folglich keinen versionierten `localStorage`-Anordnungs-Schlüssel.

**Migration:** Bestehende `localStorage`-Einträge unter dem alten Arrangement-Key werden von der
neuen Shell ignoriert; es ist keine Datenmigration nötig, da das Zonenlayout keinen Nutzerzustand
mehr aus diesem Schlüssel liest.

### Requirement: Wählbare Default-Ansicht

**Reason:** Es gibt keinen Overview/Fokus-Modus mehr, den man als Standardansicht vorwählen
könnte. Die Selektion lebt jetzt ausschließlich in der URL (siehe "Cockpit Selection URL Scheme"),
nicht in einer persistierten Nutzerpräferenz.

**Migration:** Ein Aufruf von `/sdlc/cockpit` ohne Query-Parameter zeigt immer den Z4-Leerlauf-
zustand (KPI-Raster) — es gibt keinen individuellen Default mehr, der gesetzt oder migriert werden
müsste.

### Requirement: Mobile Bottom-Sheet + Swipe-Navigation

**Reason:** Das Zonenmodell definiert für E3 keine eigene mobile Bottom-Sheet- oder
Swipe-Interaktionsform für die Stationsnavigation; die Zonen stapeln sich mobil stattdessen
einfach senkrecht in derselben Z1→Z5-Reihenfolge wie auf dem Desktop (siehe MODIFIED Requirement
"Mobile Layout And Terminal Lock"). Swipe-Gesten sind kein Bestandteil dieses Changes.

**Migration:** Keine — die Terminal-Lock-Garantie aus dem Ursprungs-Requirement bleibt über das
modifizierte Requirement "Mobile Layout And Terminal Lock" erhalten; nur die Bottom-Sheet-/
Swipe-Mechanik entfällt.
