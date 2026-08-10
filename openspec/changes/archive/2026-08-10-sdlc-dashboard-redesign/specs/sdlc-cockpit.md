## ADDED Requirements

### Requirement: Command Bar — Persistentes Status-Band

The system SHALL render a persistent Command Bar at the top of the SDLC Cockpit that remains visible regardless of the active view mode. The Command Bar SHALL display cluster health status, watchdog state, active agent count, slot usage, pending PR count, and the next factory tick countdown. It SHALL also host the Overview/Fokus mode toggle.

#### Scenario: Command Bar is always visible

- **GIVEN** the SDLC Cockpit page is loaded
- **WHEN** any view mode (Overview or Fokus) is active
- **THEN** the Command Bar is rendered and visible at the top of the page
- **AND** it displays at minimum: cluster health indicator, active agent count, and slot usage

#### Scenario: Cluster health is derived from k3d status

- **GIVEN** the local k3d cluster `mentolder-dev` is running
- **WHEN** the Command Bar fetches cluster status
- **THEN** it shows a green indicator with the cluster name
- **AND** when the cluster is unreachable, it shows a red indicator with an error message

#### Scenario: Overview/Fokus toggle switches the main area

- **GIVEN** the Command Bar is rendered with the Overview mode active
- **WHEN** the user clicks the Fokus toggle
- **THEN** the main area switches to Fokus mode
- **AND** the toggle state is reflected in the URL as a query parameter

### Requirement: Overview-Modus — Lifecycle-Status auf einen Blick

The system SHALL provide an Overview mode that aggregates the status of all SDLC lifecycle phases into a single dashboard view. Each phase SHALL display its ticket count by status. The view SHALL also show an Attention section aggregating blocked tickets, stuck tickets (idle > 30 minutes), and active cooldowns. A PR section SHALL list open pull requests with their CI status.

#### Scenario: All phases are displayed with counts

- **GIVEN** tickets exist in various lifecycle phases
- **WHEN** the Overview mode is active
- **THEN** each phase (Triage, Planung, Bauen, Review, Deploy, Ship) is shown
- **AND** each phase displays the count of tickets in that phase
- **AND** phases with zero tickets are still visible

#### Scenario: Attention section highlights blockers

- **GIVEN** tickets T003120 is blocked and T003119 is stuck (idle > 45min)
- **WHEN** the Overview mode is active
- **THEN** the Attention section shows both tickets
- **AND** blocked tickets are visually distinct from stuck tickets
- **AND** a cooldown on any provider is shown if active

#### Scenario: PR section lists open pull requests

- **GIVEN** open pull requests exist on GitHub for the repository
- **WHEN** the Overview mode is active
- **THEN** the PR section lists them with title, branch, and CI status

### Requirement: Fokus-Modus — Drilldown in eine SDLC-Phase

The system SHALL provide a Fokus mode that drills into a single SDLC lifecycle phase, rendering the content relevant to that phase. The phase selection SHALL be reflected in the URL. The Fokus mode SHALL reuse existing Svelte components where applicable (FactoryFloor for Bauen, PlanningOffice for Planung).

#### Scenario: Fokus mode renders the selected phase content

- **GIVEN** the Fokus mode is active and the "Bauen" phase is selected
- **WHEN** the view is rendered
- **THEN** the FactoryFloor component is displayed as the main content
- **AND** the URL carries `?mode=fokus&phase=bauen`

#### Scenario: Switching phases in Fokus mode updates content and URL

- **GIVEN** Fokus mode is active showing the "Planung" phase
- **WHEN** the user selects the "Bauen" phase
- **THEN** the main content switches to FactoryFloor
- **AND** the URL updates to reflect the new phase

### Requirement: Kontext-sensitive lebendige Rail

The system SHALL render a rail (sidebar) whose content adapts to the active mode and phase. In Overview mode, the rail SHALL show aggregated Attention data, running Epics, active Agents, and Model health. In Fokus mode, the rail SHALL show context-relevant data for the active phase (e.g., Factory status in Bauen, DoR scores in Planung, trace data in Insights). All rail content SHALL be populated from live data sources via the adapter, not from static HTML.

