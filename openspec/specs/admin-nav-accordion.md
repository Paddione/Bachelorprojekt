# admin-nav-accordion

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu admin-nav-accordion ergänzen._

## Requirements

### Requirement: Werkstatt-Akkordeon in Admin-Sidebar
Die Admin-Sidebar MUSS alle Werkstatt-Tools (Content Hub, Wissensbasis, Assets, 3D Generator, App-Katalog, KI-Konfig., Prompts, Systemtest, Content-DB) hinter einem einzigen aufklappbaren Akkordeon-Button gruppieren. Der Button trägt das Label "Werkstatt".

#### Scenario: Akkordeon standardmäßig zugeklappt
- **WHEN** the admin loads any page not matching a Werkstatt sub-path
- **THEN** the Werkstatt accordion is collapsed and sub-items are not visible

#### Scenario: Akkordeon aufgeklappt bei aktivem Pfad
- **WHEN** the admin navigates to any Werkstatt sub-path (e.g. `/admin/inhalte`, `/admin/content-db`)
- **THEN** the Werkstatt accordion starts expanded so the active item is visible

#### Scenario: Toggle-Verhalten
- **WHEN** the admin clicks the "Werkstatt" accordion button
- **THEN** the sub-items toggle between visible and hidden

### Requirement: Akkordeon ohne Framework-Abhängigkeit
Das Akkordeon MUSS ohne Svelte-Island implementiert werden — nur via `<script>`-Block in `AdminSidebarNav.astro` mit `classList.toggle`.

#### Scenario: Kein Hydration-Overhead
- **WHEN** the admin sidebar is rendered
- **THEN** no Svelte hydration script is loaded for the accordion behavior

<!-- merged from change delta admin-nav-accordion.md (867b20c8ba5e) -->

### Requirement: Sessions-Eintrag in Sidebar-Sektion Geschäft

The admin sidebar SHALL expose a dedicated "Sessions" nav item in the
"Geschäft" section that links to `/admin/coaching/sessions` and is highlighted
active on that path. The existing "Studio" nav item MUST NOT claim
`/admin/coaching/sessions` in its `matches` array, so only one item is marked
active on the session list path.

#### Scenario: Sessions item highlights on the session list

- **GIVEN** an admin viewing `/admin/coaching/sessions`
- **WHEN** the sidebar renders
- **THEN** the "Sessions" item in the "Geschäft" section is marked active
- **AND** the "Studio" item is not marked active

#### Scenario: Studio item highlights on its own paths

- **GIVEN** an admin viewing `/admin/coaching/studio`
- **WHEN** the sidebar renders
- **THEN** the "Studio" item is marked active
- **AND** the "Sessions" item is not marked active

<!-- merged from change delta admin-nav-accordion.md (c9c0333277ba) -->