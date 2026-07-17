# brett — Delta (brett-vollausbau, T001931)

<!--
Zweck (deutsch): Das Systembrett soll die 18 Kernfunktionen professioneller
Online-Systembretter vollständig abdecken. Dieses Delta ergänzt die brett-SSOT-Spec
um die fehlenden bzw. nur teilweise vorhandenen Funktionen: verschiebbare Zonen/Rahmen,
nutzersteuerbare Transparenz, einen schaltbaren 2D/3D-Kameramodus mit Metaposition,
verdrahtete Perspektiv-/Dialogwechsel und Blickwinkelanzeiger, präzises Ausrichten per
Snapping, Mehrsprachigkeit (DE/EN/FR/ES) sowie verdecktes Arbeiten mit server-seitiger
rollenbasierter Filterung. Requirements und Scenarios sind konventionsgemäß englisch.
-->

## ADDED Requirements

### Requirement: Movable and reshapeable board zones

The system SHALL support leader-driven, persistent zones that can be moved, resized, re-labelled and re-styled after creation via a `zone_update` WebSocket message, and SHALL support a `variant` discriminator on `Zone` distinguishing a filled surface (`'filled'`) from an outline-only movable frame (`'frame'`). The `zone_update` message MUST be a member of `ADMIN_TYPES` and MUST additionally require the `leiter` role (or a Keycloak admin), matching the existing `zone_create`/`zone_delete` gating. Zone geometry (`x`, `z`, `width`, `height`, `radius`), `label`, `opacity` and `variant` ride the existing `brett_rooms.state` JSONB under the `__zones__` sentinel; no schema migration is introduced.

#### Scenario: Leiter moves and resizes a zone

- **GIVEN** a room with an existing zone `z1` and a client with role `leiter`
- **WHEN** the client sends `{type:'zone_update', zoneId:'z1', x:3, z:-1, width:4}`
- **THEN** the server updates only the supplied fields on `z1`, broadcasts the change to all other participants, and persists it under `__zones__`; unsupplied fields keep their previous values

#### Scenario: Non-leader zone_update is rejected

- **GIVEN** a room with an active session and a client whose role is `beobachter`
- **WHEN** the client sends a `zone_update` message
- **THEN** the server does not apply, broadcast or persist the mutation (admin-type gate denies it)

#### Scenario: Frame variant renders as an outline only

- **GIVEN** a zone created with `variant:'frame'`
- **WHEN** the client renders it
- **THEN** only the zone outline is drawn (no filled surface), producing a movable frame

---

### Requirement: User-controllable element transparency

The system SHALL allow the session leader to set the opacity of individual figures via an optional `Figure.opacity` field (range 0.2–1.0) carried on the existing `update` message, and SHALL allow zone opacity to be edited via `zone_update`. Figure opacity SHALL be applied at render time by traversing the figure's materials with `transparent = true`, and SHALL compose multiplicatively with selection auto-dim and moderation-dim so that moderation dimming remains visually dominant.

#### Scenario: Figure opacity is applied at render

- **GIVEN** a figure `f1` on the board
- **WHEN** the leader sets `f1.opacity` to `0.4` via an `update` message
- **THEN** the figure's materials render at effective opacity `0.4 × dimFactor`, and the value round-trips through persistence

#### Scenario: Opacity stays within bounds

- **GIVEN** an opacity slider in the figure panel
- **WHEN** the user drags it
- **THEN** the emitted `opacity` value is clamped to the inclusive range 0.2–1.0

---

### Requirement: Switchable 2D/3D camera and figure perspectives

The client SHALL provide a per-client, non-shared camera-mode toggle between the perspective/orbit camera and a top-down orthographic 2D view, and SHALL support figure-bound perspectives: a first-person inner view and a `meta` bird's-eye view of the possessed figure. The dormant `switchPov` capability SHALL be wired to a POV panel that lists the other figures and switches the inner view on click, including a two-figure A/B dialog mode that alternates the inner view between the two selected figures. A viewing-cone indicator SHALL optionally visualise each figure's `facingY` orientation. All of these are client-local view state and introduce no new server messages; possession continues to use the existing `figure_possess`/`figure_release` messages.

#### Scenario: Toggle to 2D top-down and back

- **GIVEN** a booted board in the default perspective view
- **WHEN** the user activates the 2D camera-mode toggle
- **THEN** the scene renders through a top-down orthographic camera, figure picking and dragging keep working, and toggling again restores the perspective/orbit view

#### Scenario: Meta position shows the possessed figure from above

- **GIVEN** a user possessing figure `f1` in the inner view
- **WHEN** the user switches to `meta` mode in the POV panel
- **THEN** the camera positions above and slightly behind `f1` and looks down at it

#### Scenario: Dialog A/B mode alternates the inner view

