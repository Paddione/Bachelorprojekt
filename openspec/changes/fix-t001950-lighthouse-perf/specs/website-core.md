## ADDED Requirements

### Requirement: PortalSidekick Drawer Assets Deferred from Critical Path

`sidekick-panels.css` and the `PortalSidekick` drawer sub-views (Support,
Questionnaire, Help, AgentGuide, Mediaviewer, Terminal, Cockpit, AiQuality,
Logs) SHALL NOT be part of the public homepage's render-blocking critical
path or its eagerly-hydrated JavaScript chunk, since none of them are
visible until the user opens the FAB drawer and navigates to a specific
view.

#### Scenario: Sidekick panel styles load asynchronously on the public layout

- **GIVEN** the public `Layout.astro` renders the homepage
- **WHEN** the document head is emitted
- **THEN** `sidekick-panels.css` is referenced via `<link rel="preload" as="style">` with an `onload` swap (plus a `<noscript>` fallback), not a blocking `<link rel="stylesheet">`

#### Scenario: Drawer sub-views load on demand

- **GIVEN** `PortalSidekick` is hydrated with `client:idle` on the public homepage
- **WHEN** the FAB drawer has not been opened yet
- **THEN** none of the 9 drawer sub-view components are present in `PortalSidekick`'s initial JavaScript chunk — each loads via a dynamic `import()` only once its view is selected
