## MODIFIED Requirements

### Requirement: schedule.sh holds back tickets with open blockers

The scheduling pipeline SHALL actually withhold a candidate whose `depends_on` predecessors
are not all finished. The blocker gate in `scripts/factory/schedule.sh` SHALL resolve the
blocking ids from the ticket's `depends_on` array and skip the candidate while any
predecessor has a status other than `done` or `archived` — an archived predecessor is
finished work and SHALL satisfy the gate. A dangling reference (a `depends_on` entry whose
ticket row no longer exists) SHALL NOT block the candidate: a deleted predecessor can never
reach `done`, and blocking on it would wedge the candidate forever; the gate SHALL emit a
WARN naming the dangling ids instead. Every block SHALL emit a WARN line naming the
candidate and its open blockers, so a held ticket never disappears silently. A candidate
without `depends_on` (empty or NULL array) SHALL proceed normally — an absent dependency
is not a blocker.

#### Scenario: open blocker holds the ticket back

- **GIVEN** a backlog candidate whose `depends_on` contains an open (not done) ticket
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate is skipped and not claimed for dispatch

#### Scenario: satisfied blockers let the ticket proceed

- **GIVEN** a backlog candidate whose `depends_on` predecessors are all `done`
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate proceeds through the scheduling gates

#### Scenario: archived blocker satisfies the gate

- **GIVEN** a backlog candidate whose `depends_on` predecessors are all `archived`
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate proceeds through the scheduling gates

#### Scenario: dangling predecessor does not wedge the candidate

- **GIVEN** a backlog candidate whose `depends_on` contains an external_id with no
  matching ticket row
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate is not blocked by that reference, and a WARN names the dangling
  id

#### Scenario: every block emits a WARN with the blocker list

- **GIVEN** a candidate held back by open blockers
- **WHEN** `scripts/factory/schedule.sh` skips the candidate
- **THEN** the schedule output contains a WARN line naming the candidate id and the open
  blocker ids

#### Scenario: candidate without depends_on proceeds

- **GIVEN** a backlog candidate whose `depends_on` is empty or NULL
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate is not treated as blocked and proceeds through the scheduling
  gates
