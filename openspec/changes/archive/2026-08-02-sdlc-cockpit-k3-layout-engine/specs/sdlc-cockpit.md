## ADDED Requirements

### Requirement: Layout Engine Surface Organization

Das Cockpit organisiert seine Fläche als Fokus-Spalte plus Arbeitsbereich, nicht als
Kachelwand (E3). Der Inhalt der Fokus-Spalte ist festgelegt und nicht konfigurierbar (D7).

The system SHALL organize the cockpit surface as a fixed focus column (rail) plus a free
workspace, and SHALL expose the rail contents as an immutable list of exactly four groups —
running epics, what needs attention, active agents, model servers — with no API, attribute
or stored setting that adds, removes or reorders them.

#### Scenario: Rail groups are fixed and immutable

- **GIVEN** the layout engine is loaded
- **WHEN** a caller reads the rail group list and attempts to mutate it
- **THEN** the list contains exactly the four groups in the order defined by D7
- **AND** the mutation attempt leaves the list unchanged

#### Scenario: Workspace holds cards or one full-surface panel

- **GIVEN** a desktop viewport and four panels assigned to the workspace
- **WHEN** the engine computes the placement
- **THEN** at most three panels are placed as cards and the remainder stays in the catalog
- **AND** when one panel is expanded to full surface, it is the only panel placed

### Requirement: Pointer-Based Rearrangement

Panels werden mit einer einzigen Eingabe-API bewegt: Pointer Events. Damit gilt derselbe
Codepfad für Maus, Touch und Stift.

The system SHALL move panels between catalog and workspace and reorder them within the
workspace using Pointer Events with pointer capture, SHALL NOT use the HTML5
drag-and-drop API, and SHALL restore the pre-drag arrangement when the pointer interaction
is cancelled.

#### Scenario: Cancelled drag restores the arrangement

- **GIVEN** a panel is being dragged from the catalog toward the workspace
- **WHEN** the pointer interaction is cancelled before release
- **THEN** the stored arrangement is identical to the arrangement before the drag started

### Requirement: Full-Surface Canvas Is One State In Two Layouts

Das Canvas-Panel lässt sich zur Vollfläche aufziehen und zurückholen. Es bleibt dabei ein
Zustand (E7) — der Inhalt wird nicht neu aufgebaut.

The system SHALL toggle a canvas panel between card and full-surface layout without
destroying and recreating its panel instance, so that unsaved canvas content and the
modified marker survive the toggle in both directions.

#### Scenario: Canvas content survives the full-surface toggle

- **GIVEN** a canvas panel with unsaved content in card layout
- **WHEN** it is expanded to full surface and collapsed back
- **THEN** the same panel instance is still registered for that element
- **AND** the unsaved content and the modified marker are unchanged

### Requirement: Layout Persistence Separate From Canvas Content

Die Anordnung ist Ansichtsvorliebe, kein Arbeitsergebnis. Sie wird getrennt vom
Canvas-Speicher abgelegt.

The system SHALL persist the arrangement under its own versioned `localStorage` key,
separate from the canvas content keys, SHALL restore the default arrangement when the
stored value is missing, unparseable or of an unknown version, and SHALL drop entries
referring to panels that no longer exist rather than failing to restore.

#### Scenario: Unknown stored version falls back to the default arrangement

- **GIVEN** a stored layout value whose version does not match the current one
- **WHEN** the engine restores the arrangement
- **THEN** the default arrangement is used and no canvas content key is read or written

### Requirement: Mobile Layout And Terminal Lock

Mobil gilt dieselbe Struktur untereinander statt nebeneinander (3.2). Das Terminal-Panel
ist mobil gesperrt (D8).

The system SHALL, for mobile viewports, render the rail as a top bar plus an expandable
bottom sheet containing the four rail groups, SHALL place workspace panels as a
single-panel stack in full-surface size only, and SHALL refuse to place a terminal panel
in the workspace, keeping it visibly locked rather than hidden.

#### Scenario: Terminal panel is locked, not silently dropped, on mobile

- **GIVEN** a mobile viewport and a terminal panel in the catalog
- **WHEN** the engine computes the placement
- **THEN** the terminal panel is reported as locked with a stated reason
- **AND** it is not placed in the workspace

#### Scenario: Mobile workspace shows one full-surface panel

- **GIVEN** a mobile viewport and three non-terminal panels assigned to the workspace
- **WHEN** the engine computes the placement
- **THEN** exactly one panel is visible and its size is the full-surface size

### Requirement: Layout Engine Stays Build-Free And Ships To Both Shells

Das Kit bleibt buildfrei (D1) und wird von beiden Hüllen über dieselben Dateien geladen.

The system SHALL ship the layout engine as a classic browser script without module syntax,
bundler step or npm dependency, and SHALL make it resolvable under `/cockpit/kit/` in the
repository checkout, in the dev server and inside the built website image.

#### Scenario: Layout asset resolves in the image layout

- **GIVEN** the website image build copies `website/` and the `.lavish` sources
- **WHEN** the resulting file layout is inspected
- **THEN** the layout engine files resolve under `public/cockpit/kit/` and are non-empty
