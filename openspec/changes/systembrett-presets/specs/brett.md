## ADDED Requirements

### Requirement: Fresh rooms auto-seed the brand default scenario

The system SHALL auto-load the brand default board template when the first
client joins a room that has NO persisted `brett_rooms` row.

#### Scenario: First join on a fresh room

- **GIVEN** no `brett_rooms` row exists for the room
- **WHEN** the first client joins
- **THEN** the room state contains the full figure constellation of the brand
  default template (mentolder: Familiensystem 4 Personen), staged with
  positions, colors, outfits/faces and poses

#### Scenario: Intentional clear is respected

- **GIVEN** a `brett_rooms` row exists with an empty figure set
- **WHEN** a client joins
- **THEN** the board stays empty — no re-seeding occurs

### Requirement: System scenarios are fully staged

The system SHALL store system board templates with expressive figure
configurations: positions, colors, outfits/faces, poses, plus zones/anchors
and board mood — instead of identical grey mannequins differing only in
position and label.

#### Scenario: Applying a system scenario

- **GIVEN** a system scenario with full staging (e.g. Team-Konflikt with
  opposed groups, distinct colors and poses, zones)
- **WHEN** the leiter applies it (manually or via reset-to-default)
- **THEN** figures, zones, anchors and board mood appear exactly as staged

### Requirement: Leiter can reset to the startup default

The system SHALL offer the leiter an explicit path back to the startup
default scenario (clear + re-seed with the brand default).

#### Scenario: Reset to default

- **GIVEN** a room with a modified or cleared board
- **WHEN** the leiter triggers reset-to-default
- **THEN** the board shows the brand default constellation again

### Requirement: Board template seeding is idempotent

The system SHALL seed board templates idempotently: stable identifiers, a
real conflict target, and no duplicate system rows across server restarts;
existing duplicates are removed by the seeding migration.

#### Scenario: Server restart

- **GIVEN** the three system templates already exist
- **WHEN** the server restarts and migrations re-run
- **THEN** no additional duplicate system template rows are created
