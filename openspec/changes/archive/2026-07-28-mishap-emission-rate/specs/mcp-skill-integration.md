## ADDED Requirements

### Requirement: Mishap bundling emits fewer tickets than it consumes

The mishap buffer SHALL bundle into a ticket only once it holds at least `MISHAP_TRIGGER = 10`
entries, so that the number of Mishap-Bundle tickets a development cycle emits stays below the
number of cycles that clear them. A bundling threshold at or below the average per-cycle mishap
count makes the backlog non-convergent by construction: every bundle ticket requires its own
cycle, which emits the next bundle.

The `mishap-tracker` skill SHALL NOT force a flush at session end. The buffer is file-backed at
`.git/mishap-buffer.json` and survives session boundaries, so entries left in it are not lost.
The skill SHALL state this explicitly, so that a reader does not reinstate the forced flush out
of fear of data loss.

Bundling SHALL instead be driven periodically, independent of session boundaries.

#### Scenario: a session with fewer than ten mishaps emits no ticket

- **GIVEN** a development session that reports 3 mishaps and then ends
- **WHEN** the session finishes without an explicit flush
- **THEN** no Mishap-Bundle ticket is created and all 3 entries remain in
  `.git/mishap-buffer.json` for the next session

#### Scenario: the tenth entry triggers the bundle

- **GIVEN** a buffer holding 9 entries carried over from earlier sessions
- **WHEN** a tenth mishap is reported
- **THEN** one Mishap-Bundle ticket is created from the 10 entries and the buffer is emptied

#### Scenario: an explicit flush still works for a deliberate cut

- **GIVEN** a buffer holding fewer than 10 entries
- **WHEN** `flush_mishap_buffer` is called explicitly
- **THEN** a bundle ticket is created from whatever the buffer holds, unchanged from today
