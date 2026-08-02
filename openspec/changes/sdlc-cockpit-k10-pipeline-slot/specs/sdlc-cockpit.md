## ADDED Requirements

### Requirement: Genau eine SDLC-Fläche im Admin-Menü (E1/E2)

Das Admin-Menü SHALL genau einen Eintrag auf die SDLC-Fläche führen, und dieser Eintrag
SHALL auf `/admin/cockpit` zeigen. Ein separater *Pipeline*-Eintrag SHALL nicht mehr
existieren; die Aktiv-Erkennung des Cockpit-Eintrags SHALL die Alt-Pfade `/admin/pipeline`
und `/admin/tickets` mit abdecken.

#### Scenario: Sidebar carries no Pipeline entry

- **GIVEN** the admin sidebar navigation is rendered
- **WHEN** its navigation entries are enumerated
- **THEN** exactly one entry targets `/admin/cockpit`
- **AND** no entry targets `/admin/pipeline`

#### Scenario: Dashboard widget links to the cockpit

- **GIVEN** the admin dashboard at `/admin`
- **WHEN** the pipeline summary widget header link is read
- **THEN** it points at `/admin/cockpit`

### Requirement: Pipeline-Inhalt lebt als Panel im Cockpit

Die Fläche `/admin/cockpit` SHALL den bestehenden `DevStatusTabs`-Baum in einem
Panel-Rahmen rendern, der ausschließlich die geteilte Kit-CSS-Schicht verwendet (E22). Der
Rahmen SHALL kein `data-panel-type` tragen, damit die Panel-Laufzeit ihn nicht adoptiert
und seinen Inhalt überschreibt. Server-seitige Vorbefüllung über `getFloor()` und die
Tab-Vorwahl über den Query-Parameter `tab` SHALL erhalten bleiben.

#### Scenario: Kit runtime does not adopt the Svelte panel

- **GIVEN** the pipeline panel markup is present in the document
- **WHEN** the kit panel runtime performs its auto-initialisation over `[data-panel-type]`
- **THEN** the panel element is not registered in the panel registry
- **AND** the panel body content is left untouched

#### Scenario: Tab pre-selection survives the move

- **GIVEN** a request to `/admin/cockpit?tab=planung`
- **WHEN** the page is rendered
- **THEN** the planning tab is the initially active tab of the pipeline panel

### Requirement: Alt-Pfade lösen auf das Cockpit auf

Die Redirect-Tabelle SHALL für `/admin/planungsbuero`, `/admin/dora`,
`/admin/factory-budget` und `/admin/factory-observability` direkt auf
`/admin/cockpit?tab=…` zeigen, ohne Zwischenschritt über `/admin/pipeline`. Der Pfad
`/admin/pipeline` SHALL als query-erhaltende 301-Weiterleitung auf `/admin/cockpit`
bestehen bleiben und SHALL nicht in die Redirect-Tabelle aufgenommen werden, da diese den
Query-String nicht durchreicht.

#### Scenario: Legacy path resolves in one hop

- **GIVEN** a request to `/admin/dora`
- **WHEN** the redirect map resolves the path
- **THEN** the target is `/admin/cockpit?tab=analytics`

#### Scenario: Pipeline path keeps its query string

- **GIVEN** a request to `/admin/pipeline?tab=kosten`
- **WHEN** the page responds
- **THEN** it is a 301 to `/admin/cockpit?tab=kosten`

### Requirement: Der verwaiste Admin-Cockpit-Baum ist entfernt

Der Komponentenbaum unterhalb von `Cockpit.svelte` SHALL nicht mehr im Repository
existieren, soweit die einzelnen Dateien nachweislich keinen weiteren Nutzer haben. Die
weiterhin genutzte Ticket-Fläche — der Sidekick, die `cockpit-*`-Bibliotheken und die
Endpunkte unter `/api/admin/cockpit/` — SHALL unverändert bestehen bleiben.

#### Scenario: Orphan tree is gone while the live surface remains

- **GIVEN** the repository after this change
- **WHEN** the component files of the orphan tree are looked up
- **THEN** none of them exists
- **AND** the cockpit sidekick view and the `/api/admin/cockpit/portfolio` endpoint still exist

### Requirement: OF4 — mobile-cockpit.css entfällt

`website/src/styles/mobile-cockpit.css` SHALL entfallen. Die Datei beschreibt die Struktur
des alten Admin-Cockpits und wird von keiner Seite, keinem Layout und keinem Stylesheet
geladen; ihr Wegfall ist damit keine Verhaltensänderung.

#### Scenario: No stylesheet references the removed file

- **GIVEN** the repository after this change
- **WHEN** `website/` is searched for references to `mobile-cockpit`
- **THEN** no reference remains
- **AND** `website/src/styles/admin-responsive.css` still exists and is still referenced
