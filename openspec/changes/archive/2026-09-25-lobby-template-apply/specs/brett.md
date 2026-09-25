# Delta: lobby-template-apply (T900361)

## ADDED Requirements

### Requirement: Lobby preset selection applies the board template
The manual board-template path (lobby dropdown as leiter) must work end to
end: selection sends the admin message, the server gate routes it, the
template is applied, and unknown ids produce sender-visible feedback.

#### Scenario: Leiter selects a system scenario in the lobby
- **GIVEN** a leiter has the lobby board-template dropdown open
- **WHEN** they select a system scenario (e.g. Familiensystem)
- **THEN** the client sends `admin_set_board_template` with the template id
- **AND** the server applies the template state (figures, zones, anchors, lines, optik)

#### Scenario: Unknown template id
- **GIVEN** a leiter triggers `admin_set_board_template` with an unknown id
- **WHEN** the server cannot resolve the template
- **THEN** the server sends `{ type: 'error', reason: 'unknown-board-template' }` to the sender
- **AND** the client shows the toast `Vorlage nicht gefunden.`
