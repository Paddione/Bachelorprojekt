## ADDED Requirements

### Requirement: schedule.sh holds back tickets with open blockers

The scheduling pipeline SHALL actually withhold a candidate whose `depends_on` predecessors
are not all `done`. The blocker gate in `scripts/factory/schedule.sh` SHALL resolve the
blocking ids from the ticket's `depends_on` array and skip the candidate while any
predecessor has a status other than `done`. A ticket whose blockers are all done SHALL
proceed to scheduling normally.

#### Scenario: open blocker holds the ticket back

- **GIVEN** a backlog candidate whose `depends_on` contains an open (not done) ticket
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate is skipped and not claimed for dispatch

#### Scenario: satisfied blockers let the ticket proceed

- **GIVEN** a backlog candidate whose `depends_on` predecessors are all `done`
- **WHEN** `scripts/factory/schedule.sh` evaluates the candidate
- **THEN** the candidate proceeds through the scheduling gates
