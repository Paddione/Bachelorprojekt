## ADDED Requirements

### Requirement: Z5 deck strip is user-resizable with content autoscaling

The Z5 Deck-Leiste SHALL provide a resize handle on its left edge that lets the user
drag the strip wider or narrower. The handle SHALL use Pointer Events with pointer
capture (not the HTML5 drag-and-drop API), consistent with the Leitstand drag
convention. The width SHALL be applied through a CSS custom property consumed by the
`.ls-main` grid column and clamped to a sane range (minimum 240px, maximum 640px,
default 320px). Because the deck body is a CSS query container, deck content SHALL
adapt automatically to the chosen width (single-column below the compact breakpoint,
multi-column above it). The chosen width SHALL persist across reloads via
localStorage, a double-click on the handle SHALL reset it to the default, and the
handle SHALL be keyboard-operable as a `separator` with arrow keys and
`aria-valuenow`/`-valuemin`/`-valuemax`. On stacked mobile layouts the handle SHALL
not be operable.

#### Scenario: Dragging the handle resizes the deck strip

- **GIVEN** the Leitstand is open on a desktop viewport
- **WHEN** the user drags the deck resize handle to the left
- **THEN** the deck column widens accordingly, clamped between 240px and 640px
- **AND** the deck content re-layouts via its container queries (multi-column once past the compact breakpoint)

#### Scenario: Width persists and resets

- **GIVEN** the user resized the deck strip and reloads the page
- **WHEN** the Leitstand mounts
- **THEN** the persisted width is applied (clamped)
- **AND** a double-click on the handle restores the 320px default

#### Scenario: Keyboard resize

- **GIVEN** the resize handle has keyboard focus
- **WHEN** the user presses the left or right arrow key
- **THEN** the deck width changes by a fixed step within the clamp range
- **AND** the handle exposes `role="separator"` with current/min/max values
