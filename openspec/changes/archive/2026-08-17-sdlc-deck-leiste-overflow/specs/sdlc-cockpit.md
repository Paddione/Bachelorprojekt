## ADDED Requirements

### Requirement: Z5 deck content adapts to container width without horizontal overflow

The Z5 Deck-Leiste SHALL render its deck content without horizontal overflow at any
viewport width. The deck body SHALL be a CSS query container
(`container-type: inline-size`), and full-width components embedded in a deck
(ControlPanel, FactoryObservability, FactoryBudgetPage) SHALL switch to single-column
compact layouts via `@container` rules when the container is narrow, instead of
relying on viewport media queries that never match on desktop.

#### Scenario: Platform deck fits the deck column on desktop

- **GIVEN** the Leitstand is open on a desktop viewport with the Plattform deck active
- **WHEN** the Z5 deck strip renders ControlPanel, FactoryObservability and FactoryBudgetPage
- **THEN** the deck body element is a CSS query container (`container-type: inline-size`)
- **AND** each embedded component carries an `@container` rule collapsing its grid to a single column in narrow containers
- **AND** no horizontal page overflow is produced by the deck strip

#### Scenario: Compact rules stay scoped to deck containers

- **GIVEN** a component with `@container` compact rules
- **WHEN** it is rendered outside any element with `container-type`
- **THEN** the compact rules are inert and the component keeps its full-width layout
