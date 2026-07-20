## ADDED Requirements

### Requirement: Double-click on free floor always spawns a new figure

The board client SHALL spawn a new figure on every double-click on free floor,
regardless of the current selection state. The spawn/teleport decision SHALL be
implemented as a pure function `dblclickFloorAction()` in
`brett/src/client/board-dblclick.ts` (no module-global state; dependencies injected).

#### Scenario: Spawn with an active selection

- **GIVEN** a board with one spawned and selected figure
- **WHEN** the user double-clicks on free floor
- **THEN** a new figure is created at the clicked (snapped) position
- **AND** the previously selected figure keeps its position

#### Scenario: Double-click on an existing figure does not spawn

- **GIVEN** a board with at least one figure
- **WHEN** the user double-clicks on that figure
- **THEN** no new figure is created and the appearance drawer opens

### Requirement: Template routes resolve the brand from BRETT_BRAND

The server route `GET /api/templates` SHALL resolve the active brand from
`process.env.BRETT_BRAND` (falling back to `process.env.BRAND`, then `'mentolder'`),
consistent with `resolveBrand` in `auth.ts`.

#### Scenario: Brand-specific templates are returned

- **GIVEN** the server runs with `BRETT_BRAND=korczewski`
- **WHEN** a client requests `GET /api/templates`
- **THEN** coaching templates are listed for the brand `korczewski`

### Requirement: Template dropdown surfaces empty and error states

The lobby template dropdown SHALL show a disabled feedback option instead of an
unexplained empty list: "Keine Vorlagen vorhanden" when both template sources return
empty, and "Vorlagen konnten nicht geladen werden" when a template fetch fails.

#### Scenario: Fetch failure is visible

- **GIVEN** the template API returns an error
- **WHEN** the lobby settings panel renders
- **THEN** the dropdown contains a disabled option "Vorlagen konnten nicht geladen werden"

#### Scenario: Empty template list is visible

- **GIVEN** both template sources return empty lists
- **WHEN** the lobby settings panel renders
- **THEN** the dropdown contains a disabled option "Keine Vorlagen vorhanden"

### Requirement: All board selects share the token-based styling primitive

All native `<select>` elements in the board UI SHALL be styled through a shared
`styleSelect()` primitive in `brett/src/client/ui/primitives.ts` that applies the
`--brett-*` design tokens (ink background, fg text, line border, 8px radius, dark
options), used by `hud.ts`, `topbar-participants.ts` and `zone-editor.ts`.

#### Scenario: Language select uses the shared primitive

- **GIVEN** the HUD language select is mounted
- **WHEN** it renders
- **THEN** its styling is applied via `styleSelect()` with token-based values

### Requirement: Spawning without an open WebSocket surfaces feedback

When a figure is spawned while the WebSocket is not OPEN, the client SHALL show a
user-visible notice (`spawnOfflineNotice`) instead of silently keeping a local-only
figure that disappears on the next snapshot.

#### Scenario: Offline spawn shows a notice

- **GIVEN** the WebSocket connection is not open
- **WHEN** the user spawns a figure
- **THEN** a notice is shown that the figure is not yet synchronized
