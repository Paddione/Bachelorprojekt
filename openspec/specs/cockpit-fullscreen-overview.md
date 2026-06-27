# cockpit-fullscreen-overview


<!-- merged from change delta cockpit-fullscreen-overview.md on 2026-06-21 -->

## Purpose

### Requirement: ContainerDor.lastenheftLocked field

The system SHALL derive a `lastenheftLocked` boolean on `ContainerDor` from the ticket's
`readiness.lastenheft_locked` field so that UI components can render the correct label and
badge without accessing raw readiness data directly.

#### Scenario: Ticket with lastenheft_locked=true

- **GIVEN** a container ticket whose `readiness` object has `lastenheft_locked: true`
- **WHEN** `getContainerDor()` is called for that ticket
- **THEN** the returned `ContainerDor` has `lastenheftLocked === true`

#### Scenario: Ticket with lastenheft_locked=false or absent

- **GIVEN** a container ticket whose `readiness` object has `lastenheft_locked: false` or the field is absent
- **WHEN** `getContainerDor()` is called
- **THEN** the returned `ContainerDor` has `lastenheftLocked === false`

## Requirements

### Requirement: TicketSpecProgress checklist island

The system SHALL render a 10-point readiness checklist for container tickets on the
fullscreen ticket detail page, showing a green checkmark (✓) for met criteria and an
amber circle (○) for unmet criteria, with a header summarising `Fertig: X/10` and a
progress bar.

#### Scenario: Checklist reflects ticket readiness

- **GIVEN** a container ticket with a description, a locked Lastenheft, and a plan but no PR
- **WHEN** the `TicketSpecProgress` island renders
- **THEN** the items for "Beschreibung", "Lastenheft verriegelt", and "Plan vorhanden" are green
- **AND** the item for "PR erstellt" is amber
- **AND** the header reads `Fertig: X/10` where X matches the count of green items

#### Scenario: No checklist for non-container tickets

- **GIVEN** a ticket that is not a container type
- **WHEN** the fullscreen ticket detail page renders
- **THEN** no `TicketSpecProgress` island is present

### Requirement: Dynamic Pflichtenheft/Lastenheft label with lock badge

The system SHALL render the requirement-list section in `ContainerDorPanel` with a heading
that reads "Lastenheft" when the Lastenheft is locked and "Pflichtenheft" otherwise, plus a
colour-coded badge indicating the lock state, and an amber fallback when the list is empty.

#### Scenario: Locked Lastenheft shows green badge

- **GIVEN** a `ContainerDor` with `lastenheftLocked === true`
- **WHEN** `ContainerDorPanel` renders
- **THEN** the section heading is "Lastenheft"
- **AND** a green badge reading "🔒 verriegelt · KI-bereit" is visible

#### Scenario: Unlocked shows amber draft badge

- **GIVEN** a `ContainerDor` with `lastenheftLocked === false`
- **WHEN** `ContainerDorPanel` renders
- **THEN** the section heading is "Pflichtenheft"
- **AND** an amber badge reading "✏ Entwurf" is visible

#### Scenario: Empty requirements list shows warning

- **GIVEN** a `ContainerDor` whose requirements list is empty
- **WHEN** `ContainerDorPanel` renders
- **THEN** an amber warning "⚠ Keine Anforderungen erfasst" is shown instead of a blank panel

### Requirement: Fullscreen section ordering with spec progress island

The system SHALL render sections in the fullscreen ticket detail page in the following
canonical order: Beschreibung → TicketSpecProgress → ContainerDorPanel → TicketPlanPanel →
ContainerChildrenList → GrillingStepper → ProjectQuestionnairesPanel → Verknüpfungen →
Verlauf → Anhänge; and the page SHALL remain within 400 lines of code.

#### Scenario: Correct section order

- **GIVEN** a container ticket with all relevant data present
- **WHEN** the fullscreen detail page renders
- **THEN** `TicketSpecProgress` appears immediately after the description block
- **AND** `GrillingStepper` appears after `ContainerChildrenList`
- **AND** no component appears more than once (GrillingStepper count == 1, ProjectQuestionnairesPanel count == 1)