#### Scenario: Rail content changes with mode

- **GIVEN** the Overview mode is active
- **WHEN** the rail is rendered
- **THEN** it shows sections for Attention, Epics, Agents, and Models
- **AND** all sections contain live data (not static text)

#### Scenario: Rail content adapts to Fokus phase

- **GIVEN** Fokus mode is active and "Bauen" phase is selected
- **WHEN** the rail is rendered
- **THEN** it shows Factory-relevant data: slot usage, active workpieces, agent logs
- **AND** when switching to "Planung" phase, it shows DoR scores and queue depth

### Requirement: Unified Panel System

The system SHALL render all panels (rail panels and workspace panels) through a single panel system that supports both the legacy Kit panel runtime and Svelte components as first-class panel types. The PipelinePanel wrapper component SHALL be removed. A Svelte component SHALL be registrable as a panel without needing a protective wrapper.

#### Scenario: Svelte components are registered as native panels

- **GIVEN** a Svelte component (e.g., FactoryFloor) is registered as a panel
- **WHEN** the panel system initializes
- **THEN** the component is mounted into the panel frame without a PipelinePanel wrapper
- **AND** the panel's lifecycle (refresh, resize, destroy) works correctly

#### Scenario: The Panel.run() method no longer adopts the Svelte area

- **GIVEN** the panel system is initialized
- **WHEN** `Panel.run()` scans the DOM for `[data-panel-type]` elements
- **THEN** it does not clear the content of Svelte-registered panels
- **AND** Svelte panels are registered before the auto-initialization scan

### Requirement: Insights-Tab mit Trace-Recording

The system SHALL provide an Insights area accessible from both Overview and Fokus modes. The Insights area SHALL display meaningful metrics (not the previous bloated analytics KPIs) and SHALL record agent decision traces, factory run results, and partial plan outcomes for downstream finetuning use.

#### Scenario: Insights area is accessible from the Command Bar

- **GIVEN** the Command Bar is rendered
- **WHEN** the user clicks the Insights button
- **THEN** the Insights area is displayed
- **AND** it shows metrics that are computed from actual data (not the old Throughput/Heatmap/ShippedBar components)

#### Scenario: Trace recording captures agent actions

- **GIVEN** the factory executes a partial plan
- **WHEN** the execution completes
- **THEN** the outcome is recorded as a trace entry
- **AND** the trace entry includes: agent model, ticket ID, phase, duration, and result

### Requirement: Wählbare Default-Ansicht

The system SHALL allow the user to set their preferred default view (Overview or a specific Fokus phase) and SHALL persist this preference in localStorage. The preference SHALL be applied on page load.

#### Scenario: Default view preference is persisted

- **GIVEN** the user sets their default view to "Planung" phase in Fokus mode
- **WHEN** the page is reloaded
- **THEN** the Cockpit opens with the "Planung" phase active
- **AND** the preference is stored in localStorage under a versioned key

#### Scenario: Unknown or missing preference falls back to Overview

- **GIVEN** no default view preference is stored, or the stored value is corrupt
- **WHEN** the page is loaded
- **THEN** the Overview mode is displayed

### Requirement: Mobile Bottom-Sheet + Swipe-Navigation

The system SHALL render the phase navigation as a bottom sheet on mobile viewports. Users SHALL be able to swipe between Overview and Fokus phase views. Non-reversible actions SHALL be locked by default on mobile as per the existing session-lock requirement.

#### Scenario: Mobile renders bottom sheet for phase navigation

- **GIVEN** the viewport width is below 768px
- **WHEN** the Cockpit is loaded
- **THEN** the phase navigation is rendered as a bottom sheet
- **AND** the Command Bar remains visible as a top bar

#### Scenario: Swipe navigation between views

- **GIVEN** the mobile view is showing the Overview
- **WHEN** the user swipes left
- **THEN** the next Fokus phase is displayed
- **AND** the URL updates to reflect the transition

## MODIFIED Requirements

### Requirement: Layout Engine Surface Organization

