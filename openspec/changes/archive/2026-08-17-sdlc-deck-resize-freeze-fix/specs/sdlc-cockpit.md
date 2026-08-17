## ADDED Requirements

### Requirement: Deck scroll container reserves a stable scrollbar gutter

The Z5 deck body — being both the CSS query container for deck content and the
vertical scroll container — SHALL reserve a stable scrollbar gutter
(`scrollbar-gutter: stable`), so that the appearance or disappearance of a
classic scrollbar does not change the container's inline size. This prevents a
layout feedback loop in which the scrollbar toggles the `@container` compact
breakpoint, which changes content height, which toggles the scrollbar again.

#### Scenario: Resizing through the compact breakpoint does not oscillate

- **GIVEN** the deck strip is being resized across the compact breakpoint with overflowing deck content
- **WHEN** the vertical scrollbar of the deck body would appear or disappear
- **THEN** the deck body's inline size is unaffected (the gutter is reserved permanently)
- **AND** the layout settles without oscillation or renderer stalls
