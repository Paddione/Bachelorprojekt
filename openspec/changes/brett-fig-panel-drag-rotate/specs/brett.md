## Purpose

Ergänzt die Systembrett-Client-Interaktion (Parent-SSOT `brett`) um die bislang fehlende
Kernbedienbarkeit: Das Figuren-Menü (`#fig-panel`) wird zu einem am rechten Viewport-Rand
verankerten Edge-Drawer mit kontextuellem „Figur bearbeiten"-Tab, Figuren lassen sich als
Ganzes über die Bodenebene ziehen, und ihre Blickrichtung (`facingY`) ist frei in 360° um die
Y-Achse drehbar — per Ring-Drag und per Grad-Slider. Alle Änderungen sind rein client-seitig;
das bestehende `move`-Protokoll (x, z, facingY) trägt Position und Blickrichtung bereits und
bleibt unverändert.

## ADDED Requirements

### Requirement: Fig-panel edge-drawer with contextual edit tab

The system SHALL render the figure panel (`#fig-panel`) as a viewport-anchored edge-drawer that
is independent of the horizontally scrolling topbar, SHALL close the panel automatically whenever
a figure is placed (both the placing-mode click and the double-click spawn path), and SHALL show a
contextual edge-tab button that reopens the panel in edit mode while exactly one figure is
selected and the panel is closed. The existing close button, topbar toggle, and click-outside
behaviour SHALL remain functional.

#### Scenario: Panel is anchored to the viewport edge regardless of topbar scroll

- **GIVEN** the board is open on a narrow viewport where the topbar scrolls horizontally
- **WHEN** the figure panel is opened via the topbar toggle
- **THEN** the panel renders fixed to the right viewport edge below the topbar and stays visible while the topbar is scrolled

#### Scenario: Placing a figure via placing-mode auto-closes the panel

- **GIVEN** the figure panel is open and placing mode has been entered
- **WHEN** the user clicks the floor to place the figure and `addFigure` runs
- **THEN** the new figure is spawned and the panel is closed

#### Scenario: Double-click spawn auto-closes the panel

- **GIVEN** the figure panel is open
- **WHEN** the user double-clicks free floor and the double-click spawn path calls `addFigure`
- **THEN** the new figure is spawned and the panel is closed

#### Scenario: Edge-tab appears only when a figure is selected and the panel is closed

- **GIVEN** a figure is selected and the panel is closed
- **WHEN** the edge-tab visibility is synced
- **THEN** the "Figur bearbeiten" edge-tab is visible, and clicking it reopens the panel in the edit state; with no selection or an open panel the edge-tab is hidden

### Requirement: Whole-figure drag across the floor plane

The system SHALL let a user drag an entire unlocked figure across the floor plane by pressing on
its body mesh (a non-contact-point hit), moving the figure root under the cursor with a grab-offset
so the figure does not jump, and streaming the new position to other participants via throttled
`move` messages. The existing IK contact-point drag SHALL remain unchanged, and body-drag SHALL
pass through the same lock and freeze gates as the contact-point path (no new bypass).

#### Scenario: Pressing a figure body starts a body-drag with a stable grab-offset

- **GIVEN** an unlocked figure is on the board and the pointer is over its body mesh (not a contact sphere)
- **WHEN** the user presses the primary button
- **THEN** a `body`-kind drag starts, the figure is selected and locked, and the grab-offset between the floor hit and the figure root is captured so the figure does not snap to the cursor

#### Scenario: Moving during a body-drag repositions the root and throttles sync

- **GIVEN** a `body`-kind drag is active
- **WHEN** the pointer moves over the floor
- **THEN** the figure root x/z follow the floor hit minus the grab-offset, and `sendMove` is called at most about every 33 ms

#### Scenario: A locked figure cannot be body-dragged

- **GIVEN** a figure is locked by another user
- **WHEN** the user presses on its body
- **THEN** no drag starts and no `move` message is sent

### Requirement: Free 360-degree figure rotation

The system SHALL allow the selected figure to be rotated freely around the Y axis (its `facingY`
blick direction, radians, no snapping) both by dragging the selection ring and by a 0–360 degree
slider in the edit panel. Ring picking SHALL use a wider invisible hit region so the thin ring is
usable, including via touch. The rotation SHALL update `fig.root.rotation.y` and stream `facingY`
via throttled `move`; incoming `move` messages already apply `facingY`, so multi-user sync needs no
protocol change.

#### Scenario: Ring-drag rotates the figure freely around Y

- **GIVEN** a figure is selected and its selection ring is visible
- **WHEN** the user presses the ring's hit region and drags around the figure
- **THEN** a `rotate`-kind drag starts and `facingY` becomes the start facing plus the angular delta of the pointer around the figure root, updating `fig.root.rotation.y` and sending throttled `move`

#### Scenario: Panel slider sets an absolute facing in degrees

- **GIVEN** a figure is selected and the panel is in the edit state
- **WHEN** the user moves the 0–360 degree rotation slider
- **THEN** `facingY` is set to the slider value converted to radians and a `move` message is sent; opening the panel initialises the slider from the figure's current `facingY` in degrees

#### Scenario: Rotation is applied on the receiving client without protocol change

- **GIVEN** two participants share a room and one rotates a figure
- **WHEN** the `move` message with the new `facingY` arrives at the other client
- **THEN** the receiving client applies `facingY` to the figure root rotation using the existing move handler