Das Cockpit organisiert seine Fläche als Command Bar plus Hauptfläche mit zwei Modi (Overview/Fokus), nicht als zweispaltiges Rail+Workspace-Layout mit statischen Rail-Gruppen. Die Rail ist nicht mehr statisch, sondern kontext-sensitiv — sie ändert ihren Inhalt je nach aktivem Modus und Phase.

The system SHALL organize the cockpit surface as a Command Bar (top) plus a main area with exactly two modes — Overview and Fokus — and a context-sensitive rail. The rail contents SHALL adapt to the active mode and phase rather than being a fixed, immutable list of four groups.

#### Scenario: Surface layout is Command Bar + main area + rail

- **GIVEN** the cockpit is loaded
- **WHEN** the layout engine computes the placement
- **THEN** the Command Bar is at the top spanning full width
- **AND** the main area occupies the center
- **AND** the rail is on the side with context-sensitive content

#### Scenario: Rail groups are no longer a fixed immutable list

- **GIVEN** the layout engine is loaded
- **WHEN** the active phase changes from "Bauen" to "Planung"
- **THEN** the rail content changes to reflect the new phase context
- **AND** the old spec's four-group immutable list constraint no longer applies

### Requirement: Pipeline-Inhalt lebt als Panel im Cockpit

Die Fläche `/admin/cockpit` SHALL den `DevStatusTabs`-Baum durch die Command-Bar + Overview/Fokus-Architektur ersetzen. Der `PipelinePanel`-Wrapper entfällt, da das Unified Panel System Svelte-Komponenten nativ unterstützt.

#### Scenario: PipelinePanel wrapper is removed

- **GIVEN** the repository after this change
- **WHEN** the component files are inspected
- **THEN** `PipelinePanel.svelte` no longer exists
- **AND** no component imports from `PipelinePanel.svelte`

#### Scenario: Tab pre-selection survives the architectural change

- **GIVEN** a request to `/admin/cockpit?mode=fokus&phase=planung`
- **WHEN** the page is rendered
- **THEN** the Fokus mode is active with the Planung phase selected

### Requirement: Genau eine SDLC-Fläche im Admin-Menü (E1/E2)

Das Admin-Menü SHALL weiterhin genau einen Eintrag auf die SDLC-Fläche führen. Der Eintrag zeigt auf `/admin/cockpit` (statt `/sdlc/cockpit`), um die Spec-Konvention zu erfüllen.

#### Scenario: Cockpit URL is /admin/cockpit

- **GIVEN** the admin sidebar navigation is rendered
- **WHEN** the cockpit entry is inspected
- **THEN** it targets `/admin/cockpit`
- **AND** the old `/sdlc/cockpit` path redirects to `/admin/cockpit`

## REMOVED Requirements

<!--
  [T003130] Dieser Abschnitt war beim Archivieren leer zu raeumen. Er trug drei
  Blöcke, deren Ziele im SSOT `openspec/specs/sdlc-cockpit.md` nie als eigene
  Requirement existierten — `archive` bricht dann fail-closed ab
  ("REMOVED target … not found"):

    - "PipelinePanel als Schutzschild gegen Kit-Runtime (E22)" — E22 ist kein
      eigener Requirement-Titel, sondern eine Zusicherung INNERHALB von
      "Pipeline-Inhalt lebt als Panel im Cockpit". Diese Requirement fuehrt das
      Delta bereits unter MODIFIED und beschreibt dort den Wegfall des Wrappers
      samt Szenario — der REMOVED-Block war reine Doppelung.
    - "Sieben Tabs in DevStatusTabs"
    - "Alte Analytics-KPIs"

  Die letzten beiden beschrieben Code-Zustaende, die nie spezifiziert waren: die
  vier Analytics-Komponenten und die Tab-Zahl standen in keinem SSOT-Spec. Ihr
  Wegfall ist durch die Guards in tests/spec/sdlc-cockpit/redesign-struktur.bats
  abgesichert, nicht durch eine Anforderung. Ein REMOVED-Block kann nur
  aufheben, was zuvor zugesichert war.
-->