- **GIVEN** two figures selected as dialog partners A and B in the POV panel
- **WHEN** the user triggers the dialog switch
- **THEN** the inner view alternates between figure A and figure B on each activation via `switchPov`

#### Scenario: Viewing cone follows facing

- **GIVEN** the viewing-cone indicator is enabled
- **WHEN** a figure's `facingY` changes through a `move` or `update`
- **THEN** the cone at that figure's base re-orients to the new facing direction

---

### Requirement: Precise placement via snapping and alignment guides

The client SHALL provide an optional magnet mode that, while active, snaps figure drag positions to a fixed grid and shows temporary alignment guides when a dragged figure's X or Z coordinate is within a small threshold of another figure's axis, snapping onto that axis. Snapping SHALL be purely client-side; the final position is synchronised through the existing `move` message and the same drag hook serves both mouse and touch input.

#### Scenario: Drag snaps to the grid when magnet mode is on

- **GIVEN** magnet mode is enabled
- **WHEN** the user drags a figure and releases it near a grid intersection
- **THEN** the figure's position is snapped to the nearest grid step before the `move` message is emitted

#### Scenario: Alignment guide appears near another figure's axis

- **GIVEN** magnet mode is enabled and a second figure exists
- **WHEN** the dragged figure's X coordinate comes within the alignment threshold of the other figure's X
- **THEN** a temporary guide line is shown and the dragged figure snaps onto that shared X axis

---

### Requirement: Multilingual UI (DE/EN/FR/ES)

The client SHALL provide a lightweight in-house internationalisation layer with a `t(key)` lookup, a `setLang(lang)` switch and an `applyTranslations` pass over `data-i18n` attributes, backed by one dictionary per language for German, English, French and Spanish. The active language SHALL be resolved from `localStorage` (`brett_lang`) with a fallback to `navigator.language` and finally German, and SHALL keep `document.documentElement.lang` in sync. A key missing in the active language SHALL fall back to the German dictionary, and a key missing everywhere SHALL return the key itself.

#### Scenario: Language switch re-renders the main UI

- **GIVEN** the board UI rendered in German
- **WHEN** the user selects French in the language switcher
- **THEN** all `data-i18n` labelled elements re-render in French, `brett_lang` is persisted as `fr`, and `document.documentElement.lang` becomes `fr`

#### Scenario: Missing key falls back deterministically

- **GIVEN** a translation key absent from the French dictionary but present in German
- **WHEN** `t(key)` is called with French active
- **THEN** the German value is returned; if the key is absent in every dictionary, the key string itself is returned

---

### Requirement: Covert work with server-side role-filtered hidden figures

The system SHALL allow the session leader to hide and reveal individual figures via a `figure_hide_set` WebSocket message (a member of `ADMIN_TYPES`, `leiter`-only) that toggles an optional `Figure.hidden` flag. Hidden figures MUST be filtered at the broadcast and snapshot boundary per recipient role: a non-leader recipient (`stellvertreter`, `beobachter`, `gast`, `zuschauer`) SHALL never receive a hidden figure in a `snapshot`, and SHALL never receive mutations targeting a hidden figure. A hide transition SHALL be translated to a `delete` for non-leader recipients and a reveal transition to an `add`, so no hidden figure data ever reaches a read-only or non-leader client. The leader SHALL continue to receive hidden figures and render them semi-transparently with a distinguishing badge. Filtering SHALL occur exclusively at the broadcast/snapshot edge; `hidden` is otherwise ordinary figure state for undo/redo, replay and persistence.

#### Scenario: Leader sees hidden figures, non-leaders do not

- **GIVEN** a room with figure `f1` marked `hidden` and five clients — one `leiter`, one `stellvertreter`, one `beobachter`, one `gast` and one `zuschauer`
- **WHEN** each client requests or receives a `snapshot`
- **THEN** only the `leiter` snapshot contains `f1`; the `stellvertreter`, `beobachter`, `gast` and `zuschauer` snapshots omit it entirely

#### Scenario: Hiding translates to a delete for non-leaders

- **GIVEN** a visible figure `f1` and connected non-leader clients
- **WHEN** the leader sends `{type:'figure_hide_set', figureId:'f1', hidden:true}`
- **THEN** non-leader clients receive a `delete` for `f1` while the leader receives the hidden-state change and keeps rendering `f1`

#### Scenario: Revealing translates to an add for non-leaders

- **GIVEN** a hidden figure `f1`
- **WHEN** the leader sends `{type:'figure_hide_set', figureId:'f1', hidden:false}`
- **THEN** non-leader clients receive an `add` carrying `f1`, restoring it to their boards

#### Scenario: Mutations on a hidden figure are not relayed to non-leaders

- **GIVEN** a hidden figure `f1`
- **WHEN** the leader moves or updates `f1`
- **THEN** the mutation is applied and persisted server-side and relayed to the leader, but is suppressed for every non-leader recipient
