# Delta: sdlc-cockpit — E5 Help-Overlay, Absorption & Print-Light

## ADDED Requirements

### Requirement: Help Overlay Layer

Der Help-Toggle im Statusband legt einen Overlay-Layer über die Leitstand-Fläche, der die
Registry-Erklärungen in situ an der Position der jeweiligen Komponente rendert.

The system SHALL render, when the `[?]` toggle in the Z1 Statusband is active, an overlay layer
(`HelpOverlay.svelte`) above the cockpit surface that displays each registered component's
`zweck`, `datenquelle` and `aktionen` from `lib/sdlc/leitstand-purpose-registry.ts`, positioned
at the component it describes. Components SHALL be located via `data-purpose-id` anchors whose
values equal their registry keys. Deactivating the toggle SHALL remove the overlay without a
page reload. While the overlay is active, underlying write actions SHALL NOT be triggerable
through the overlay.

#### Scenario: Toggle shows in-situ explanations

- **GIVEN** the cockpit is rendered with the E3 zone shell
- **WHEN** the user activates the `[?]` toggle in the Statusband
- **THEN** an overlay appears showing the registry `zweck` text anchored at each component that
  carries a matching `data-purpose-id`

#### Scenario: Anchors and registry stay in sync

- **GIVEN** the purpose registry and the rendered shell
- **WHEN** the anchor guard runs
- **THEN** every registry key has a matching `data-purpose-id` anchor in the component sources
  and every anchor has a registry entry

### Requirement: Satellite Absorption Redirects

Absorbiert eine Etappe den Inhalt einer Satellitenseite in den Leitstand, stirbt die Seite und
ihr Pfad leitet auf die entsprechende Leitstand-Selektion um; Cockpit-Redirect-Ziele verwenden
ausschließlich das Leitstand-URL-Schema.

The system SHALL redirect absorbed satellite pages via the middleware redirect map:
`/sdlc/repohealth` → `/sdlc/cockpit?deck=qualitaet`, `/sdlc/prompts` →
`/sdlc/cockpit?deck=wissen`, `/sdlc/ki-konfiguration` → `/sdlc/cockpit?deck=ki`; the
corresponding `.astro` pages SHALL be removed and their modules (PromptLibraryManager,
KiKonfiguration) SHALL be reachable inside the respective decks. Every redirect-map target that
points at `/sdlc/cockpit` SHALL use only the Leitstand URL scheme (`station`, `ticket`, `deck`)
— no `?tab=` targets remain. Navigation sources SHALL NOT keep links to removed pages.

#### Scenario: Absorbed page redirects to its deck

- **GIVEN** a request to `/sdlc/repohealth`
- **WHEN** the middleware resolves the path
- **THEN** the response is a 301 redirect to `/sdlc/cockpit?deck=qualitaet`
- **AND** no page file `pages/sdlc/repohealth.astro` exists

#### Scenario: No stale tab vocabulary

- **GIVEN** the redirect map
- **WHEN** its cockpit-targeting entries are inspected
- **THEN** none of them contains a `tab=` query parameter

### Requirement: Print Report Stylesheet

Die Leitstand-Fläche besitzt eine helle Report-Darstellung ausschließlich für Druck/Export —
kein zweites interaktives Theme.

The system SHALL provide a light print/report rendition of the cockpit via
`styles/sdlc-leitstand.css`: an `@media print` block plus an explicit `.report` class that
applies the same light rendition on screen for export preview. The report rendition SHALL hide
interactive-only chrome (deck switcher, action slots, help toggle) and SHALL NOT introduce a
second interactive theme or a theme switcher.

#### Scenario: Print hides interactive chrome

- **GIVEN** the cockpit page
- **WHEN** it is rendered with the `.report` class (or printed)
- **THEN** deck switcher, action slots and the help toggle are not displayed
- **AND** status signals and KPI values remain readable on a light background
