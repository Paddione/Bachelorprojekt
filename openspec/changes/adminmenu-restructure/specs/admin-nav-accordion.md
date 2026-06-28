## ADDED Requirements

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
