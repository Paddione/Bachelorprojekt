## MODIFIED Requirements

### Requirement: Z5 deck strip is user-resizable with content autoscaling

The Z5 Deck-Leiste SHALL provide a resize handle on its left edge that lets the user
drag the strip wider or narrower. The handle SHALL use Pointer Events with pointer
capture (not the HTML5 drag-and-drop API), consistent with the Leitstand drag
convention. The handle SHALL remain visible, hit-testable and focusable regardless of
the deck body's scroll position: the deck body — not the strip root — SHALL be the
vertical scroll container, so the handle lives outside the overflow box. The dragged
width SHALL be derived from the strip's own geometry (its right edge), not from
`window.innerWidth`, so the edge tracks the pointer exactly even when a page
scrollbar is present. The width SHALL be applied through a CSS custom property
consumed by the `.ls-main` grid column and clamped to a sane range (minimum 240px,
maximum 640px, default 320px). Because the deck body is a CSS query container, deck
content SHALL adapt automatically to the chosen width. The chosen width SHALL persist
across reloads via localStorage, a double-click on the handle SHALL reset it to the
default, and the handle SHALL be keyboard-operable as a `separator` with arrow keys
and `aria-valuenow`/`-valuemin`/`-valuemax`. On stacked mobile layouts the handle
SHALL not be operable.

#### Scenario: Dragging the handle resizes the deck strip

- **GIVEN** the Leitstand is open on a desktop viewport
- **WHEN** the user drags the deck resize handle to the left
- **THEN** the deck column widens accordingly, clamped between 240px and 640px
- **AND** the dragged edge follows the pointer exactly, including when a vertical page scrollbar is visible
- **AND** the deck content re-layouts via its container queries (multi-column once past the compact breakpoint)

#### Scenario: Handle stays reachable while the deck content scrolls

- **GIVEN** a deck whose body overflows and is scrolled down
- **WHEN** the user moves the pointer to the strip's left edge or tabs to the handle
- **THEN** the handle is still rendered at the strip's full height, hit-testable across its whole hit zone, and focusable

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
